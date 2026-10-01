"use client";

import type {
  FunctionCall,
  RealtimeClientEvent,
  RealtimeServerEvent,
} from "./events";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/**
 * Per PLAN §14.1 (Codex correction):
 *  - mint just before SDP exchange, never on page load
 *  - SDP POST goes to /v1/realtime/calls (not /v1/realtime?model=...)
 *  - Authorization uses the ephemeral client_secret, not the API key
 *  - tool execution triggers from `response.done`, not deltas
 *
 * WS1 (audio ducking): `setMuted()` lets the orb mute the assistant's audio
 * during a planning turn so the canvas paints before the spoken summary
 * (PLAN §14.2).
 *
 * WS2 (one-shot reconnect): on PC/data-channel failure while active, we
 * silently re-mint, re-establish, replay session.update + last 8 finalized
 * transcript turns, then hand back to the user. One retry only — the rate
 * limiter caps mints at 10/min/IP, so we don't loop into 429.
 */

export type RealtimeClientCallbacks = {
  onState?: (state: ConnState) => void;
  onServerEvent?: (event: RealtimeServerEvent) => void;
  /**
   * Batch handler. Called once per response.done with ALL function calls
   * extracted from response.output. Must return an output for every call
   * (same call_id). The client sends each output as conversation.item.create
   * and then a SINGLE response.create — preventing the
   * "Conversation already has an active response in progress" error that
   * happens if you fire response.create per call.
   */
  onFunctionCalls?: (
    calls: FunctionCall[],
  ) => Promise<Array<{ call_id: string; output: unknown }>>;
  /** Legacy single-call handler. Kept for back-compat; do not use for new code. */
  onFunctionCall?: (call: FunctionCall) => void;
  onError?: (err: Error) => void;
  /** Fires when the remote (assistant) audio track first arrives. Lets the
   * orb hook into a Web Audio analyser for audio-reactive visuals. */
  onRemoteStream?: (stream: MediaStream) => void;
};

