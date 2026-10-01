"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Baby, Building2, CarTaxiFront, ChevronRight, Compass, Footprints, Plus, SunMedium } from "lucide-react";
import { useVoiceSession } from "@/components/voice/VoiceSessionProvider";
import { useItineraryStore } from "@/lib/store/itinerary";
import { findPlace } from "@/lib/data";
import { ActivityImage } from "@/components/itinerary/ActivityImage";
import { agesLabel, areaName, settingLabel, travelLabel, walkingLabel } from "./placeFormat";

/** "Nearby now" — the options surfaced by "help me now". */
export function NearbyPanel() {
  const nearby = useItineraryStore((s) => s.nearby);
  const location = useItineraryStore((s) => s.visit.location);
  const focus = useItineraryStore((s) => s.focus_place_id);
  const setFocusPlace = useItineraryStore((s) => s.setFocusPlace);
  const destinationId = useItineraryStore((s) => s.trip.destination_id);
  const reduce = useReducedMotion();
  const { sendText } = useVoiceSession();

  const items = nearby
    .map((n) => ({ ...n, place: findPlace(n.place_id) }))
    .filter((n) => n.place);
  if (items.length === 0) return null;
  const maxMin = Math.max(...items.map((n) => n.travel_min));

  return (
    <motion.section
      aria-labelledby="nearby-title"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-[28px] border border-teal/30 bg-[color:var(--teal-soft)] p-4 sm:p-6"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            <Compass className="h-3.5 w-3.5" />
            Help me now
          </p>
          <h2 id="nearby-title" className="font-display text-[30px] font-semibold leading-tight text-ink sm:text-[34px]">
            Nearby now
          </h2>
        </div>
        <p className="text-sm text-ink-soft">
          Within {maxMin} min{location?.label ? ` of ${location.label}` : ""}
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(({ place_id, travel_min, reason, place }, i) => {
          const p = place!;
          const walking = walkingLabel(p.walking);
          const ages = agesLabel(p);
          const focused = focus === place_id;
          return (
            <motion.li
              key={place_id}
              initial={reduce ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + i * 0.12, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={() => setFocusPlace(place_id)}
              className={`group flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-card)] border bg-card shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-[var(--shadow-lift)] ${
                focused ? "border-gold ring-2 ring-gold/40" : "border-line"
              }`}
            >
              <div className="relative aspect-[16/8]">
                <ActivityImage
                  destinationId={destinationId}
                  seed={place_id}
                  kind={p.kind}
                  tags={p.tags}
                  image={p.image}
                  alt={p.name}
                  size="fill"
                />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(19,35,58,0.82)] px-2.5 py-1 text-[11px] font-semibold text-[#f6efe2] backdrop-blur">
                  <CarTaxiFront className="h-3.5 w-3.5" />
                  {travelLabel(travel_min)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
                  {areaName(p.area_id)}
                </p>
                <h3 className="font-display text-[22px] font-semibold leading-tight text-ink">{p.name}</h3>
                <p className="text-[13.5px] leading-snug text-ink-soft">{reason}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[12px] text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {p.indoor_outdoor === "outdoor" ? (
                      <SunMedium className="h-3.5 w-3.5" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5" />
                    )}
                    {settingLabel(p.indoor_outdoor)}
                  </span>
                  {walking && (
                    <span className="inline-flex items-center gap-1">
                      <Footprints className="h-3.5 w-3.5" />
                      {walking}
                    </span>
                  )}
                  {ages && (
                    <span className="inline-flex items-center gap-1">
                      <Baby className="h-3.5 w-3.5" />
                      {ages}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void sendText(`Add ${p.name} to our plan`);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-gold hover:bg-gold/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to plan
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusPlace(place_id);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-0.5 rounded-full bg-gold px-3 py-1.5 text-[12.5px] font-semibold text-on-gold transition-transform hover:scale-[1.02]"
                  >
                    Details
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}
