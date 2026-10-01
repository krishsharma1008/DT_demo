/**
 * In-destination concierge brain. Pure functions over the catalog + the
 * visitor's session memory (Visit): resolve "where are we", plan a timed
 * family-suitable day, swap one stop, and find options near the visitor now.
 *
 * Kept free of React/zustand so the four demo use cases are unit-testable.
 */

import type { ActivityDef, AreaDef, DestinationDef, Weekday } from "@/lib/data/types";
import type { Visit, VisitorLocation } from "@/lib/store/itinerary";
import { travelMinutes, type LatLng } from "./geo";

export const DOWNTOWN: LatLng = { lat: 25.1972, lng: 55.2744 };

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function toMin(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function toTime(mins: number): string {
  const c = Math.max(0, Math.min(mins, 23 * 60 + 59));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

const roundUp15 = (m: number) => Math.ceil(m / 15) * 15;

export function weekdayOfIso(date: string): Weekday {
  return WEEKDAYS[new Date(date + "T00:00:00Z").getUTCDay()]!;
}

function monthOfIso(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCMonth() + 1;
}

// ── Location ────────────────────────────────────────────────────────────────

/** Spoken-name aliases → area ids. Checked when no specific place matches. */
const AREA_ALIASES: Array<[string, string[]]> = [
  ["downtown", ["downtown", "dubai mall", "burj khalifa", "business bay", "difc", "opera district", "souk al bahar"]],
  ["marina", ["marina", "jlt", "jumeirah lakes"]],
  ["jbr", ["jbr", "jumeirah beach residence", "bluewaters", "the walk", "the beach"]],
  ["old_dubai", ["old dubai", "deira", "bur dubai", "al fahidi", "bastakiya", "creek", "gold souk", "spice souk", "al seef"]],
  ["palm", ["palm", "atlantis"]],
  ["jumeirah", ["jumeirah", "city walk", "la mer", "kite beach", "umm suqeim"]],
  ["al_barsha", ["barsha", "mall of the emirates", "ski dubai"]],
  ["creek_harbour", ["creek harbour", "festival city", "al jaddaf", "ras al khor"]],
  ["al_quoz", ["al quoz", "alserkal"]],
  ["hatta", ["hatta"]],
  ["abu_dhabi", ["abu dhabi", "yas island", "saadiyat"]],
  ["sharjah", ["sharjah"]],
  ["ras_al_khaimah", ["ras al khaimah", "rak", "jebel jais"]],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Core name used for matching: "Zuma, DIFC" → "zuma", "Burj Khalifa observation deck" stays. */
function coreName(name: string): string {
  return norm(name.split(",")[0] ?? name);
}

export function areaCoords(dest: DestinationDef, area_id?: string): LatLng | undefined {
  if (!area_id) return undefined;
  return dest.areas.find((a) => a.id === area_id)?.coords;
}

export function placeCoords(dest: DestinationDef, p: ActivityDef): LatLng {
  return p.coords ?? areaCoords(dest, p.area_id) ?? DOWNTOWN;
}

export function allPlacesOf(dest: DestinationDef): ActivityDef[] {
  return [...dest.activities, ...dest.food];
}

export function resolveLocation(text: string, dest: DestinationDef): VisitorLocation {
  const t = ` ${norm(text)} `;
  // 1. A specific catalog place named in the text (longest name wins).
  let best: ActivityDef | null = null;
  for (const p of allPlacesOf(dest)) {
    const n = coreName(p.name);
    if (n.length >= 5 && t.includes(` ${n} `) && (!best || n.length > coreName(best.name).length)) {
      best = p;
    }
  }
  if (best) {
    return {
      label: best.name,
      coords: placeCoords(dest, best),
      area_id: best.area_id,
      place_id: best.id,
    };
  }
  // 2. An area by alias, id or name.
  const areaHit = (a: AreaDef) =>
    t.includes(` ${norm(a.name)} `) || t.includes(` ${a.id.replace(/_/g, " ")} `);
  for (const [area_id, aliases] of AREA_ALIASES) {
    const area = dest.areas.find((a) => a.id === area_id);
    if (!area) continue;
    if (aliases.some((al) => t.includes(` ${al} `)) || areaHit(area)) {
      return { label: area.name, coords: area.coords, area_id };
    }
  }
  for (const area of dest.areas) {
    if (areaHit(area)) return { label: area.name, coords: area.coords, area_id: area.id };
  }
  return { label: text.trim() };
}

export function visitorCoords(dest: DestinationDef, visit: Visit): LatLng {
  return visit.location?.coords ?? areaCoords(dest, visit.location?.area_id) ?? DOWNTOWN;
}

// ── Fit checks ──────────────────────────────────────────────────────────────

export type Requirements = {
  indoor?: boolean;
  avoid_tags?: string[];
  kind?: "activity" | "food";
  max_travel_min?: number;
  allow_day_trips?: boolean;
};

const singular = (s: string) => s.toLowerCase().trim().replace(/s$/, "");

function hasTag(p: ActivityDef, tag: string): boolean {
  const want = singular(tag);
  if (!want) return false;
  return (
    p.tags.some((x) => singular(x) === want || singular(x).includes(want)) ||
    norm(p.name).split(" ").some((w) => singular(w) === want) ||
    singular(p.kind) === want
  );
}

export function isDayTrip(p: ActivityDef): boolean {
  return (p.emirate !== undefined && p.emirate !== "dubai") || p.area_id === "hatta";
}

/** Does this place suit the visiting party and their stated constraints? */
export function fitsVisit(p: ActivityDef, visit: Visit, req: Requirements = {}): boolean {
  const kids = visit.party?.children ?? [];
  if (kids.length > 0) {
    const youngest = Math.min(...kids);
    if (p.min_age !== undefined ? p.min_age > youngest : !p.kid_friendly) return false;
  }
  if (visit.low_walking) {
    if (p.walking ? p.walking === "lots" : p.intensity === "active") return false;
  }
  if ((visit.indoor_only || req.indoor) && p.indoor_outdoor !== "indoor") return false;
  const avoid = [...visit.avoid_tags, ...(req.avoid_tags ?? [])];
  if (avoid.some((tag) => hasTag(p, tag))) return false;
  if (!req.allow_day_trips && isDayTrip(p)) return false;
  return true;
}

export function isOpen(p: ActivityDef, date: string, startMin: number, durMin: number): boolean {
  if (p.closed_days.includes(weekdayOfIso(date))) return false;
  if (p.seasonal && !p.seasonal.open_months.includes(monthOfIso(date))) return false;
  if (p.available_hours.length === 0) return true;
  return p.available_hours.some((h) => {
    const open = toMin(h.open);
    let close = toMin(h.close);
    if (close <= open) close = 24 * 60; // after-midnight close
    if (close === 23 * 60 + 59) close = 24 * 60;
    return startMin >= open && startMin + durMin <= close;
  });
}

function slotOfDay(m: number): "morning" | "afternoon" | "sunset" | "evening" {
  if (m < 12 * 60) return "morning";
  if (m < 17 * 60) return "afternoon";
  if (m < 19 * 60) return "sunset";
  return "evening";
}

function isSummer(date: string) {
  const mo = monthOfIso(date);
  return mo >= 5 && mo <= 9;
}

// ── Reasons ─────────────────────────────────────────────────────────────────

export function buildReason(
  p: ActivityDef,
  ctx: { visit: Visit; travel_min: number; from_label?: string; start_min: number; date: string },
): string {
  const bits: string[] = [];
  const kids = ctx.visit.party?.children ?? [];
  const isFood = p.kind === "food";
  if (kids.length > 0) {
    if (isFood) bits.push("relaxed, family-friendly stop");
    else if (p.min_age !== undefined && p.min_age > 0) bits.push(`suits ages ${p.min_age}+`);
    else bits.push(kids.length > 1 ? "fun for both kids" : "great for kids");
  }
  if (p.indoor_outdoor === "indoor" && (ctx.visit.indoor_only || isSummer(ctx.date) || !isFood)) {
    bits.push(isSummer(ctx.date) ? "air-conditioned, out of the heat" : "indoors");
  }
  if (ctx.visit.low_walking && p.walking !== "lots") bits.push("very little walking");
  const match = ctx.visit.interests.find((i) => hasTag(p, i));
  if (match) bits.push(`matches your interest in ${match}`);
  if (p.best_time.includes(slotOfDay(ctx.start_min)) && !isFood && bits.length < 3) {
    const s = slotOfDay(ctx.start_min);
    bits.push(s === "sunset" ? "best at sunset" : `best in the ${s}`);
  }
  if (isFood && p.cuisine && bits.length < 3) bits.push(p.cuisine.toLowerCase());
  const travel =
    ctx.travel_min <= 0
      ? "right where you are"
      : ctx.travel_min <= 10
        ? `${ctx.travel_min} min from ${ctx.from_label ?? "your last stop"}`
        : `${ctx.travel_min} min by taxi`;
  const picked = [...bits.slice(0, 2), travel];
  const s = picked.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function score(
  p: ActivityDef,
  ctx: { visit: Visit; travel_min: number; start_min: number; date: string; must?: Set<string> },
): number {
  let s = 10 - ctx.travel_min / 4;
  const kids = (ctx.visit.party?.children.length ?? 0) > 0;
  if (kids && p.tags.some((t) => /family|kids|child/.test(t))) s += 2;
  if (ctx.visit.interests.some((i) => hasTag(p, i))) s += 3;
  if (p.best_time.includes(slotOfDay(ctx.start_min))) s += 2;
  if (p.tags.includes("iconic")) s += 1.5;
  if (ctx.visit.low_walking && p.walking === "minimal") s += 1;
  const midday = ctx.start_min >= 11 * 60 && ctx.start_min < 17 * 60;
  if (isSummer(ctx.date) && midday) s += p.indoor_outdoor === "indoor" ? 3 : p.indoor_outdoor === "outdoor" ? -6 : 0;
  if (p.booking_required) s -= 0.5;
  if (p.price_band === 4) s -= 1;
  if (ctx.must?.has(p.id)) s += 25;
  return s;
}

// ── Plan a day ──────────────────────────────────────────────────────────────

export type PlannedStop = {
  place: ActivityDef;
  start_time: string;
  duration_min: number;
  travel_min: number;
  reason: string;
};

function durationFor(p: ActivityDef, visit: Visit, meal: "lunch" | "dinner" | null): number {
  if (meal === "lunch") return 60;
  if (meal === "dinner") return 75;
  const kids = (visit.party?.children.length ?? 0) > 0;
  const cap = kids || visit.low_walking ? 120 : 180;
  return Math.max(p.duration_min.min, Math.min(p.duration_min.typical, cap));
}

export function planVisitDay(input: {
  dest: DestinationDef;
  visit: Visit;
  date: string;
  start: string;
  end: string;
  must_include?: string[];
  exclude_ids?: string[];
  allow_day_trips?: boolean;
}): PlannedStop[] {
  const { dest, visit, date } = input;
  const endM = toMin(input.end);
  let cur = roundUp15(toMin(input.start));
  let loc = visitorCoords(dest, visit);
  let locLabel = visit.location?.label ?? "Downtown";
  const used = new Set(input.exclude_ids ?? []);
  const must = new Set(input.must_include ?? []);
  const lowMobility = visit.low_walking || (visit.party?.children.length ?? 0) > 0;
  const maxTravel = lowMobility ? 25 : 35;
  let hadLunch = cur > 14 * 60 + 30;
  let hadDinner = endM < 19 * 60 + 30;
  const stops: PlannedStop[] = [];
  const req: Requirements = { allow_day_trips: input.allow_day_trips };

  while (cur + 45 <= endM && stops.length < 7) {
    if (!hadLunch && cur > 14 * 60 + 30) hadLunch = true;
    const meal: "lunch" | "dinner" | null =
      !hadLunch && cur >= 12 * 60 ? "lunch" : !hadDinner && cur >= 18 * 60 + 30 ? "dinner" : null;
    const pool = meal ? dest.food : dest.activities;

    let best: { p: ActivityDef; s: number; start: number; dur: number; travel: number } | null = null;
    for (const p of pool) {
      if (used.has(p.id) || !fitsVisit(p, visit, req)) continue;
      const travel = travelMinutes(loc, placeCoords(dest, p));
      if (travel > (input.allow_day_trips ? 150 : maxTravel) && !must.has(p.id)) continue;
      const start = roundUp15(cur + travel);
      const dur = Math.min(durationFor(p, visit, meal), endM - start);
      if (dur < Math.min(p.duration_min.min, meal ? 45 : p.duration_min.min)) continue;
      if (!isOpen(p, date, start, dur)) continue;
      const sc = score(p, { visit, travel_min: travel, start_min: start, date, must });
      if (!best || sc > best.s) best = { p, s: sc, start, dur, travel };
    }

    if (!best) {
      if (meal === "lunch") hadLunch = true;
      else if (meal === "dinner") hadDinner = true;
      else cur += 30;
      continue;
    }
    stops.push({
      place: best.p,
      start_time: toTime(best.start),
      duration_min: best.dur,
      travel_min: best.travel,
      reason: buildReason(best.p, {
        visit,
        travel_min: best.travel,
        from_label: locLabel,
        start_min: best.start,
        date,
      }),
    });
    used.add(best.p.id);
    loc = placeCoords(dest, best.p);
    locLabel = best.p.name.split(",")[0] ?? best.p.name;
    if (meal === "lunch") hadLunch = true;
    if (meal === "dinner") hadDinner = true;
    cur = best.start + best.dur + 15;
  }
  return stops;
}

// ── Change one stop ─────────────────────────────────────────────────────────

export type DayStopRef = {
  id: string;
  catalog_id?: string;
  title: string;
  start_time: string;
  duration_min: number;
};

export function findReplacements(input: {
  dest: DestinationDef;
  visit: Visit;
  date: string;
  stops: DayStopRef[];
  target_id: string;
  require?: Requirements;
  count?: number;
}): PlannedStop[] {
  const { dest, visit, date } = input;
  const sorted = [...input.stops].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const idx = sorted.findIndex((s) => s.id === input.target_id);
  if (idx < 0) return [];
  const target = sorted[idx]!;
  const prev = sorted[idx - 1];
  const next = sorted[idx + 1];
  const targetPlace = target.catalog_id ? allPlacesOf(dest).find((p) => p.id === target.catalog_id) : undefined;
  const kind = input.require?.kind ?? (targetPlace?.kind === "food" ? "food" : "activity");
  const prevPlace = prev?.catalog_id ? allPlacesOf(dest).find((p) => p.id === prev.catalog_id) : undefined;
  const from = prevPlace ? placeCoords(dest, prevPlace) : visitorCoords(dest, visit);
  const fromLabel = prevPlace?.name.split(",")[0] ?? visit.location?.label;

  const startM = toMin(target.start_time);
  const window = next ? toMin(next.start_time) - startM - 15 : target.duration_min + 60;
  const taken = new Set(sorted.map((s) => s.catalog_id).filter(Boolean) as string[]);
  const pool = kind === "food" ? dest.food : dest.activities;
  const maxTravel = input.require?.max_travel_min ?? 30;

  const scored: Array<PlannedStop & { s: number }> = [];
  for (const p of pool) {
    if (taken.has(p.id) || !fitsVisit(p, visit, input.require)) continue;
    const travel = travelMinutes(from, placeCoords(dest, p));
    if (travel > maxTravel) continue;
    const dur = Math.min(durationFor(p, visit, null), Math.max(window, 0));
    if (dur < p.duration_min.min) continue;
    if (!isOpen(p, date, startM, dur)) continue;
    const s = score(p, { visit, travel_min: travel, start_min: startM, date });
    scored.push({
      s,
      place: p,
      start_time: target.start_time,
      duration_min: dur,
      travel_min: travel,
      reason: buildReason(p, { visit, travel_min: travel, from_label: fromLabel, start_min: startM, date }),
    });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, input.count ?? 3)
    .map(({ s: _s, ...rest }) => rest);
}

// ── Help me now ─────────────────────────────────────────────────────────────

export type NearbyOption = {
  place: ActivityDef;
  travel_min: number;
  reason: string;
};

export function findNearbyNow(input: {
  dest: DestinationDef;
  visit: Visit;
  from: LatLng;
  from_label?: string;
  date: string;
  time: string;
  max_minutes: number;
  purpose?: "rest" | "eat" | "fun" | "any";
  exclude_ids?: string[];
  count?: number;
}): { options: NearbyOption[]; hours_relaxed: boolean } {
  const { dest, visit, date } = input;
  const purpose = input.purpose ?? "any";
  const nowM = toMin(input.time);
  const exclude = new Set(input.exclude_ids ?? []);
  const pool =
    purpose === "eat" ? dest.food : purpose === "fun" ? dest.activities : allPlacesOf(dest);

  const run = (respectHours: boolean) => {
    const out: Array<NearbyOption & { s: number }> = [];
    for (const p of pool) {
      if (exclude.has(p.id) || !fitsVisit(p, visit)) continue;
      const travel = travelMinutes(input.from, placeCoords(dest, p));
      if (travel > input.max_minutes) continue;
      const stay = Math.min(p.duration_min.typical, 90);
      if (respectHours && !isOpen(p, date, nowM + travel, Math.min(stay, p.duration_min.min))) continue;
      let s = 10 - travel / 3;
      if (purpose === "rest") {
        if (p.intensity === "chill") s += 3;
        if (p.walking === "minimal") s += 2;
        if (p.indoor_outdoor === "indoor") s += 2;
        if (p.tags.some((t) => /rest|cafe|café|relax|cinema|show/.test(t)) || p.kind === "food") s += 2;
        if (p.intensity === "active") s -= 5;
      }
      if ((visit.party?.children.length ?? 0) > 0 && p.tags.some((t) => /family|kids/.test(t))) s += 1.5;
      if (visit.interests.some((i) => hasTag(p, i))) s += 2;
      out.push({
        s,
        place: p,
        travel_min: travel,
        reason: buildReason(p, {
          visit,
          travel_min: travel,
          from_label: input.from_label,
          start_min: nowM + travel,
          date,
        }),
      });
    }
    out.sort((a, b) => b.s - a.s);
    // Prefer two different kinds of option (e.g. one café, one activity).
    const picked: typeof out = [];
    for (const o of out) {
      if (picked.length === 0) picked.push(o);
      else if (picked.every((x) => x.place.kind !== o.place.kind || x.place.area_id !== o.place.area_id)) picked.push(o);
      if (picked.length >= (input.count ?? 2)) break;
    }
    for (const o of out) {
      if (picked.length >= (input.count ?? 2)) break;
      if (!picked.includes(o)) picked.push(o);
    }
    return picked.map(({ s: _s, ...rest }) => rest);
  };

  const strict = run(true);
  if (strict.length > 0) return { options: strict, hours_relaxed: false };
  return { options: run(false), hours_relaxed: true };
}
