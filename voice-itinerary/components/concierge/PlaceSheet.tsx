"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Baby,
  Building2,
  CalendarCheck,
  CarTaxiFront,
  Clock3,
  ExternalLink,
  Footprints,
  MapPin,
  Navigation,
  SunMedium,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { useItineraryStore } from "@/lib/store/itinerary";
import { findPlace } from "@/lib/data";
import { directionsUrl, mapSearchUrl, travelMinutes } from "@/lib/concierge/geo";
import { ActivityImage } from "@/components/itinerary/ActivityImage";
import { agesLabel, areaName, hoursForDate, settingLabel, walkingLabel } from "./placeFormat";

function useIsDesktop(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

/**
 * Place detail: side sheet on desktop, bottom sheet on mobile. Opens when
 * the store's focus_place_id is set (by the concierge or a "Details" tap).
 */
export function PlaceSheet() {
  const focusId = useItineraryStore((s) => s.focus_place_id);
  const setFocusPlace = useItineraryStore((s) => s.setFocusPlace);
  const visit = useItineraryStore((s) => s.visit);
  const nearby = useItineraryStore((s) => s.nearby);
  const days = useItineraryStore((s) => s.days);
  const destinationId = useItineraryStore((s) => s.trip.destination_id);
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const place = focusId ? findPlace(focusId) : null;
  const open = !!place;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusPlace(null);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, setFocusPlace]);

  // Travel time from where the visitor is now.
  let travel: number | undefined;
  if (place) {
    const from = visit.location?.coords;
    travel = nearby.find((n) => n.place_id === place.id)?.travel_min;
    if (travel === undefined && from && place.coords) travel = travelMinutes(from, place.coords);
  }
  const scheduled = place
    ? days.flatMap((d) => d.activities).find((a) => a.catalog_id === place.id)
    : undefined;

  const directions = place
    ? place.coords
      ? directionsUrl(place.coords, visit.location?.coords)
      : mapSearchUrl(place.name)
    : "#";

  const offscreen = desktop ? { x: "100%" } : { y: "100%" };

  return (
    <AnimatePresence>
      {place && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-[color:var(--surface-overlay)] backdrop-blur-[2px] lg:left-[400px] xl:left-[440px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            onClick={() => setFocusPlace(null)}
            aria-hidden
          />
          <motion.aside
            key={`sheet-${place.id}`}
            role="dialog"
            aria-modal={desktop ? undefined : true}
            aria-labelledby="place-sheet-title"
            initial={reduce ? { opacity: 0 } : offscreen}
            animate={reduce ? { opacity: 1 } : { x: 0, y: 0 }}
            exit={reduce ? { opacity: 0 } : offscreen}
            transition={{ type: "tween", duration: reduce ? 0.01 : 0.42, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface shadow-[var(--shadow-lift)] lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:rounded-l-[28px]"
          >
            <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              <div className="relative aspect-[16/9] w-full lg:aspect-[16/10]">
                <ActivityImage
                  destinationId={destinationId}
                  seed={place.id}
                  kind={place.kind}
                  tags={place.tags}
                  image={place.image}
                  alt={place.name}
                  size="fill"
                />
                <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/70 lg:hidden" aria-hidden />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setFocusPlace(null)}
                  aria-label="Close details"
                  className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-[rgba(19,35,58,0.7)] text-[#f6efe2] backdrop-blur transition-colors hover:bg-[rgba(19,35,58,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <X className="h-5 w-5" />
                </button>
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,18,32,0.92)_0%,rgba(10,18,32,0.45)_42%,transparent_70%)]"
                />
                <div className="absolute inset-x-0 bottom-0 px-5 pb-4 sm:px-6">
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e3c17f]">
                    <MapPin className="h-3.5 w-3.5" />
                    {areaName(place.area_id)}
                    {scheduled && (
                      <span className="ml-1 rounded-full bg-[#d9b26a]/25 px-2 py-0.5 text-[#f3ddb0]">
                        In your plan · {scheduled.start_time}
                      </span>
                    )}
                  </p>
                  <h2
                    id="place-sheet-title"
                    className="mt-1 font-display text-[34px] font-semibold leading-[1.02] text-[#fbf7ef] [text-shadow:0_2px_12px_rgba(0,0,0,0.35)] sm:text-[38px]"
                  >
                    {place.name}
                  </h2>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-5 pb-6 pt-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  {travel !== undefined && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[12.5px] font-bold text-on-gold">
                      <CarTaxiFront className="h-4 w-4" />
                      {travel <= 0 ? "You're right here" : `${travel} min by taxi`}
                      {travel > 0 && visit.location?.label ? ` from ${visit.location.label}` : ""}
                    </span>
                  )}
                  {place.address && <span className="text-[13px] text-ink-muted">{place.address}</span>}
                </div>

                <p className="text-[15px] leading-relaxed text-ink-soft">{place.details ?? place.blurb}</p>

                <dl className="grid grid-cols-2 gap-2">
                  <Fact Icon={Clock3} label="Today" value={hoursForDate(place)} />
                  <Fact Icon={Baby} label="Ages" value={agesLabel(place) ?? "All ages"} />
                  <Fact Icon={Footprints} label="Walking" value={walkingLabel(place.walking) ?? "—"} />
                  <Fact
                    Icon={place.indoor_outdoor === "outdoor" ? SunMedium : Building2}
                    label="Setting"
                    value={settingLabel(place.indoor_outdoor)}
                  />
                  <Fact
                    Icon={CalendarCheck}
                    label="Booking"
                    value={place.booking_required ? "Book ahead" : "No booking needed"}
                    wide={!place.signature_dish}
                  />
                  {place.signature_dish && (
                    <Fact Icon={UtensilsCrossed} label="Try" value={place.signature_dish} />
                  )}
                </dl>

                <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:px-6">
                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-[16px] font-bold text-on-gold shadow-[var(--shadow-card)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
                  >
                    <Navigation className="h-4 w-4" />
                    Get directions
                  </a>
                  {place.website && (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-card px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-gold"
                    >
                      Official website
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>

                {place.image_credit && (
                  <p className="text-[11px] text-ink-muted">Photo: {place.image_credit}</p>
                )}
                <p className="text-[11px] leading-snug text-ink-muted">
                  Hours and access can change — check the official website before you go.
                </p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Fact({
  Icon,
  label,
  value,
  wide = false,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border border-line bg-card px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-ink" strokeWidth={1.8} />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</dt>
        <dd className="text-[13.5px] font-semibold leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}
