"use client";

import { useEffect, useState } from "react";
import { useItineraryStore } from "@/lib/store/itinerary";
import { DayStrip } from "./DayStrip";
import { DayTimeline } from "./DayTimeline";
import { ShareBar } from "./ShareBar";
import { dubaiTodayIso, formatDayDate } from "@/components/concierge/placeFormat";

/** "Your day in Dubai" — header, day tabs (multi-day trips) and timeline. */
export function DayPlan() {
  const days = useItineraryStore((s) => s.days);
  const changed = useItineraryStore((s) => s.changed_ids);
  const [selected, setSelected] = useState(0);

  // Default to today's day if the trip covers it.
  useEffect(() => {
    const today = dubaiTodayIso();
    const idx = days.findIndex((d) => d.date === today);
    if (idx >= 0) setSelected(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  // Jump to whichever day just changed.
  useEffect(() => {
    if (changed.length === 0) return;
    const d = days.find((x) => x.activities.some((a) => changed.includes(a.id)));
    if (d) setSelected(d.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  if (days.length === 0) return null;
  const day = days.find((d) => d.index === selected) ?? days[0]!;
  const multi = days.length > 1;
  const stops = day.activities.length;
  const taxi = day.activities.reduce((n, a) => n + (a.travel_min ?? 0), 0);
  const first = [...day.activities].sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  const last = [...day.activities].sort((a, b) => b.start_time.localeCompare(a.start_time))[0];

  return (
    <section aria-labelledby="day-plan-title" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-ink">
            {multi ? `Day ${day.index + 1} of ${days.length} · ` : ""}
            {formatDayDate(day.date)}
          </p>
          <h2
            id="day-plan-title"
            className="font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-ink sm:text-[46px]"
          >
            {multi ? "Your days in Dubai" : "Your day in Dubai"}
          </h2>
          {stops > 0 && (
            <p className="mt-1.5 text-sm text-ink-muted">
              {stops} stop{stops === 1 ? "" : "s"}
              {first && last ? ` · ${first.start_time}–${last.start_time}` : ""}
              {taxi > 0 ? ` · about ${taxi} min in taxis` : ""}
            </p>
          )}
        </div>
        <ShareBar />
      </header>

      {multi && <DayStrip selected={day.index} onSelect={setSelected} />}

      <DayTimeline day={day} />
    </section>
  );
}
