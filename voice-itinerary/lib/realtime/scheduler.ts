/**
 * Constraint-aware scheduler. Per Codex P0 #4 (PLAN §14.3): add_activity is NOT
 * a blind setter. It rejects hard collisions, respects closed_days and
 * available_hours, and returns alternatives the model can speak aloud.
 */

import type {
  ActivityDef,
  DayTemplate,
  DestinationDef,
  Weekday,
} from "@/lib/data/types";
import {
  type DayMode,
  type ItineraryDay,
  type ScheduledActivity,
  dateToWeekday,
  minutesToTime,
  timeToMinutes,
} from "@/lib/store/itinerary";

export type Conflict =
  | { kind: "fixed_event"; with: string; at: string }
  | { kind: "activity_overlap"; with: string; at: string }
  | { kind: "closed_day"; weekday: Weekday }
  | { kind: "outside_hours"; window: string }
  | { kind: "transit_buffer_required"; from: string; minutes: number }
  | { kind: "before_morning_floor" };

export type ScheduleResult =
  | {
      ok: true;
      placement: { day_index: number; start_time: string; duration_min: number };
    }
  | {
      ok: false;
      conflict: Conflict;
      alternatives: { day_index: number; start_time: string }[];
    };

const MORNING_FLOOR = "09:00";
const TRANSIT_BUFFER_MIN = 30;

function within(
  start: number,
  end: number,
  windowOpen: number,
  windowClose: number,
): boolean {
  return start >= windowOpen && end <= windowClose;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Try to place an activity on a specific day at a specific time. Returns
 * structured success/failure so the model can recover with a spoken pivot.
 */
export function trySchedule(input: {
  day: ItineraryDay;
  activity?: ActivityDef;
  start_time: string;
  duration_min: number;
  area_id?: string;
  transit_time_matrix?: Record<string, Record<string, number>>;
}): ScheduleResult {
  const { day, activity, start_time, duration_min, area_id, transit_time_matrix } = input;
  const start = timeToMinutes(start_time);
  const end = start + duration_min;
  const startBound = timeToMinutes(MORNING_FLOOR);

  if (start < startBound) {
    return {
      ok: false,
      conflict: { kind: "before_morning_floor" },
      alternatives: [{ day_index: day.index, start_time: MORNING_FLOOR }],
    };
  }

  if (activity) {
    const weekday = dateToWeekday(day.date);
    if (activity.closed_days.includes(weekday)) {
      // Suggest the nearest open day among the next 7
      return {
        ok: false,
        conflict: { kind: "closed_day", weekday },
        alternatives: [],
      };
    }

    if (activity.available_hours.length > 0) {
      const fits = activity.available_hours.some((h) =>
        within(
          start,
          end,
          timeToMinutes(h.open),
          timeToMinutes(h.close),
        ),
      );
      if (!fits) {
        const window = activity.available_hours
          .map((h) => `${h.open}–${h.close}`)
          .join(", ");
        const firstOpen = activity.available_hours[0]?.open ?? MORNING_FLOOR;
        return {
          ok: false,
          conflict: { kind: "outside_hours", window },
          alternatives: [{ day_index: day.index, start_time: firstOpen }],
        };
      }
    }
  }

  // Fixed events are hard rejections.
  for (const ev of day.fixed_events) {
    const evStart = timeToMinutes(ev.start_time);
    const evEnd = evStart + ev.duration_min;
    if (overlaps(start, end, evStart, evEnd)) {
      return {
        ok: false,
        conflict: { kind: "fixed_event", with: ev.title, at: ev.start_time },
        alternatives: [
          { day_index: day.index, start_time: minutesToTime(evEnd + 30) },
        ],
      };
    }
  }

  // Existing activity overlaps are hard rejections.
  for (const a of day.activities) {
    const aStart = timeToMinutes(a.start_time);
    const aEnd = aStart + a.duration_min;
    if (overlaps(start, end, aStart, aEnd)) {
      return {
        ok: false,
        conflict: { kind: "activity_overlap", with: a.title, at: a.start_time },
        alternatives: [
          { day_index: day.index, start_time: minutesToTime(aEnd + 30) },
        ],
      };
    }
  }

  // Transit buffer between different areas.
  if (area_id && transit_time_matrix) {
    const previous = previousScheduled(day, start);
    if (previous && previous.area_id && previous.area_id !== area_id) {
      const transit =
        transit_time_matrix[previous.area_id]?.[area_id] ?? TRANSIT_BUFFER_MIN;
      const previousEnd =
        timeToMinutes(previous.start_time) + previous.duration_min;
      if (start - previousEnd < transit) {
        return {
          ok: false,
          conflict: {
            kind: "transit_buffer_required",
            from: previous.area_id,
            minutes: transit,
          },
          alternatives: [
            {
              day_index: day.index,
              start_time: minutesToTime(previousEnd + transit),
            },
          ],
        };
      }
    }
  }

  return {
    ok: true,
    placement: { day_index: day.index, start_time, duration_min },
  };
}

function previousScheduled(
  day: ItineraryDay,
  beforeMinutes: number,
): ScheduledActivity | null {
  const sorted = [...day.activities].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );
  let last: ScheduledActivity | null = null;
  for (const a of sorted) {
    if (timeToMinutes(a.start_time) < beforeMinutes) last = a;
    else break;
  }
  return last;
}

