"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  // eslint-disable-next-line no-var
  var __marhabaAudioCtx: AudioContext | undefined;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const W = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = W.AudioContext ?? W.webkitAudioContext;
  if (!Ctor) return null;
  if (!globalThis.__marhabaAudioCtx) {
    globalThis.__marhabaAudioCtx = new Ctor();
  }
  return globalThis.__marhabaAudioCtx;
}

/**
 * Drive a 0..1 amplitude value from an audio MediaStream — the orb's outer
 * ring scales off this so it feels alive while listening + speaking.
 *
 * Implementation notes:
 * - One shared AudioContext (`globalThis.__marhabaAudioCtx`) so React Strict
 *   Mode doesn't multiply contexts.
 * - The context starts in "suspended" state on Safari until a user gesture;
 *   the orb's tap satisfies that. We resume() lazily.
 * - We intentionally use the WebRTC `MediaStream` rather than the `<audio>`
 *   element. createMediaStreamSource works with `srcObject` streams in
 *   modern Chromium/Safari/Firefox; createMediaElementSource against a
 *   `srcObject` audio element is flaky on Safari.
 * - We do NOT connect the analyser to ctx.destination — that would
 *   double-route the audio and cause feedback. Analysis is silent.
 * - Returns 0 when stream is null or `enabled` is false. prefers-reduced-
 *   motion callers should pass enabled=false.
 */
export function useAudioReactive(
  stream: MediaStream | null,
  enabled: boolean,
): number {
  const [amp, setAmp] = useState(0);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!enabled || !stream) {
      setAmp(0);
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }

    let cancelled = false;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
    } catch (err) {
      console.debug("[useAudioReactive] analyser setup failed", err);
      return;
    }

    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      if (cancelled) return;
      const a = analyserRef.current;
      if (!a) return;
      a.getByteTimeDomainData(data);
      // RMS over the buffer; data is 0..255 with 128 = silence.
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);
      // Boost so quiet speech still moves the ring; clamp to keep the visual
      // from going wild on loud peaks.
      const eased = Math.min(1, rms * 4);
      setAmp(eased);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.disconnect();
      } catch {}
      try {
        analyserRef.current?.disconnect();
      } catch {}
      sourceRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, enabled]);

  return amp;
}
