"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RealtimeClient, type ConnState } from "@/lib/realtime/client";
import { useVoiceStore } from "@/lib/store/voice";
import {
  formatItinerarySnapshot,
  useItineraryStore,
} from "@/lib/store/itinerary";
import { TOOL_DEFINITIONS, dispatchToolCall } from "@/lib/realtime/tools";
import { buildSystemPrompt } from "@/lib/realtime/prompt";
import { messageItemFromTurn } from "@/lib/realtime/events";
import { dubaiNow } from "@/lib/concierge/clock";

const DUCK_SAFETY_MS = 1500;

/**
 * Owns ONE RealtimeClient + ONE <audio> element for the lifetime of the
 * tab. Mounted in app/layout.tsx so navigation between / and /trip/[id]
 * doesn't tear the WebRTC connection — the orb on the share page picks
 * up the live session without a re-tap.
 *
 * VoiceOrb consumes this via useVoiceSession() and is purely presentational.
 */

type VoiceSession = {
  conn: ConnState;
  hint: string | null;
  micStream: MediaStream | null;
  remoteStream: MediaStream | null;
  navigateAfterFinalize: ((shareId: string) => void) | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Send a typed message; connects first if no session is running. */
  sendText: (text: string) => Promise<void>;
};

const Ctx = createContext<VoiceSession | null>(null);

function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useVoiceSession(): VoiceSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceSession must be used inside VoiceSessionProvider");
  return v;
}