// ── Day-level planner (WS-3 / WS-4) ──────────────────────────────────────
//
// The realtime model used to leave days as "Open day — talk to fill it"
// because it would only call add_activity when the user named something.
// planDay() and proposeFullItinerary() take that responsibility off the
// model: pick a template that matches the day's intent, drop slots that
// would conflict with fixed_events / closed_days / morning floor, apply
// transit buffers, and return a ready-to-add list of slots.
//
// The model's job becomes: ONE tool call per day (or one for the whole
// trip), then a parallel batch of add_activity. No more multi-turn
// "what kind of activities do you like" interrogation.

export type PlanIntent =
  | "auto"
  | "work"
  | "chill"
  | "adventure"
  | "cultural"
  | "foodie"
  | "transit";

export type PlannedSlot = {
  start_time: string;
  duration_min: number;
  activity_id?: string;
  title: string;
  notes?: string;
  area_id?: string;
};

export type PlanDayResult =
  | {
      ok: true;
      day_index: number;
      slots: PlannedSlot[];
      rationale: string;
      template_id?: string;
    }
  | {
      ok: false;
      day_index: number;
      reason: string;
    };

/** DayMode → preferred template moods, in priority order. */
const MODE_TO_TEMPLATE_MOODS: Record<DayMode, DayTemplate["mood"][]> = {
  work: ["work", "cultural", "chill"],
  leisure: ["chill", "cultural", "foodie", "family"],
  chill: ["chill", "foodie"],
  adventure: ["adventure", "cultural", "chill"],
  travel: [], // partial day; planDay returns ok:false reason:"transit_day"
};

/** PlanIntent → preferred template moods. */
const INTENT_TO_MOODS: Record<PlanIntent, DayTemplate["mood"][]> = {
  auto: [],
  work: ["work"],
  chill: ["chill", "foodie"],
  adventure: ["adventure", "cultural"],
  cultural: ["cultural", "chill"],
  foodie: ["foodie", "chill"],
  transit: [],
};

const DEFAULT_SLOT_DURATION = 90;
const POST_FIXED_BUFFER_MIN = 30;

function lookupCatalog(
  dest: DestinationDef,
  id: string,
): ActivityDef | undefined {
  return (
    dest.activities.find((a) => a.id === id) ??
    dest.food.find((f) => f.id === id)
  );
}

/** Logical region for an area_id; null if the dest doesn't define regions. */
export function areaToRegion(
  dest: DestinationDef,
  area_id: string | undefined,
): string | null {
  if (!area_id || !dest.regions) return null;
  for (const [region, areas] of Object.entries(dest.regions)) {
    if (areas.includes(area_id)) return region;
  }
  return null;
}

/**
 * Most-frequent region across a template's resolved slots. Slots without an
 * `area_id` (free-text notes) don't count. Returns null if the dest has no
 * regions defined OR no slots resolve to a known area.
 */
