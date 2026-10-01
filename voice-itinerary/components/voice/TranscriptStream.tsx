"use client";

import { useEffect, useRef } from "react";
import { useVoiceStore } from "@/lib/store/voice";

/**
 * Live conversation. `compact` shows only the latest turns in a short strip
 * (mobile dock); the default fills its container and scrolls.
 */
export function TranscriptStream({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const turns = useVoiceStore((s) => s.transcript);
  const voiceState = useVoiceStore((s) => s.state);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [turns, voiceState]);

  if (turns.length === 0) return null;

  const shown = compact ? turns.slice(-1) : turns.slice(-30);
  const last = turns[turns.length - 1];
  const showThinking = voiceState === "thinking" && last?.role === "user";

  return (
    <div
      ref={ref}
      className={`scroll-thin overflow-y-auto ${compact ? "max-h-[92px]" : ""} ${className}`}
      aria-label="Conversation"
    >
      <ul className={`flex flex-col ${compact ? "gap-1.5" : "gap-3"}`}>
        {shown.map((t) =>
          t.role === "user" ? (
            <li key={t.id} className="flex justify-end">
              <span
                className={`max-w-[88%] rounded-2xl rounded-br-md bg-[color:var(--bubble-user)] text-[#f6efe2] ${
                  compact ? "px-3 py-1.5 text-[13px] leading-snug" : "px-3.5 py-2 text-sm leading-relaxed"
                }`}
              >
                {t.text}
              </span>
            </li>
          ) : (
            <li key={t.id} className="flex flex-col items-start gap-1">
              {!compact && (
                <span className="font-display text-[13px] font-semibold italic tracking-wide text-gold-ink">
                  Marhaba
                </span>
              )}
              <span
                className={`max-w-[92%] rounded-2xl rounded-tl-md border border-line bg-card text-ink ${
                  compact
                    ? "px-3 py-1.5 text-[13px] leading-snug"
                    : "px-3.5 py-2 text-sm leading-relaxed shadow-[var(--shadow-card)]"
                }`}
              >
                {compact && t.text.length > 120 ? `${t.text.slice(0, 118).trimEnd()}…` : t.text}
                {!t.finalized && (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-gold motion-safe:animate-pulse"
                  />
                )}
              </span>
            </li>
          ),
        )}
        {showThinking && (
          <li className="flex items-center gap-1 pl-1" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-gold motion-safe:animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </li>
        )}
      </ul>
    </div>
  );
}