async function fetchCommitments() {
  const mode =
    process.env.NEXT_PUBLIC_CALENDAR_MODE === "browser_use"
      ? "browser_use"
      : "mock";
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(today.getDate() + 60);
  const start = localIsoDate(today);
  const end = localIsoDate(horizon);
  try {
    const res = await fetch(
      `/api/calendar/events?source=${mode}&start=${start}&end=${end}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      events?: Array<{
        id: string;
        title: string;
        start_local: string;
        end_local: string;
        location?: string;
        has_video: boolean;
      }>;
    };
    return data.events ?? [];
  } catch {
    return [];
  }
}

export function VoiceSessionProvider({
  children,
  navigateAfterFinalize,
}: {
  children: React.ReactNode;
  navigateAfterFinalize?: (shareId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const duckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const rateRetriesRef = useRef(0);
  const navRef = useRef(navigateAfterFinalize);
  navRef.current = navigateAfterFinalize;

  const [conn, setConn] = useState<ConnState>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const setVoiceState = useVoiceStore((s) => s.setState);
  const setError = useVoiceStore((s) => s.setError);
  const setMic = useVoiceStore((s) => s.setMic);
  const appendAssistantDelta = useVoiceStore((s) => s.appendAssistantDelta);
  const finalizeAssistantTurn = useVoiceStore((s) => s.finalizeAssistantTurn);
  const appendUserTurn = useVoiceStore((s) => s.appendUserTurn);

  // Tab close: cleanly tear down WebRTC. Mount-once: this provider survives
  // route changes, so the cleanup only runs on full unmount (i.e., tab close
  // or HMR), never on a mid-session navigation.
  useEffect(() => {
    const handleBeforeUnload = () => {
      void clientRef.current?.disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
      void clientRef.current?.disconnect();
    };
  }, []);

  const releaseDuck = useCallback(() => {
    if (duckTimerRef.current) {
      clearTimeout(duckTimerRef.current);
      duckTimerRef.current = null;
    }
    clientRef.current?.setMuted(false);
  }, []);

  const followUrlIfPresent = (result: unknown) => {
    if (
      result &&
      typeof result === "object" &&
      "url" in result &&
      typeof (result as { url?: unknown }).url === "string"
    ) {
      window.open((result as { url: string }).url, "_blank", "noopener");
    }
  };

  const connect = useCallback(async () => {
    if (conn !== "idle" && conn !== "closed") return;
    setHint(null);

    const now = dubaiNow();
    const today = now.date;

    const mode = process.env.NEXT_PUBLIC_CALENDAR_MODE;
    let existing_commitments: Awaited<
      ReturnType<typeof fetchCommitments>
    > = [];
    if (mode === "mock" || mode === "browser_use") {
      existing_commitments = await fetchCommitments();
    }

    const itinSnapshot = formatItinerarySnapshot(useItineraryStore.getState());
    const instructions = buildSystemPrompt({
      current_date: today,
      current_time: now.time,
      existing_commitments,
      itinerary_snapshot: itinSnapshot,
    });
    const tools = TOOL_DEFINITIONS as unknown as Record<string, unknown>[];

    const client = new RealtimeClient({
      onState: (s) => {
        setConn(s);
        if (s === "connecting") setVoiceState("connecting");
        else if (s === "reconnecting") setVoiceState("connecting");
        else if (s === "active") {
          setVoiceState("listening");
          setMicStream(client.getMicStream());
        } else if (s === "closed") {
          setVoiceState("idle");
          setMicStream(null);
          setRemoteStream(null);
          releaseDuck();
        }
      },
      onError: (e) => {
        setError(e.message);
        setHint(e.message);
        if (e.message.toLowerCase().includes("permission")) setMic("denied");
      },
      onRemoteStream: (stream) => setRemoteStream(stream),
      onFunctionCalls: async (calls) => {
        clientRef.current?.setMuted(true);
        if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
        duckTimerRef.current = setTimeout(releaseDuck, DUCK_SAFETY_MS);

        const results = await Promise.all(
          calls.map(async (c) => {
            console.debug("[voice] tool call", c.name, c.arguments);
            const result = await dispatchToolCall(c.name, c.arguments);
            console.debug("[voice] tool result", c.name, result);
            return { call: c, result };
          }),
        );

        if (
          results.some(
            ({ result }) =>
              result &&
              typeof result === "object" &&
              "ok" in result &&
              (result as { ok?: unknown }).ok === true,
          )
        ) {
          releaseDuck();
        }

        for (const { call, result } of results) {
          if (
            result &&
            typeof result === "object" &&
            "ok" in result &&
            (result as { ok?: unknown }).ok === true
          ) {
            followUrlIfPresent(result);
            if (call.name === "finalize_itinerary") {
              const maybeId = (result as unknown as { share_id?: unknown })
                .share_id;
              if (typeof maybeId === "string" && navRef.current) {
                // Navigate immediately — the WebRTC session SURVIVES the
                // route change because we live in the layout, not the page.
                // The 1.2s delay is purely to let the model finish saying
                // "locked in" before the page transitions.
                setTimeout(() => navRef.current?.(maybeId), 1200);
              }
            }
          }
        }

        return results.map(({ call, result }) => ({
          call_id: call.call_id,
          output: result,
        }));
      },
      onServerEvent: (event) => {
        switch (event.type) {
          case "session.created": {
            client.send({
              type: "session.update",
              session: {
                type: "realtime",
                instructions,
                tools,
                tool_choice: "auto",
              },
            });

            const prior = useVoiceStore
              .getState()
              .transcript.filter((t) => t.finalized);
            for (const turn of prior.slice(-8)) {
              client.send({
                type: "conversation.item.create",
                item: messageItemFromTurn(turn.role, turn.text),
              });
            }

            const pending = pendingTextRef.current;
            pendingTextRef.current = null;
            if (pending) {
              // Typed first message: answer it directly instead of greeting.
              client.send({
                type: "conversation.item.create",
                item: messageItemFromTurn("user", pending),
              });
              client.send({ type: "response.create" });
              break;
            }

            const hasContext = prior.length > 0 || Boolean(itinSnapshot);
            client.send({
              type: "response.create",
              response: {
                instructions: hasContext
                  ? "Pick up where we left off. ONE short sentence (≤10 words) acknowledging the current plan — do NOT re-greet, do NOT recap the whole itinerary. Then wait for the user."
                  : "Greet the visitor warmly in one short sentence (≤14 words) as their Dubai concierge, then ask how you can help with their day in Dubai.",
              },
            });
            break;
          }
          case "input_audio_buffer.speech_started":
            setVoiceState("listening");
            break;
          case "input_audio_buffer.speech_stopped":
            setVoiceState("thinking");
            break;
          case "response.created":
            setVoiceState("speaking");
            break;
          case "response.audio_transcript.delta": {
            const e = event as {
              type: string;
              response_id: string;
              delta: string;
            };
            appendAssistantDelta(e.response_id, e.delta);
            break;
          }
          case "response.audio_transcript.done": {
            const e = event as {
              type: string;
              response_id: string;
              transcript: string;
            };
            finalizeAssistantTurn(e.response_id, e.transcript);
            break;
          }
          case "response.done": {
            const r = (event as { response?: { status?: string; status_details?: { error?: { code?: string; message?: string } } } }).response;
            const err = r?.status === "failed" ? r.status_details?.error : undefined;
            if (err?.code === "rate_limit_exceeded" && rateRetriesRef.current < 3) {
              // Account token-per-minute cap: wait the advised time, then retry.
              rateRetriesRef.current += 1;
              const secs = Number(/try again in ([\d.]+)s/i.exec(err.message ?? "")?.[1] ?? 6);
              setHint("One moment — catching my breath…");
              setVoiceState("thinking");
              setTimeout(() => {
                setHint(null);
                client.send({ type: "response.create" });
              }, Math.ceil(secs * 1000) + 500);
              break;
            }
            if (r?.status === "completed") rateRetriesRef.current = 0;
            setVoiceState("listening");
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            const e = event as {
              type: string;
              item_id: string;
              transcript: string;
            };
            appendUserTurn(e.item_id, e.transcript);
            break;
          }
        }
      },
    });
    clientRef.current = client;

    try {
      if (!audioRef.current) return;
      // ?mic=0 runs text-only (handy for kiosks and automated checks).
      const micParam = new URLSearchParams(window.location.search).get("mic");
      const wantMic = micParam !== "0";
      await client.connect(audioRef.current, { mic: wantMic });
      if (wantMic && client.getMicStream()) setMic("granted");
    } catch (err) {
      console.error("[voice] connect failed", err);
    }
  }, [
    conn,
    setVoiceState,
    setError,
    setMic,
    appendAssistantDelta,
    finalizeAssistantTurn,
    appendUserTurn,
    releaseDuck,
  ]);

  const disconnect = useCallback(async () => {
    try {
      await clientRef.current?.disconnect();
    } catch {}
    setHint(null);
  }, []);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      appendUserTurn(`typed_${Date.now()}`, text);
      const client = clientRef.current;
      if (client && client.getState() === "active") {
        client.send({ type: "conversation.item.create", item: messageItemFromTurn("user", text) });
        client.send({ type: "response.create" });
        setVoiceState("thinking");
        return;
      }
      pendingTextRef.current = text;
      await connect();
    },
    [appendUserTurn, connect, setVoiceState],
  );

  const value = useMemo<VoiceSession>(
    () => ({
      conn,
      hint,
      micStream,
      remoteStream,
      navigateAfterFinalize: navigateAfterFinalize ?? null,
      connect,
      disconnect,
      sendText,
    }),
    [
      sendText,
      conn,
      hint,
      micStream,
      remoteStream,
      navigateAfterFinalize,
      connect,
      disconnect,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* The audio element lives in the provider tree so it persists across
          all route changes. WebRTC remote tracks attach via srcObject in
          RealtimeClient.ontrack. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </Ctx.Provider>
  );
}
