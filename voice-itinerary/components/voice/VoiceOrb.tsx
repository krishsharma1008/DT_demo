"use client";

import { Mic, Loader2, PowerOff } from "lucide-react";
import { useVoiceStore } from "@/lib/store/voice";
import { useAudioReactive } from "@/lib/voice/useAudioReactive";
import { useVoiceSession } from "./VoiceSessionProvider";

/**
 * primary — large sun with status line (concierge column)
 * fab     — fixed bottom-right (share page)
 * dock    — compact, inline (mobile bottom dock)
 */
type Variant = "primary" | "fab" | "dock";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * VoiceOrb is purely presentational: a gold sun with a halo and corona.
 * The connection itself lives in VoiceSessionProvider (in app/layout.tsx) so
 * the WebRTC session survives route changes. The orb renders the current
 * state and forwards tap → connect / disconnect. Its glow, corona and sonar
 * rings react to live mic / speaker amplitude.
 */
export function VoiceOrb({
  variant = "primary",
  size,
}: { variant?: Variant; size?: number } = {}) {
  const session = useVoiceSession();
  const { conn, hint, micStream, remoteStream, connect, disconnect } = session;

  const reduced =
    typeof window !== "undefined" ? prefersReducedMotion() : false;
  const isLive = conn === "active";
  const voiceState = useVoiceStore((s) => s.state);
  const isSpeaking = voiceState === "speaking";

  const micAmp = useAudioReactive(
    micStream,
    !reduced && isLive && !isSpeaking,
  );
  const remoteAmp = useAudioReactive(remoteStream, !reduced && isSpeaking);
  const amp = isSpeaking ? remoteAmp : micAmp;

  const handlePress = () => {
    if (conn === "active" || conn === "connecting" || conn === "reconnecting") {
      return;
    }
    void connect();
  };

  const handleEndSession = () => {
    void disconnect();
  };

  const isBusy = conn === "connecting" || conn === "reconnecting";
  const Icon = isBusy ? Loader2 : Mic;

  const isFab = variant === "fab";
  const isDock = variant === "dock";
  const orbSize = size ?? (isDock ? 52 : isFab ? 84 : 220);
  const iconSize =
    orbSize <= 60 ? "h-5 w-5" : orbSize <= 110 ? "h-6 w-6" : orbSize <= 180 ? "h-9 w-9" : "h-11 w-11";

  const bodyScale = 1 + amp * 0.05;
  const iconScale = 1 + amp * 0.08;
  const sonarActive =
    isLive && (voiceState === "listening" || voiceState === "speaking");
  const orbAmp = sonarActive ? Math.max(0.25, amp) : 0;

  const statusText =
    conn === "idle" || conn === "closed"
      ? "Tap the sun to speak"
      : conn === "reconnecting"
        ? "Reconnecting…"
        : conn === "connecting"
          ? "Connecting…"
          : isSpeaking
            ? "Speaking…"
            : voiceState === "thinking"
              ? "Thinking…"
              : "Listening — speak naturally";

  const button = (
    <button
      type="button"
      onClick={handlePress}
      aria-label={
        isLive
          ? "Voice session live"
          : conn === "reconnecting"
            ? "Reconnecting…"
            : isBusy
              ? "Connecting…"
              : "Press to talk to your Dubai concierge"
      }
      data-state={conn}
      data-voice-state={voiceState}
      data-active={sonarActive ? "true" : "false"}
      className="orb shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
      style={
        {
          width: orbSize,
          height: orbSize,
          ["--orb-amp" as string]: orbAmp.toFixed(3),
        } as React.CSSProperties
      }
    >
      <span
        aria-hidden
        className="orb__halo"
        style={isLive ? { opacity: 0.7 + amp * 0.3 } : undefined}
      />
      <span
        aria-hidden
        className="orb__rays"
        style={isLive ? { opacity: 0.55 + amp * 0.45 } : undefined}
      />
      <span aria-hidden className="orb__ring" />
      <span aria-hidden className="orb__sonar orb__sonar--1" />
      <span aria-hidden className="orb__sonar orb__sonar--2" />
      <span aria-hidden className="orb__sonar orb__sonar--3" />
      <span
        aria-hidden
        className="orb__body"
        style={{ transform: `scale(${bodyScale})`, transition: "transform 90ms ease-out" }}
      />
      <span aria-hidden className="orb__arc" />
      <Icon
        className={`orb__icon ${iconSize} ${isBusy ? "motion-safe:animate-spin" : ""}`}
        strokeWidth={1.6}
        style={{
          transform: isBusy ? undefined : `scale(${iconScale})`,
          filter: isLive
            ? `drop-shadow(0 0 ${3 + amp * 10}px rgba(255,244,214,0.9))`
            : undefined,
        }}
      />
    </button>
  );

  if (isDock) {
    return (
      <div className="relative flex items-center gap-1.5">
        {button}
        {isLive && (
          <button
            type="button"
            onClick={handleEndSession}
            aria-label="End voice session"
            className="grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-ink-soft transition-colors hover:text-ink"
          >
            <PowerOff className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (isFab) {
    return (
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 print-hide">
        {button}
        <p className="rounded-full border border-line bg-card/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft shadow-[var(--shadow-card)]">
          {statusText}
        </p>
        {isLive && (
          <button
            type="button"
            onClick={handleEndSession}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1 text-[11px] font-medium text-ink-soft shadow-[var(--shadow-card)] hover:bg-card"
          >
            <PowerOff className="h-3 w-3" />
            End session
          </button>
        )}
        {hint && (
          <p className="max-w-[220px] text-right text-[11px] text-[color:var(--color-danger)]">
            {hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {button}

      <Waveform amp={amp} active={sonarActive} speaking={isSpeaking} />

      <p
        className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-ink"
        aria-live="polite"
      >
        {statusText}
      </p>

      {isLive && (
        <button
          type="button"
          onClick={handleEndSession}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-card hover:text-ink"
        >
          <PowerOff className="h-3 w-3" />
          End session
        </button>
      )}

      {hint && (
        <p className="mt-3 max-w-xs text-center text-xs text-[color:var(--color-danger)]">
          {hint}
        </p>
      )}
    </div>
  );
}

const BAR_SHAPE = [0.45, 0.7, 1, 0.8, 0.55, 0.9, 0.6];

/** Live level meter under the sun — amplitude-driven, gold when speaking. */
function Waveform({ amp, active, speaking }: { amp: number; active: boolean; speaking: boolean }) {
  return (
    <div
      aria-hidden
      className={`mt-6 flex h-7 items-center gap-[3px] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
    >
      {BAR_SHAPE.map((k, i) => (
        <span
          key={i}
          className={`wave-bar w-[3px] rounded-full ${speaking ? "bg-gold" : "bg-teal"}`}
          style={{
            height: `${Math.max(4, Math.min(28, 4 + amp * 40 * k))}px`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}
