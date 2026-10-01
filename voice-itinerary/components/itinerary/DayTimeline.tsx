"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CarTaxiFront, MapPin, Pin } from "lucide-react";
import {
  useItineraryStore,
  type FixedEvent,
  type ItineraryDay,
  type ScheduledActivity,
} from "@/lib/store/itinerary";
import { StopCard } from "./StopCard";

type Row =
  | { kind: "act"; time: string; a: ScheduledActivity }
  | { kind: "fixed"; time: string; ev: FixedEvent };

/**
 * Vertical timeline for one day: time column · gold rail · stop cards, with
 * taxi-time connectors between stops.
 */
export function DayTimeline({ day }: { day: ItineraryDay }) {
  const destinationId = useItineraryStore((s) => s.trip.destination_id);
  const changed = useItineraryStore((s) => s.changed_ids);
  const location = useItineraryStore((s) => s.visit.location);
  const setFocusPlace = useItineraryStore((s) => s.setFocusPlace);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const reduce = useReducedMotion();

  const rows: Row[] = [
    ...day.activities.map((a) => ({ kind: "act" as const, time: a.start_time, a })),
    ...day.fixed_events.map((ev) => ({ kind: "fixed" as const, time: ev.start_time, ev })),
  ].sort((x, y) => x.time.localeCompare(y.time));

  // A partial change (e.g. one stop swapped) scrolls that stop into view.
  useEffect(() => {
    if (changed.length === 0 || changed.length >= day.activities.length) return;
    const el = cardRefs.current.get(changed[0]!);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(
      () => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }),
      120,
    );
    return () => window.clearTimeout(t);
  }, [changed, day.activities.length]);

  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-muted">
        This day is still open — ask the concierge to fill it.
      </p>
    );
  }

  let firstAct = true;
  return (
    <ol className="relative flex flex-col">
      {rows.map((r, i) => {
        const isLast = i === rows.length - 1;
        const travel = r.kind === "act" ? r.a.travel_min : undefined;
        const connector =
          r.kind === "act" && travel !== undefined
            ? firstAct
              ? travel <= 0
                ? `Starts right where you are${location?.label ? ` · ${location.label}` : ""}`
                : `${travel} min by taxi${location?.label ? ` from ${location.label}` : ""}`
              : travel <= 0
                ? "Short walk · same area"
                : `${travel} min by taxi`
            : null;
        if (r.kind === "act") firstAct = false;
        const isChanged = r.kind === "act" && changed.includes(r.a.id);

        return (
          <li key={r.kind === "act" ? r.a.id : r.ev.id} className="grid grid-cols-[50px_1fr] gap-x-6 sm:grid-cols-[72px_1fr] sm:gap-x-8">
            {/* connector row */}
            {connector && (
              <>
                <div className="relative">
                  <Rail top={i === 0 ? 18 : 0} bottom={0} />
                </div>
                <div className="flex items-center py-2">
                  <motion.span
                    initial={reduce ? false : { opacity: 0, x: -8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ duration: 0.35, delay: 0.05 + i * 0.08 }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      isChanged ? "border-gold/60 bg-gold/10 text-gold-ink" : "border-line bg-sunk text-ink-soft"
                    }`}
                  >
                    {i === 0 && travel !== undefined && travel <= 0 ? (
                      <MapPin className="h-3.5 w-3.5" />
                    ) : (
                      <CarTaxiFront className="h-3.5 w-3.5" />
                    )}
                    {connector}
                  </motion.span>
                </div>
              </>
            )}

            {/* time + dot */}
            <div className="relative flex flex-col items-end pt-4">
              {!(i === 0 && !connector && isLast) && (
                <Rail
                  top={i === 0 && !connector ? 28 : 0}
                  bottom={isLast ? undefined : 0}
                  height={isLast ? 22 : undefined}
                />
              )}
              <span
                className={`relative z-10 font-display text-[22px] font-semibold leading-none tabular-nums sm:text-[28px] ${
                  isChanged ? "text-gold-ink" : "text-ink"
                }`}
              >
                {r.time}
              </span>
              <span
                aria-hidden
                className={`absolute right-[-18px] top-[19px] z-10 h-3 w-3 rounded-full border-2 sm:right-[-22px] ${
                  isChanged ? "border-gold bg-gold" : "border-gold bg-surface"
                }`}
              />
            </div>

            <div className="pb-3">
              {r.kind === "act" ? (
                <StopCard
                  ref={(el) => {
                    if (el) cardRefs.current.set(r.a.id, el);
                    else cardRefs.current.delete(r.a.id);
                  }}
                  activity={r.a}
                  destinationId={destinationId}
                  changed={isChanged}
                  index={i}
                  onDetails={(id) => setFocusPlace(id)}
                />
              ) : (
                <FixedRow ev={r.ev} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Rail({ top, bottom, height }: { top?: number; bottom?: number; height?: number }) {
  return (
    <span
      aria-hidden
      className="rail-flow absolute right-[-12.5px] w-px bg-[linear-gradient(to_bottom,var(--line-strong)_55%,transparent_0)] bg-[length:1px_7px] sm:right-[-16.5px]"
      style={{ top, bottom, height }}
    />
  );
}

function FixedRow({ ev }: { ev: FixedEvent }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-sunk px-4 py-3 text-sm text-ink">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-gold-ink">
        <Pin className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{ev.type}</span>
        <span className="truncate font-semibold">{ev.title}</span>
        {ev.location && <span className="truncate text-xs text-ink-muted">{ev.location}</span>}
      </span>
      <span className="text-xs text-ink-muted">{ev.duration_min} min</span>
    </div>
  );
}
