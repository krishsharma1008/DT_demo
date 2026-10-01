"use client";

import { ArrowRight } from "lucide-react";
import { useVoiceSession } from "@/components/voice/VoiceSessionProvider";
import { useVoiceStore } from "@/lib/store/voice";
import { DEMO_LINES, nextDemoLine } from "./demoLines";

/** The four brief journeys as tappable cards (sends them as text). */
export function SuggestionCards({
  className = "",
  layout = "grid",
}: {
  className?: string;
  layout?: "grid" | "list";
}) {
  const { sendText } = useVoiceSession();
  return (
    <ol
      className={`grid gap-2.5 ${layout === "grid" ? "sm:grid-cols-2" : ""} ${className}`}
      aria-label="Try these"
    >
      {DEMO_LINES.map((d, i) => (
        <li key={d.step}>
          <button
            type="button"
            onClick={() => void sendText(d.text)}
            className="group flex h-full w-full items-start gap-3 rounded-2xl border border-line bg-card/85 p-3.5 text-left shadow-[var(--shadow-card)] transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-gold/70 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span className="font-display text-2xl font-semibold leading-none text-gold-ink tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
                {d.step}
                <ArrowRight className="h-3 w-3 text-gold-ink opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-[13px] leading-snug text-ink-soft">&ldquo;{d.text}&rdquo;</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** After a demo line is sent, offers the next one in the journey. */
export function NextStepChip({ className = "" }: { className?: string }) {
  const { sendText } = useVoiceSession();
  const turns = useVoiceStore((s) => s.transcript);
  const next = nextDemoLine(turns.filter((t) => t.role === "user").map((t) => t.text));
  if (!next) return null;
  return (
    <button
      type="button"
      onClick={() => void sendText(next.text)}
      title={next.text}
      className={`group inline-flex max-w-full items-center gap-2 rounded-full border border-gold/50 bg-gold/10 py-1 pl-1 pr-3 text-left text-[12px] text-ink-soft transition-colors hover:bg-gold/20 ${className}`}
    >
      <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-gold">
        Try next
      </span>
      <span className="truncate">
        <span className="font-semibold text-ink">{next.step}:</span> &ldquo;{next.text}&rdquo;
      </span>
    </button>
  );
}
