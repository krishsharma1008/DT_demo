"use client";

import { useItineraryStore } from "@/lib/store/itinerary";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Day tabs for multi-day trips. Controlled when `selected`/`onSelect` are
 * passed; otherwise renders as a read-only overview strip.
 */
export function DayStrip({
  selected,
  onSelect,
}: {
  selected?: number;
  onSelect?: (index: number) => void;
} = {}) {
  const days = useItineraryStore((s) => s.days);
  if (days.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Trip days"
      className="scroll-thin -mx-1 flex flex-nowrap items-stretch gap-2 overflow-x-auto px-1 pb-1"
    >
      {days.map((day) => {
        const active = selected === day.index;
        const count = day.activities.length + day.fixed_events.length;
        return (
          <button
            key={day.index}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(day.index)}
            className={`flex shrink-0 flex-col items-start rounded-2xl border px-4 py-2.5 text-left transition-colors ${
              active
                ? "border-gold bg-gold/15 text-ink shadow-[var(--shadow-card)]"
                : "border-line bg-card/70 text-ink-soft hover:border-gold/60"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-ink">
              Day {day.index + 1}
            </span>
            <span className="font-display text-lg font-semibold leading-tight">{dayLabel(day.date)}</span>
            <span className="text-[11px] text-ink-muted">
              {count === 0 ? "Open" : `${count} stop${count === 1 ? "" : "s"}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
