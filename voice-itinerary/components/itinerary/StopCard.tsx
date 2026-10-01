"use client";

import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Baby,
  Building2,
  ChevronRight,
  Clock3,
  Footprints,
  RefreshCw,
  Sparkles,
  SunMedium,
} from "lucide-react";
import type { ScheduledActivity } from "@/lib/store/itinerary";
import { findPlace } from "@/lib/data";
import { ActivityImage } from "./ActivityImage";
import {
  agesLabel,
  areaName,
  durationLabel,
  settingLabel,
  walkingLabel,
} from "@/components/concierge/placeFormat";

/** One timed stop on the day timeline. */
export const StopCard = forwardRef<
  HTMLDivElement,
  {
    activity: ScheduledActivity;
    destinationId: string | null;
    changed: boolean;
    index?: number;
    onDetails?: (catalogId: string) => void;
  }
>(function StopCard({ activity: a, destinationId, changed, index = 0, onDetails }, ref) {
  const reduce = useReducedMotion();
  const clickable = !!(a.catalog_id && onDetails);
  const place = a.catalog_id ? findPlace(a.catalog_id) : null;
  const area = areaName(a.area_id ?? place?.area_id);
  const walking = walkingLabel(place?.walking);
  const ages = place ? agesLabel(place) : null;
  const image = a.image ?? place?.image;
  const kindLabel =
    place?.kind === "food" ? (place.cuisine ? `${place.cuisine} · Meal` : "Meal") : place ? "Visit" : null;

  return (
    <motion.div
      ref={ref}
      layout={!reduce}
      initial={reduce ? false : changed ? { opacity: 0, y: 14, scale: 0.98 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: changed ? 0.5 : 0.4, delay: changed ? 0.05 : index * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      onClick={clickable ? () => onDetails!(a.catalog_id!) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onDetails!(a.catalog_id!);
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${a.start_time} ${a.title} — open details` : undefined}
      className={`group relative overflow-hidden rounded-[var(--radius-card)] border bg-card transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]" : ""
      } ${changed ? "stop-changed border-gold" : "border-line shadow-[var(--shadow-card)] hover:border-gold/60"}`}
    >
      {changed && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-gold shadow-md">
          <RefreshCw className="h-3 w-3" strokeWidth={2.4} />
          Just updated
        </span>
      )}
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-[16/9] w-full shrink-0 sm:aspect-auto sm:w-[190px] xl:w-[220px]">
          <ActivityImage
            destinationId={destinationId}
            seed={a.catalog_id ?? a.id}
            kind={place?.kind ?? "activity"}
            tags={place?.tags}
            image={image}
            alt={a.title}
            size="fill"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted ${changed ? "sm:pr-32" : ""}`}
          >
            {area && <span className="text-teal">{area}</span>}
            {area && kindLabel && <span aria-hidden>·</span>}
            {kindLabel && <span>{kindLabel}</span>}
          </div>
          <h3 className="font-display text-[24px] font-semibold leading-[1.1] text-ink sm:text-[26px]">
            {a.title}
          </h3>
          {(a.reason || a.notes) && (
            <p className="flex gap-2 text-[14px] leading-snug text-ink-soft">
              <Sparkles className="mt-[3px] h-3.5 w-3.5 shrink-0 text-gold-ink" />
              <span>{a.reason ?? a.notes}</span>
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[12px] text-ink-muted">
            <Meta Icon={Clock3}>{durationLabel(a.duration_min)}</Meta>
            {walking && <Meta Icon={Footprints}>{walking}</Meta>}
            {place && (
              <Meta Icon={place.indoor_outdoor === "outdoor" ? SunMedium : Building2}>
                {settingLabel(place.indoor_outdoor)}
              </Meta>
            )}
            {ages && <Meta Icon={Baby}>{ages}</Meta>}
            {a.catalog_id && onDetails && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onDetails(a.catalog_id!);
                }}
                className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-gold hover:bg-gold/10"
              >
                Details
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function Meta({
  Icon,
  children,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      {children}
    </span>
  );
}