export type ConnState =
  | "idle"
  | "connecting"
  | "active"
  | "reconnecting"
  | "closing"
  | "closed";

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private state: ConnState = "idle";
  private cb: RealtimeClientCallbacks;
  private model = "gpt-realtime-2.1";
  private reconnectAttempted = false;
  /** When false (or the mic is denied) the session runs receive-only: type to talk. */
  private wantMic = true;
  private intentionalClose = false;

  constructor(callbacks: RealtimeClientCallbacks = {}) {
    this.cb = callbacks;
  }

  getState(): ConnState {
    return this.state;
  }

  private setState(s: ConnState) {
    this.state = s;
    this.cb.onState?.(s);
  }

  /**
   * Mute or unmute the assistant's audio output. Used by the orb to duck
   * during planning turns so the canvas paint beats the spoken summary.
   * Prefers `audioEl.muted` over `volume = 0` for Safari compatibility.
   */
  setMuted(muted: boolean) {
    if (this.audioEl) this.audioEl.muted = muted;
  }

  isMuted(): boolean {
    return this.audioEl?.muted ?? false;
  }

  /** The local mic MediaStream. Available once connect() resolves. */
  getMicStream(): MediaStream | null {
    return this.mic;
  }

  /**
   * Connects to OpenAI Realtime via WebRTC.
   * Mints token → gets mic → SDP offer → POST to /v1/realtime/calls → SDP answer.
   */
  async connect(audioEl: HTMLAudioElement, opts: { mic?: boolean } = {}): Promise<void> {
    if (this.state !== "idle" && this.state !== "closed") {
      throw new Error(`connect() called in state ${this.state}`);
    }
    this.audioEl = audioEl;
    this.wantMic = opts.mic ?? true;
    this.reconnectAttempted = false;
    this.intentionalClose = false;
    await this.establish("connecting");
  }

  /** Send a typed event over the data channel. No-op if channel isn't open. */
  send(event: RealtimeClientEvent) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify(event));
  }

  /**
   * Reply to a function call with `function_call_output` then trigger the next
   * response. Per PLAN §14.1 the call_id must match the one from response.done.
   */
  sendFunctionCallOutput(callId: string, output: unknown) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
    this.send({ type: "response.create" });
  }

  async disconnect() {
    this.intentionalClose = true;
    this.setState("closing");
    this.teardown();
    this.setState("closed");
  }

  private teardown() {
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    this.dc = null;
    this.pc = null;
    this.mic = null;
  }

  /**
   * Shared connection path used by `connect()` and `reconnect()`. The state
   * label is parameterized so the orb can show "connecting" vs "reconnecting".
   */
  private async establish(stateLabel: "connecting" | "reconnecting") {
    if (!this.audioEl) throw new Error("establish() needs audioEl");
    this.setState(stateLabel);

    let mintRes: Response;
    try {
      mintRes = await fetch("/api/realtime/session", { method: "POST" });
    } catch (err) {
      this.fail(err, "Could not reach session route");
      throw err;
    }
    if (!mintRes.ok) {
      const detail = await mintRes.text().catch(() => "");
      const e = new Error(`Mint failed (${mintRes.status}): ${detail}`);
      this.fail(e);
      throw e;
    }
    const { client_secret, model } = (await mintRes.json()) as {
      client_secret: string;
      model: string;
    };
    this.model = model;

    this.mic = null;
    if (this.wantMic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (err) {
        // Keep going receive-only so the visitor can still type.
        console.warn("[realtime] mic unavailable, continuing text-only", err);
        this.cb.onError?.(new Error("Microphone unavailable — you can type instead."));
      }
    }

    this.pc = new RTCPeerConnection();
    this.pc.ontrack = (e) => {
      if (this.audioEl && e.streams[0]) {
        this.audioEl.srcObject = e.streams[0];
        void this.audioEl.play().catch(() => undefined);
        this.cb.onRemoteStream?.(e.streams[0]);
      }
    };
    this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();

    if (this.mic) {
      for (const track of this.mic.getTracks()) {
        this.pc.addTrack(track, this.mic);
      }
    } else {
      this.pc.addTransceiver("audio", { direction: "recvonly" });
    }

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onopen = () => {
      this.setState("active");
      // No replay here — the orb's session.created handler is the single
      // source of truth for session.update + transcript replay. This way
      // both first-connect and reconnect take the same path and we don't
      // double-update the session.
    };
    this.dc.onclose = () => this.handleChannelClose();
    this.dc.onmessage = (e) => this.handleServerEvent(e.data);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    let sdpRes: Response;
    try {
      sdpRes = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client_secret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
    } catch (err) {
      this.fail(err, "SDP exchange failed");
      throw err;
    }
    if (!sdpRes.ok) {
      const text = await sdpRes.text().catch(() => "");
      const e = new Error(`SDP exchange returned ${sdpRes.status}: ${text}`);
      this.fail(e);
      throw e;
    }
    const answerSdp = await sdpRes.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  private handleConnectionStateChange() {
    const s = this.pc?.connectionState;
    if (s === "failed" || s === "disconnected" || s === "closed") {
      // Reuse the channel-close path for a single source of truth.
      this.handleChannelClose();
    }
  }

  /**
   * Triggered by either pc.onconnectionstatechange (failed/disconnected/closed)
   * or dc.onclose. If we were active and haven't yet retried, kick a one-shot
   * reconnect; otherwise transition to closed.
   */
  private handleChannelClose() {
    if (this.intentionalClose) return;
    if (this.state !== "active" && this.state !== "reconnecting") return;
    if (this.reconnectAttempted) {
      this.setState("closed");
      return;
    }
    this.reconnectAttempted = true;
    void this.reconnect();
  }

  private async reconnect() {
    this.teardown();
    try {
      await this.establish("reconnecting");
    } catch {
      // establish() already routed the error; just drop to closed.
      this.setState("closed");
    }
  }

  private handleServerEvent(raw: unknown) {
    if (typeof raw !== "string") return;
    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(raw) as RealtimeServerEvent;
    } catch (err) {
      console.error("[realtime] invalid event JSON", err);
      return;
    }

    this.cb.onServerEvent?.(event);

    if (event.type === "response.done") {
      const resp = (event as { response?: { output?: unknown[] } }).response;
      const out = Array.isArray(resp?.output) ? resp.output : [];
      const calls: FunctionCall[] = [];
      for (const item of out) {
        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type: unknown }).type === "function_call"
        ) {
          const fc = item as {
            type: "function_call";
            call_id: string;
            name: string;
            arguments: string;
          };
          calls.push({
            call_id: fc.call_id,
            name: fc.name,
            arguments: fc.arguments,
          });
        }
      }
      if (calls.length > 0) {
        if (this.cb.onFunctionCalls) {
          // Batch path — exactly ONE response.create per response.done.
          void this.dispatchFunctionCallsBatch(calls);
        } else if (this.cb.onFunctionCall) {
          for (const fc of calls) this.cb.onFunctionCall(fc);
        }
      }
    }

    if (event.type === "error") {
      const errObj =
        (event as { error?: { message?: string; code?: string; type?: string } })
          .error ?? {};
      const message = errObj.message ?? "Realtime error";
      const code = errObj.code ?? "";
      // Filter benign races. The Realtime API rejects a second
      // response.create while a response is in progress, but the first
      // response still completes normally — surfacing this in red red text
      // confuses users.
      const benign =
        code === "conversation_already_has_active_response" ||
        /already has an active response/i.test(message);
      if (benign) {
        console.debug("[realtime] benign error suppressed:", message);
        return;
      }
      this.cb.onError?.(new Error(message));
    }
  }

  /**
   * Run all function-call dispatches in parallel via the orb's
   * onFunctionCalls handler, send each result as a function_call_output,
   * then issue ONE response.create for the whole batch.
   */
  private async dispatchFunctionCallsBatch(calls: FunctionCall[]) {
    if (!this.cb.onFunctionCalls) return;
    let outputs: Array<{ call_id: string; output: unknown }>;
    try {
      outputs = await this.cb.onFunctionCalls(calls);
    } catch (err) {
      console.error("[realtime] batch dispatch failed", err);
      return;
    }
    for (const { call_id, output } of outputs) {
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id,
          output: typeof output === "string" ? output : JSON.stringify(output),
        },
      });
    }
    // Single response.create after every output is queued. The dc is FIFO
    // so the server sees outputs before the response request.
    this.send({ type: "response.create" });
  }

  private fail(err: unknown, prefix?: string) {
    const e =
      err instanceof Error
        ? new Error(prefix ? `${prefix}: ${err.message}` : err.message)
        : new Error(prefix ?? String(err));
    console.error("[realtime]", e.message);
    this.cb.onError?.(e);
    this.setState("closed");
  }
}
