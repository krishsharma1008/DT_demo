/**
 * In-destination concierge tools. These sit alongside the multi-day trip
 * tools in tools.ts and cover the visitor-in-Dubai use cases:
 *   update_visit       — remember party, location, constraints, time window
 *   plan_my_day        — timed, family-suitable day with a reason per stop
 *   replace_stop       — change one stop, keep the rest of the day intact
 *   find_nearby        — two options within N minutes of the visitor now
 *   show_place         — detail card with directions for one place
 *   add_place_to_plan  — drop a nearby option into today's plan
 */

import { z } from "zod";
import { dubai, findPlace } from "@/lib/data";
import type { ActivityDef } from "@/lib/data/types";
import { useItineraryStore, type ScheduledActivity, type Visit } from "@/lib/store/itinerary";
import { dubaiNow } from "@/lib/concierge/clock";
import { directionsUrl, travelMinutes } from "@/lib/concierge/geo";
import {
  allPlacesOf,
  buildReason,
  findNearbyNow,
  findReplacements,
  fitsVisit,
  isOpen,
  placeCoords,
  planVisitDay,
  resolveLocation,
  toMin,
  toTime,
  visitorCoords,
  weekdayOfIso,
} from "@/lib/concierge/planner";

type Result =
  | { ok: true; summary: string; [k: string]: unknown }
  | { ok: false; error: string; summary: string; [k: string]: unknown };

export const CONCIERGE_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    name: "update_visit",
    description:
      "Remember facts about the visitor for this session: party (adults + each child's age), where they are right now, interests, walking/indoor constraints, things to avoid, and the time they have free. Call it the moment the visitor shares any of these — BEFORE planning — and again whenever something changes (e.g. 'we're at the Museum of the Future now'). Only pass fields that changed.",
    parameters: {
      type: "object",
      properties: {
        adults: { type: "integer", minimum: 1, maximum: 12 },
        children_ages: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 17 },
          description: "Age of every child, e.g. [8, 12].",
        },
        location: {
          type: "string",
          description: "Where the visitor is now, in their words: 'Downtown', 'Dubai Mall', 'Museum of the Future', 'Marina'.",
        },
        interests: { type: "array", items: { type: "string" } },
        low_walking: { type: "boolean", description: "True when they want little walking." },
        indoor_only: { type: "boolean", description: "True only if they want EVERYTHING indoors today." },
        avoid: {
          type: "array",
          items: { type: "string" },
          description: "Things to avoid, as simple tags: 'museum', 'beach', 'heights', 'water park'.",
        },
        time_start: { type: "string", description: "HH:mm the free time starts (omit for 'now')." },
        time_end: { type: "string", description: "HH:mm the free time ends (omit for evening)." },
        note: { type: "string", description: "Any other detail worth remembering, short." },
      },
    },
  },
  {
    type: "function" as const,
    name: "plan_my_day",
    description:
      "Build a timed itinerary for one day in Dubai from the visitor's session memory (party ages, location, walking/indoor limits, interests, time window). Creates a one-day trip for today automatically if none exists. The stops land on screen with a reason each; you only voice a short summary (first stop + vibe), never the full list.",
    parameters: {
      type: "object",
      properties: {
        day_index: { type: "integer", minimum: 0, description: "Zero-indexed day; omit for today / the only day." },
        start_time: { type: "string", description: "HH:mm; omit to start from now (or the remembered window)." },
        end_time: { type: "string", description: "HH:mm; omit for ~21:00." },
        must_include: { type: "array", items: { type: "string" }, description: "Catalog place ids the visitor asked for." },
        allow_day_trips: { type: "boolean", description: "True only if they want to leave Dubai (Abu Dhabi, Sharjah, Hatta, RAK)." },
      },
    },
  },
  {
    type: "function" as const,
    name: "replace_stop",
    description:
      "Swap ONE stop in the plan for a better fit, keeping every other stop and its time unchanged. Identify the stop by activity_id (from the plan state) OR by a tag it has (e.g. avoid=['museum'] finds the museum stop). Pass indoor:true when they ask for something indoors.",
    parameters: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "Scheduled stop id from the plan (id=...)." },
        place_name: { type: "string", description: "Name of the stop to swap if you don't have the id." },
        avoid: { type: "array", items: { type: "string" }, description: "Tags the replacement must not have, e.g. ['museum']." },
        indoor: { type: "boolean" },
        kind: { type: "string", enum: ["activity", "food"] },
      },
    },
  },
  {
    type: "function" as const,
    name: "find_nearby",
    description:
      "'Help me now': find TWO options within max_minutes of where the visitor is, suited to their party, constraints and the current time, avoiding anything already in the plan. Use purpose='rest' when they're tired, 'eat' when hungry, 'fun' for something to do.",
    parameters: {
      type: "object",
      properties: {
        max_minutes: { type: "integer", minimum: 5, maximum: 90, description: "Default 20." },
        purpose: { type: "string", enum: ["rest", "eat", "fun", "any"] },
        from: { type: "string", description: "Only if they say where they are now and it differs from memory." },
      },
    },
  },
  {
    type: "function" as const,
    name: "show_place",
    description:
      "Open the visual detail card for one place (photo, hours, ages, walking, directions link) and get its facts. Use for 'tell me more', 'how do we get there', 'what is that place'. Identify by place_id (catalog id) or name.",
    parameters: {
      type: "object",
      properties: {
        place_id: { type: "string" },
        name: { type: "string" },
      },
    },
  },
  {
    type: "function" as const,
    name: "add_place_to_plan",
    description:
      "Add a catalog place (e.g. one of the find_nearby options the visitor picked) to the day's plan at a time that fits, without disturbing other stops.",
    parameters: {
      type: "object",
      properties: {
        place_id: { type: "string" },
        start_time: { type: "string", description: "HH:mm; omit for 'now' (after travel)." },
        day_index: { type: "integer", minimum: 0 },
      },
      required: ["place_id"],
    },
  },
] as const;

