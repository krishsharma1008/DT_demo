"use client";

import { useState } from "react";
import { ArrowUp, Loader2, Mic } from "lucide-react";
import { useVoiceSession } from "@/components/voice/VoiceSessionProvider";
import { useVoiceStore } from "@/lib/store/voice";

/**
 * One composer for voice and text. Text is always usable — sending before a
 * session exists auto-connects (sendText). The mic toggle starts / ends the
 * voice session from the same bar.
 */
export function TextComposer({
  className = "",
  showMic = true,
}: {
  className?: string;
  showMic?: boolean;
}) {
  const { sendText, conn, connect, disconnect } = useVoiceSession();
  const voiceState = useVoiceStore((s) => s.state);
  const [value, setValue] = useState("");

  const connecting = conn === "connecting" || conn === "reconnecting";
  const live = conn === "active";

  const submit = () => {
    const text = value.trim();
    if (!text || connecting) return;
    setValue("");
    void sendText(text);
  };

  const placeholder = connecting
    ? "Connecting to your concierge…"
    : live
      ? voiceState === "speaking"
        ? "Marhaba is speaking — type to interrupt…"
        : "Type here, or just speak…"
      : "Ask anything about your day in Dubai…";

  return (
    <form
      className={`flex items-center gap-1.5 rounded-full border border-line-strong/70 bg-card py-1.5 pl-4 pr-1.5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/30 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="concierge-input" className="sr-only">
        Message the concierge
      </label>
      <input
        id="concierge-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="send"
        className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-muted focus:outline-none sm:text-[15px]"
      />
      {showMic && (
        <button
          type="button"
          onClick={() => void (live ? disconnect() : connecting ? undefined : connect())}
          aria-label={live ? "Stop voice" : "Start voice"}
          aria-pressed={live}
          title={live ? "Stop voice" : "Talk instead"}
          disabled={connecting}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
            live
              ? "bg-teal text-white"
              : "text-ink-soft hover:bg-sunk hover:text-ink"
          }`}
        >
          <Mic className="h-4 w-4" />
        </button>
      )}
      <button
        type="submit"
        disabled={!value.trim() || connecting}
        aria-label={connecting ? "Connecting" : "Send"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold text-on-gold transition-[transform,opacity] hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
        )}
      </button>
    </form>
  );
}