export function templatePrimaryRegion(
  template: DayTemplate,
  dest: DestinationDef,
): string | null {
  if (!dest.regions) return null;
  const counts: Record<string, number> = {};
  for (const slot of template.slots) {
    const id = slot.activity_id ?? slot.food_id;
    if (!id) continue;
    const item = lookupCatalog(dest, id);
    if (!item) continue;
    const region = areaToRegion(dest, item.area_id);
    if (!region) continue;
    counts[region] = (counts[region] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![0];
}

/**
 * Hard region exclusion. If a stay's region is known and a template's
 * primary region differs, exclude — UNLESS must_include carries an item
 * inside the template's region (the user explicitly opted in).
 */
function templateAllowedForRegion(args: {
  template: DayTemplate;
  dest: DestinationDef;
  stay_region: string | null;
  must_include_regions: Set<string>;
}): boolean {
  if (!args.stay_region) return true; // no region info → fall back to soft scoring
  const tplRegion = templatePrimaryRegion(args.template, args.dest);
  if (!tplRegion) return true; // template doesn't map to any region (rare)
  if (tplRegion === args.stay_region) return true;
  return args.must_include_regions.has(tplRegion);
}

/**
 * Score a template against a day. Higher = better fit. Negative = exclude.
 * Considers: mood match, area_id overlap with input, presence of
 * activities open today, exclude_template_ids.
 */
function scoreTemplate(args: {
  template: DayTemplate;
  preferred_moods: DayTemplate["mood"][];
  weekday: Weekday;
  area_id?: string;
  dest: DestinationDef;
  exclude_template_ids?: string[];
}): number {
  const { template, preferred_moods, weekday, area_id, dest } = args;
  if (args.exclude_template_ids?.includes(template.id)) return -1000;

  let score = 0;
  const moodIdx = preferred_moods.indexOf(template.mood);
  if (preferred_moods.length > 0) {
    // Mood is the primary signal: an exact match must beat a longer template
    // of a secondary mood (open-slot credit below scales with slot count).
    if (moodIdx === -1) score -= 10;
    else score += 24 - moodIdx * 8;
  }

  // Reward templates whose slots are mostly open today.
  let openSlots = 0;
  let closedSlots = 0;
  let areaHits = 0;
  for (const slot of template.slots) {
    const id = slot.activity_id ?? slot.food_id;
    if (!id) continue;
    const item = lookupCatalog(dest, id);
    if (!item) continue;
    if (item.closed_days.includes(weekday)) closedSlots++;
    else openSlots++;
    if (area_id && item.area_id === area_id) areaHits++;
  }
  score += openSlots * 1.5 - closedSlots * 3;
  if (area_id) score += areaHits * 2;

  return score;
}

function pickTemplate(args: {
  templates: DayTemplate[];
  preferred_moods: DayTemplate["mood"][];
  weekday: Weekday;
  area_id?: string;
  dest: DestinationDef;
  exclude_template_ids?: string[];
  /** Stay region for hard-exclusion. Null disables locking. */
  stay_region?: string | null;
  /** Regions covered by must_include items — they bypass the lock. */
  must_include_regions?: Set<string>;
}): DayTemplate | null {
  if (args.templates.length === 0) return null;
  const stay_region = args.stay_region ?? null;
  const must_include_regions = args.must_include_regions ?? new Set<string>();

  // First filter HARD by region (codex review: soft scoring let
  // Palolem win for an Anjuna stay).
  const inRegion = args.templates.filter((t) =>
    templateAllowedForRegion({
      template: t,
      dest: args.dest,
      stay_region,
      must_include_regions,
    }),
  );

  // If the region filter wiped everything out (e.g., the user picked a
  // niche region with no templates), fall back to the unfiltered set so
  // the user gets *something*.
  const pool = inRegion.length > 0 ? inRegion : args.templates;

  const scored = pool
    .map((t) => ({ template: t, score: scoreTemplate({ ...args, template: t }) }))
    .filter((s) => s.score > -100);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.template;
}

/**
 * Take a single day and produce a list of slots ready to be added via the
 * existing add_activity flow. The slots are pre-filtered for opening hours,
 * closed days, fixed_event collisions, morning floor, and area transit.
 */
export function planDay(input: {
  day: ItineraryDay;
  dest: DestinationDef;
  intent?: PlanIntent;
  area_id?: string;
  /** Stay area used for HARD region locking. */
  stay_area_id?: string;
  must_include?: string[];
  exclude_template_ids?: string[];
}): PlanDayResult {
  const { day, dest } = input;
  const intent = input.intent ?? "auto";

  // Travel days: scheduler stays out of the way; the day is anchored by
  // the flight. The model can still add specific items via add_activity
  // (e.g., a quick lunch near the airport).
  if (day.mode === "travel" || intent === "transit") {
    return {
      ok: false,
      day_index: day.index,
      reason: "transit_day",
    };
  }

  const preferred_moods =
    intent === "auto" ? MODE_TO_TEMPLATE_MOODS[day.mode] : INTENT_TO_MOODS[intent];

  const weekday = dateToWeekday(day.date);

  // Region lock setup. The user's stay area determines which region the
  // model is allowed to draw from; must_include items can opt the user
  // into a far region for a specific day.
  const stay_region = areaToRegion(dest, input.stay_area_id);
  const must_include_regions = new Set<string>();
  for (const id of input.must_include ?? []) {
    const item = lookupCatalog(dest, id);
    const r = areaToRegion(dest, item?.area_id);
    if (r) must_include_regions.add(r);
  }

  const template = pickTemplate({
    templates: dest.canonical_day_templates,
    preferred_moods,
    weekday,
    area_id: input.area_id,
    dest,
    exclude_template_ids: input.exclude_template_ids,
    stay_region,
    must_include_regions,
  });

  if (!template) {
    return {
      ok: false,
      day_index: day.index,
      reason: "no_matching_template",
    };
  }

  // 1. Map template slots into resolved PlannedSlots.
  const resolved: PlannedSlot[] = [];
  for (const slot of template.slots) {
    const id = slot.activity_id ?? slot.food_id;
    const catalogItem = id ? lookupCatalog(dest, id) : undefined;

    const duration = catalogItem?.duration_min.typical ?? DEFAULT_SLOT_DURATION;
    const title = catalogItem?.name ?? slot.notes ?? "Open slot";

    if (catalogItem) {
      // Drop closed-day slots.
      if (catalogItem.closed_days.includes(weekday)) continue;
      // Drop slots whose available_hours don't include this start time.
      if (catalogItem.available_hours.length > 0) {
        const slotStart = timeToMinutes(slot.time);
        const slotEnd = slotStart + duration;
        const fits = catalogItem.available_hours.some((h) =>
          slotStart >= timeToMinutes(h.open) &&
          slotEnd <= timeToMinutes(h.close),
        );
        if (!fits) continue;
      }
    }

    resolved.push({
      start_time: slot.time,
      duration_min: duration,
      activity_id: id,
      title,
      notes: slot.notes,
      area_id: catalogItem?.area_id,
    });
  }

  // 2. Drop slots before MORNING_FLOOR.
  const floor = timeToMinutes(MORNING_FLOOR);
  const afterFloor = resolved.filter(
    (s) => timeToMinutes(s.start_time) >= floor,
  );

  // 3. Drop / shift slots that overlap fixed_events (with a 30-min buffer).
  const sortedFixed = [...day.fixed_events].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );
  let nonConflicting: PlannedSlot[] = afterFloor.filter((s) => {
    const sStart = timeToMinutes(s.start_time);
    const sEnd = sStart + s.duration_min;
    for (const ev of sortedFixed) {
      const evStart = timeToMinutes(ev.start_time);
      const evEnd = evStart + ev.duration_min + POST_FIXED_BUFFER_MIN;
      if (overlaps(sStart, sEnd, evStart - POST_FIXED_BUFFER_MIN, evEnd)) {
        return false;
      }
    }
    return true;
  });

  // 4. Apply transit buffers between successive slots in different areas.
  nonConflicting.sort((a, b) => a.start_time.localeCompare(b.start_time));
  const buffered: PlannedSlot[] = [];
  for (const slot of nonConflicting) {
    const last = buffered[buffered.length - 1];
    if (
      last &&
      last.area_id &&
      slot.area_id &&
      last.area_id !== slot.area_id &&
      dest.transit_time_matrix[last.area_id]?.[slot.area_id] !== undefined
    ) {
      const transit = dest.transit_time_matrix[last.area_id][slot.area_id]!;
      const lastEnd = timeToMinutes(last.start_time) + last.duration_min;
      const newStart = lastEnd + transit;
      const declaredStart = timeToMinutes(slot.start_time);
      if (declaredStart < newStart) {
        buffered.push({ ...slot, start_time: minutesToTime(newStart) });
        continue;
      }
    }
    buffered.push(slot);
  }

  // 5. Anchor must_include items first; drop any buffered slot that conflicts.
  const must = (input.must_include ?? [])
    .map((id) => lookupCatalog(dest, id))
    .filter(
      (item): item is ActivityDef =>
        Boolean(item) && !(item as ActivityDef).closed_days.includes(weekday),
    );
  let final: PlannedSlot[] = buffered;
  if (must.length > 0) {
    const mustSlots: PlannedSlot[] = must.map((item) => ({
      start_time: item.available_hours[0]?.open ?? "10:00",
      duration_min: item.duration_min.typical,
      activity_id: item.id,
      title: item.name,
      area_id: item.area_id,
    }));
    // Drop buffered slots that overlap any must_include slot.
    final = [...mustSlots];
    for (const s of buffered) {
      const sStart = timeToMinutes(s.start_time);
      const sEnd = sStart + s.duration_min;
      const conflicts = mustSlots.some((m) => {
        const mStart = timeToMinutes(m.start_time);
        const mEnd = mStart + m.duration_min;
        return overlaps(sStart, sEnd, mStart, mEnd);
      });
      if (!conflicts) final.push(s);
    }
    final.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  if (final.length === 0) {
    return {
      ok: false,
      day_index: day.index,
      reason: "all_slots_filtered_out",
    };
  }

  const rationale = buildRationale(template, final);
  return {
    ok: true,
    day_index: day.index,
    slots: final,
    rationale,
    template_id: template.id,
  };
}

function buildRationale(template: DayTemplate, slots: PlannedSlot[]): string {
  const titles = slots
    .filter((s) => s.activity_id)
    .map((s) => s.title.toLowerCase())
    .slice(0, 3);
  if (titles.length === 0)
    return `${template.title.toLowerCase()} — open slots; tweak to taste`;
  return `${template.title.toLowerCase()}: ${titles.join(", ")}`;
}

export type ProposeFullResult = {
  ok: true;
  days: Array<
    | {
        day_index: number;
        ok: true;
        slots: PlannedSlot[];
        rationale: string;
        template_id?: string;
      }
    | { day_index: number; ok: false; reason: string }
  >;
  summary: string;
};

/**
 * Plan every day in a trip in one shot. Rotates templates so the same
 * one isn't picked twice in a row, falls back gracefully on transit
 * days. Output is a single ≤25-word sentence the model voices verbatim.
 */
export function proposeFullItinerary(input: {
  days: ItineraryDay[];
  dest: DestinationDef;
  intent?: PlanIntent;
  must_include?: string[];
  stay_area_id?: string;
}): ProposeFullResult {
  const used: string[] = [];
  const days = input.days.map((d) => {
    const r = planDay({
      day: d,
      dest: input.dest,
      intent: input.intent,
      must_include: input.must_include,
      stay_area_id: input.stay_area_id,
      exclude_template_ids: [...used],
    });
    if (r.ok && r.template_id) used.push(r.template_id);
    return r.ok
      ? {
          day_index: r.day_index,
          ok: true as const,
          slots: r.slots,
          rationale: r.rationale,
          template_id: r.template_id,
        }
      : { day_index: r.day_index, ok: false as const, reason: r.reason };
  });

  // Build a one-sentence summary: "Drafted: <day1 highlight>, <day2>, …"
  const highlights = days
    .map((d) => {
      if (!d.ok) {
        if (d.reason === "transit_day") return null;
        return `day ${d.day_index + 1} open`;
      }
      const first = d.slots.find((s) => s.activity_id);
      return `day ${d.day_index + 1} ${first?.title.toLowerCase() ?? d.rationale}`;
    })
    .filter((s): s is string => Boolean(s));
  const summary =
    highlights.length === 0
      ? "Days are mostly transit; add specific items by voice."
      : `Drafted: ${highlights.slice(0, 5).join("; ")}.`;

  return { ok: true, days, summary };
}

/**
 * Suggest up to 3 plausible slots for an activity within the trip. Used by
 * the model when a user-requested placement fails or when it wants to ask
 * "where should I put X?".
 */
export function suggestSlots(input: {
  days: ItineraryDay[];
  activity?: ActivityDef;
  duration_min: number;
  area_id?: string;
  transit_time_matrix?: Record<string, Record<string, number>>;
  preferred_time_of_day?: ActivityDef["best_time"];
}): { day_index: number; start_time: string }[] {
  const slots: { day_index: number; start_time: string }[] = [];
  const candidateTimes = ["09:30", "11:00", "13:00", "15:30", "17:30", "19:30"];

  for (const day of input.days) {
    for (const t of candidateTimes) {
      const r = trySchedule({
        day,
        activity: input.activity,
        start_time: t,
        duration_min: input.duration_min,
        area_id: input.area_id,
        transit_time_matrix: input.transit_time_matrix,
      });
      if (r.ok) {
        slots.push({ day_index: day.index, start_time: t });
        if (slots.length >= 3) return slots;
      }
    }
  }
  return slots;
}