export const CONCIERGE_TOOL_NAMES = new Set(CONCIERGE_TOOL_DEFINITIONS.map((t) => t.name));

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);

const updateVisitZ = z.object({
  adults: z.number().int().min(1).max(12).optional(),
  children_ages: z.array(z.number().int().min(0).max(17)).optional(),
  location: z.string().min(1).optional(),
  interests: z.array(z.string()).optional(),
  low_walking: z.boolean().optional(),
  indoor_only: z.boolean().optional(),
  avoid: z.array(z.string()).optional(),
  time_start: hhmm.optional(),
  time_end: hhmm.optional(),
  note: z.string().optional(),
});

const planMyDayZ = z.object({
  day_index: z.number().int().min(0).optional(),
  start_time: hhmm.optional(),
  end_time: hhmm.optional(),
  must_include: z.array(z.string()).optional(),
  allow_day_trips: z.boolean().optional(),
});

const replaceStopZ = z.object({
  activity_id: z.string().optional(),
  place_name: z.string().optional(),
  avoid: z.array(z.string()).optional(),
  indoor: z.boolean().optional(),
  kind: z.enum(["activity", "food"]).optional(),
});

const findNearbyZ = z.object({
  max_minutes: z.number().int().min(5).max(90).optional(),
  purpose: z.enum(["rest", "eat", "fun", "any"]).optional(),
  from: z.string().optional(),
});

const showPlaceZ = z.object({ place_id: z.string().optional(), name: z.string().optional() });

const addPlaceZ = z.object({
  place_id: z.string().min(1),
  start_time: hhmm.optional(),
  day_index: z.number().int().min(0).optional(),
});

const pad = (t: string) => t.padStart(5, "0");
const uniqLower = (xs: string[]) => Array.from(new Set(xs.map((x) => x.toLowerCase().trim()).filter(Boolean)));

function hoursToday(p: ActivityDef, date: string): string {
  if (p.closed_days.includes(weekdayOfIso(date))) return "Closed today";
  if (p.available_hours.length === 0) return "Open any time";
  return p.available_hours.map((h) => `${h.open}–${h.close}`).join(", ");
}

/** Pick the day the concierge is working on: today's date if present, else day 0. */
function targetDayIndex(explicit?: number): number {
  const { days } = useItineraryStore.getState();
  if (explicit !== undefined) return explicit;
  const today = dubaiNow().date;
  return days.find((d) => d.date === today)?.index ?? 0;
}

/** Make sure a trip exists so a "today" plan has a day to land on. */
function ensureTodayTrip(visit: Visit) {
  const s = useItineraryStore.getState();
  if (s.days.length > 0) return;
  const today = dubaiNow().date;
  const kids = visit.party?.children.length ?? 0;
  s.setTripBasics({
    destination_id: dubai.id,
    destination_name: dubai.name,
    start_date: today,
    end_date: today,
    travelers: (visit.party?.adults ?? 1) + kids,
    vibe: kids > 0 ? "family" : undefined,
  });
}

