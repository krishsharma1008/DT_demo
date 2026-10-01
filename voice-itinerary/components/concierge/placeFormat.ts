import type { ActivityDef } from "@/lib/data/types";
import { dubai } from "@/lib/data";
import { dateToWeekday } from "@/lib/store/itinerary";

export function areaName(id: string | undefined | null): string | null {
  if (!id) return null;
  return dubai.areas.find((a) => a.id === id)?.name ?? id.replace(/_/g, " ");
}

/** Today's date in Dubai as yyyy-mm-dd. */
export function dubaiTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function hoursForDate(place: ActivityDef, iso = dubaiTodayIso()): string {
  const wd = dateToWeekday(iso);
  if (place.closed_days.includes(wd)) return "Closed today";
  if (place.available_hours.length === 0) return "Open all day";
  return place.available_hours.map((h) => `${h.open}–${h.close}`).join(", ");
}

export function agesLabel(place: ActivityDef): string | null {
  if (place.min_age === undefined) return place.kid_friendly ? "Family-friendly" : null;
  return place.min_age <= 0 ? "All ages" : `Ages ${place.min_age}+`;
}

export function walkingLabel(w: ActivityDef["walking"]): string | null {
  if (!w) return null;
  return w === "minimal" ? "Minimal walking" : w === "some" ? "Some walking" : "Lots of walking";
}

export function settingLabel(io: ActivityDef["indoor_outdoor"]): string {
  return io === "indoor" ? "Indoor" : io === "outdoor" ? "Outdoor" : "Indoor & outdoor";
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function travelLabel(min: number | undefined): string | null {
  if (min === undefined || min === null) return null;
  if (min <= 0) return "Right here";
  return `${min} min by taxi`;
}

export function formatDayDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