function defaultStart(date: string): string {
  const now = dubaiNow();
  if (date !== now.date) return "10:00";
  const m = toMin(now.time);
  // Outside sensible hours (e.g. demo run late at night) plan a full day.
  if (m < 8 * 60 || m > 17 * 60 + 30) return "10:00";
  return toTime(Math.ceil((m + 15) / 15) * 15);
}

function findPlaceByText(text: string): ActivityDef | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const places = allPlacesOf(dubai);
  return (
    places.find((p) => p.id === t) ??
    places.find((p) => p.name.toLowerCase() === t) ??
    places.find((p) => p.name.toLowerCase().includes(t)) ??
    places.find((p) => t.includes(p.name.toLowerCase().split(",")[0]!.trim())) ??
    null
  );
}

function toScheduled(stop: {
  place: ActivityDef;
  start_time: string;
  duration_min: number;
  travel_min: number;
  reason: string;
}): Omit<ScheduledActivity, "id"> {
  return {
    catalog_id: stop.place.id,
    title: stop.place.name,
    start_time: stop.start_time,
    duration_min: stop.duration_min,
    area_id: stop.place.area_id,
    image: stop.place.image,
    reason: stop.reason,
    travel_min: stop.travel_min,
  };
}

export async function dispatchConciergeTool(name: string, args: unknown): Promise<Result | null> {
  const store = useItineraryStore.getState();

  switch (name) {
    case "update_visit": {
      const a = updateVisitZ.parse(args);
      const v = store.visit;
      const patch: Partial<Visit> = {};
      if (a.adults !== undefined || a.children_ages !== undefined) {
        // "We" + children with no adult count → assume two parents.
        const defaultAdults = a.children_ages?.length ? 2 : 1;
        patch.party = {
          adults: a.adults ?? v.party?.adults ?? defaultAdults,
          children: a.children_ages ?? v.party?.children ?? [],
        };
      }
      if (a.location) patch.location = resolveLocation(a.location, dubai);
      if (a.interests) patch.interests = uniqLower([...v.interests, ...a.interests]);
      if (a.low_walking !== undefined) patch.low_walking = a.low_walking;
      if (a.indoor_only !== undefined) patch.indoor_only = a.indoor_only;
      if (a.avoid) patch.avoid_tags = uniqLower([...v.avoid_tags, ...a.avoid]);
      if (a.time_start || a.time_end) {
        patch.time_window = {
          start: a.time_start ? pad(a.time_start) : v.time_window?.start ?? defaultStart(dubaiNow().date),
          end: a.time_end ? pad(a.time_end) : v.time_window?.end ?? "21:00",
        };
      }
      if (a.note) patch.notes = [...v.notes, a.note];
      store.updateVisit(patch);
      if (patch.low_walking) store.setPreferences({ mobility: "low" });
      if (patch.party && store.days.length > 0) {
        useItineraryStore.setState((s) => ({
          trip: { ...s.trip, travelers: patch.party!.adults + patch.party!.children.length },
        }));
      }
      const loc = patch.location;
      return {
        ok: true,
        summary: `Remembered.${loc ? ` Location: ${loc.label}${loc.coords ? "" : " (not in catalog — ask for a nearby landmark if needed)"}.` : ""}`,
        visit: useItineraryStore.getState().visit,
      };
    }

    case "plan_my_day": {
      const a = planMyDayZ.parse(args);
      const visit = useItineraryStore.getState().visit;
      ensureTodayTrip(visit);
      const s = useItineraryStore.getState();
      const dayIndex = targetDayIndex(a.day_index);
      const day = s.days[dayIndex];
      if (!day) return { ok: false, error: "day_out_of_range", summary: `There is no day ${dayIndex + 1}.` };

      const start = a.start_time ? pad(a.start_time) : visit.time_window?.start ?? defaultStart(day.date);
      const end = a.end_time ? pad(a.end_time) : visit.time_window?.end ?? "21:00";
      const elsewhere = s.days
        .filter((d) => d.index !== dayIndex)
        .flatMap((d) => d.activities.map((x) => x.catalog_id))
        .filter(Boolean) as string[];
      const stops = planVisitDay({
        dest: dubai,
        visit,
        date: day.date,
        start,
        end,
        must_include: a.must_include,
        exclude_ids: elsewhere,
        allow_day_trips: a.allow_day_trips,
      });
      if (stops.length === 0) {
        return {
          ok: false,
          error: "nothing_fits",
          summary: `Nothing fits ${start}–${end} with these constraints. Ask whether to relax one (time, walking, indoor).`,
        };
      }
      const ids = s.setDayActivities(dayIndex, stops.map(toScheduled));
      s.setNearby([]);
      return {
        ok: true,
        summary: `Planned ${stops.length} stops ${stops[0]!.start_time}–${toTime(toMin(stops.at(-1)!.start_time) + stops.at(-1)!.duration_min)}: ${stops
          .map((x) => `${x.start_time} ${x.place.name}`)
          .join("; ")}. Voice ONE line: the first stop and why it suits them.`,
        day_index: dayIndex,
        stops: stops.map((x, i) => ({
          id: ids[i],
          place_id: x.place.id,
          name: x.place.name,
          start_time: x.start_time,
          duration_min: x.duration_min,
          travel_min: x.travel_min,
          reason: x.reason,
        })),
      };
    }

    case "replace_stop": {
      const a = replaceStopZ.parse(args);
      const s = useItineraryStore.getState();
      const all = s.days.flatMap((d) => d.activities.map((x) => ({ day: d, act: x })));
      let hit = a.activity_id ? all.find((x) => x.act.id === a.activity_id) : undefined;
      if (!hit && a.place_name) {
        const n = a.place_name.toLowerCase();
        hit = all.find((x) => x.act.title.toLowerCase().includes(n) || n.includes(x.act.title.toLowerCase().split(",")[0]!));
      }
      if (!hit && a.avoid?.length) {
        // "No museum" → swap the stop that IS a museum.
        hit = all.find((x) => {
          const p = x.act.catalog_id ? findPlace(x.act.catalog_id) : null;
          return p ? !fitsVisit(p, { ...s.visit, avoid_tags: a.avoid! }, { allow_day_trips: true }) : false;
        });
      }
      if (!hit) {
        return {
          ok: false,
          error: "stop_not_found",
          summary: a.avoid?.length
            ? `No stop in the plan matches "${a.avoid.join(", ")}". Tell the visitor the plan already avoids it.`
            : "Couldn't tell which stop to change. Ask which one.",
          plan: all.map((x) => ({ id: x.act.id, name: x.act.title, start_time: x.act.start_time })),
        };
      }
      // Remember the dislike for the rest of the session.
      if (a.avoid?.length) s.updateVisit({ avoid_tags: uniqLower([...s.visit.avoid_tags, ...a.avoid]) });
      const visit = useItineraryStore.getState().visit;
      const base = {
        dest: dubai,
        visit,
        date: hit.day.date,
        stops: hit.day.activities,
        target_id: hit.act.id,
      };
      let options = findReplacements({ ...base, require: { indoor: a.indoor, avoid_tags: a.avoid, kind: a.kind } });
      if (options.length === 0) {
        options = findReplacements({
          ...base,
          require: { indoor: a.indoor, avoid_tags: a.avoid, kind: a.kind, max_travel_min: 45 },
        });
      }
      if (options.length === 0) {
        return {
          ok: false,
          error: "no_replacement",
          summary: `Nothing else fits the ${hit.act.start_time} slot with those limits. Offer to remove it or move the time.`,
        };
      }
      const pick = options[0]!;
      const newId = s.replaceActivity(hit.act.id, toScheduled(pick));
      return {
        ok: true,
        summary: `Swapped ${hit.act.title} → ${pick.place.name} at ${pick.start_time}. Rest of the day unchanged. Voice one line with why it suits them.`,
        replaced: { id: hit.act.id, name: hit.act.title },
        new_stop: {
          id: newId,
          place_id: pick.place.id,
          name: pick.place.name,
          start_time: pick.start_time,
          reason: pick.reason,
        },
        alternatives: options.slice(1).map((o) => ({ place_id: o.place.id, name: o.place.name, reason: o.reason })),
      };
    }

    case "find_nearby": {
      const a = findNearbyZ.parse(args);
      const s = useItineraryStore.getState();
      if (a.from) s.updateVisit({ location: resolveLocation(a.from, dubai) });
      const visit = useItineraryStore.getState().visit;
      const now = dubaiNow();
      const from = visitorCoords(dubai, visit);
      const planned = s.days.flatMap((d) => d.activities.map((x) => x.catalog_id)).filter(Boolean) as string[];
      const { options, hours_relaxed } = findNearbyNow({
        dest: dubai,
        visit,
        from,
        from_label: visit.location?.label,
        date: now.date,
        time: now.time,
        max_minutes: a.max_minutes ?? 20,
        purpose: a.purpose,
        exclude_ids: planned,
      });
      if (options.length === 0) {
        return {
          ok: false,
          error: "nothing_nearby",
          summary: `Nothing suitable within ${a.max_minutes ?? 20} min. Offer a wider radius.`,
        };
      }
      s.setNearby(options.map((o) => ({ place_id: o.place.id, travel_min: o.travel_min, reason: o.reason })));
      return {
        ok: true,
        summary: `${options.length} options near ${visit.location?.label ?? "Downtown"}: ${options
          .map((o) => `${o.place.name} (${o.travel_min} min) — ${o.reason}`)
          .join(" | ")}${hours_relaxed ? " (opening hours not checked — it's late)" : ""}. Voice both in one or two short sentences and ask which they prefer.`,
        options: options.map((o) => ({
          place_id: o.place.id,
          name: o.place.name,
          travel_min: o.travel_min,
          reason: o.reason,
        })),
      };
    }

    case "show_place": {
      const a = showPlaceZ.parse(args);
      const s = useItineraryStore.getState();
      let p = a.place_id ? findPlace(a.place_id) : null;
      if (!p && a.name) p = findPlaceByText(a.name);
      if (!p && a.place_id) p = findPlaceByText(a.place_id);
      if (!p) {
        return { ok: false, error: "place_not_found", summary: "I don't have that place in the catalog. Ask which one they mean." };
      }
      s.setFocusPlace(p.id);
      const visit = s.visit;
      const from = visit.location?.coords;
      const coords = placeCoords(dubai, p);
      const travel = from ? travelMinutes(from, coords) : undefined;
      const date = dubaiNow().date;
      return {
        ok: true,
        summary: `Card open for ${p.name}. Voice 1–2 sentences: what it is, then how to get there${
          travel === undefined
            ? ""
            : travel === 0
              ? ` (it's right where they are in ${visit.location!.label} — a short walk, no taxi needed)`
              : ` (~${travel} min by taxi from ${visit.location!.label})`
        }. The directions button is on screen.`,
        place: {
          id: p.id,
          name: p.name,
          details: p.details ?? p.blurb,
          address: p.address,
          hours_today: hoursToday(p, date),
          min_age: p.min_age,
          walking: p.walking,
          indoor_outdoor: p.indoor_outdoor,
          booking_required: p.booking_required,
          website: p.website,
          travel_min_by_taxi: travel,
          getting_there: travel === 0 ? "short walk — same building / area" : travel !== undefined ? `~${travel} min by taxi` : undefined,
          directions_url: directionsUrl(coords, from),
          getting_there_tip: dubai.intracity_notes?.split(".")[0],
        },
      };
    }

    case "add_place_to_plan": {
      const a = addPlaceZ.parse(args);
      const p = findPlace(a.place_id) ?? findPlaceByText(a.place_id);
      if (!p) return { ok: false, error: "place_not_found", summary: "That place isn't in the catalog." };
      const visit = useItineraryStore.getState().visit;
      ensureTodayTrip(visit);
      const s = useItineraryStore.getState();
      const dayIndex = targetDayIndex(a.day_index);
      const day = s.days[dayIndex];
      if (!day) return { ok: false, error: "day_out_of_range", summary: `There is no day ${dayIndex + 1}.` };
      const from = visitorCoords(dubai, visit);
      const travel = travelMinutes(from, placeCoords(dubai, p));
      const startM = a.start_time
        ? toMin(a.start_time)
        : Math.ceil((toMin(defaultStart(day.date)) + travel) / 15) * 15;
      const dur = Math.min(p.duration_min.typical, 120);
      const clash = day.activities.find((x) => {
        const xs = toMin(x.start_time);
        return startM < xs + x.duration_min && xs < startM + dur;
      });
      const id = s.addActivity(dayIndex, {
        catalog_id: p.id,
        title: p.name,
        start_time: toTime(startM),
        duration_min: dur,
        area_id: p.area_id,
        image: p.image,
        reason: buildReason(p, { visit, travel_min: travel, from_label: visit.location?.label, start_min: startM, date: day.date }),
        travel_min: travel,
      });
      s.markChanged([id]);
      s.setNearby([]);
      return {
        ok: true,
        summary: `Added ${p.name} at ${toTime(startM)}${isOpen(p, day.date, startM, dur) ? "" : " (check opening hours)"}.${clash ? ` It overlaps ${clash.title} — offer to replace or shift it.` : ""}`,
        activity_id: id,
        overlaps: clash ? { id: clash.id, name: clash.title } : undefined,
      };
    }
  }
  return null;
}
