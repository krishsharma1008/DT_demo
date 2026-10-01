"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";

/**
 * Single source of truth for the itinerary canvas. Every tool call mutates
 * this store; every component reads it. PLAN §7 + §14.3.
 */

export type DayMode = "work" | "leisure" | "travel" | "chill" | "adventure";

export type FixedEvent = {
  id: string;
  title: string;
  type: "meeting" | "flight" | "event" | "reservation";
  start_time: string; // "HH:mm"
  duration_min: number;
  location?: string;
  source?: "user" | "calendar"; // calendar = injected from Google Calendar
};

export type ScheduledActivity = {
  id: string; // unique per scheduled instance
  catalog_id?: string; // ref to ActivityDef.id; null for free-text
  title: string;
  start_time: string; // "HH:mm"
  duration_min: number;
  area_id?: string;
  notes?: string;
  image?: string;
  /** Short "why this stop" line shown on the card. */
  reason?: string;
  /** Taxi minutes from the previous stop (or from the visitor's location). */
  travel_min?: number;
};

export type ItineraryDay = {
  index: number; // 0-based
  date: string; // ISO yyyy-mm-dd
  mode: DayMode;
  fixed_events: FixedEvent[];
  activities: ScheduledActivity[];
};

export type Stay = {
  area_id: string;
  property_id?: string;
  name?: string;
  tier?: "backpack" | "comfort" | "premium" | "luxury";
  image?: string;
  blurb?: string;
  check_in_day: number; // 0-based
  check_out_day: number;
};

export type Preferences = {
  budget_tier?: "backpack" | "comfort" | "premium" | "luxury";
  dietary?: string[];
  mobility?: "high" | "moderate" | "low";
  must_sees?: string[];
  avoid?: string[];
};

export type Trip = {
  destination_id: string | null;
  destination_name: string | null;
  start_date: string | null; // ISO
  end_date: string | null;
  travelers: number;
  vibe?:
    | "chill"
    | "adventure"
    | "foodie"
    | "cultural"
    | "party"
    | "family"
    | "mixed";
};

export type Party = {
  adults: number;
  /** Ages of each child, e.g. [8, 12]. */
  children: number[];
};

export type VisitorLocation = {
  label: string; // what the visitor said, e.g. "Downtown"
  coords?: { lat: number; lng: number };
  area_id?: string;
  place_id?: string;
};

/**
 * Session memory for the in-destination concierge: who is travelling, where
 * they are right now, and what they want or must avoid. Every concierge tool
 * reads this so later requests never require restating the whole trip.
 */
export type Visit = {
  party?: Party;
  location?: VisitorLocation;
  interests: string[];
  low_walking?: boolean;
  indoor_only?: boolean;
  /** Tags or kinds to avoid, e.g. "museum". */
  avoid_tags: string[];
  /** Time the visitor has available today, "HH:mm". */
  time_window?: { start: string; end: string };
  /** Free-form notes worth remembering ("younger one gets tired"). */
  notes: string[];
};

export type ParkingLotItem = {
  id: string;
  title: string;
  catalog_id?: string;
  reason: string; // why it landed here, e.g. "no slot fits"
};

export type ItineraryStatus = "empty" | "draft" | "finalized";

type ItineraryStore = {
  trip: Trip;
  days: ItineraryDay[];
  stay: Stay | null;
  preferences: Preferences;
  parking_lot: ParkingLotItem[];
  status: ItineraryStatus;
  share_id: string | null;
  visit: Visit;
  /** Catalog id of the place whose detail card is open. */
  focus_place_id: string | null;
  /** Scheduled-activity ids touched by the latest change — UI highlights them. */
  changed_ids: string[];
  /** Options surfaced by "help me now" (catalog ids + taxi minutes). */
  nearby: Array<{ place_id: string; travel_min: number; reason: string }>;

  // mutations — most are called from the tool dispatcher
  setTripBasics: (input: {
    destination_id: string;
    destination_name: string;
    start_date: string;
    end_date: string;
    travelers: number;
    vibe?: Trip["vibe"];
  }) => void;
  setDayModes: (modes: DayMode[]) => void;
  addFixedEvent: (day_index: number, ev: Omit<FixedEvent, "id">) => string;
  setStay: (stay: Stay) => void;
  addActivity: (day_index: number, act: Omit<ScheduledActivity, "id">) => string;
  moveActivity: (
    activity_id: string,
    to: { day_index: number; start_time: string },
  ) => boolean;
  removeActivity: (activity_id: string) => boolean;
  setPreferences: (prefs: Preferences) => void;
  pushToParkingLot: (item: Omit<ParkingLotItem, "id">) => string;
  updateVisit: (patch: Partial<Visit>) => void;
  setFocusPlace: (place_id: string | null) => void;
  setNearby: (items: ItineraryStore["nearby"]) => void;
  replaceActivity: (activity_id: string, next: Omit<ScheduledActivity, "id">) => string | null;
  /** Replace a whole day's activities in one go (concierge day plan). */
  setDayActivities: (day_index: number, acts: Omit<ScheduledActivity, "id">[]) => string[];
  markChanged: (ids: string[]) => void;

  finalize: () => string; // returns share_id
  reset: () => void;
  hydrate: (snapshot: Partial<ItineraryStore>) => void;
};

const emptyVisit: Visit = { interests: [], avoid_tags: [], notes: [] };

const emptyTrip: Trip = {
  destination_id: null,
  destination_name: null,
  start_date: null,
  end_date: null,
  travelers: 1,
};

function buildDays(start_iso: string, end_iso: string): ItineraryDay[] {
  const start = new Date(start_iso + "T00:00:00Z");
  const end = new Date(end_iso + "T00:00:00Z");
  const days: ItineraryDay[] = [];
  let i = 0;
  for (
    let cur = new Date(start);
    cur.getTime() <= end.getTime();
    cur.setUTCDate(cur.getUTCDate() + 1)
  ) {
    days.push({
      index: i++,
      date: cur.toISOString().slice(0, 10),
      mode: "leisure",
      fixed_events: [],
      activities: [],
    });
  }
  return days;
}

export const useItineraryStore = create<ItineraryStore>((set, get) => ({
  trip: emptyTrip,
  days: [],
  stay: null,
  preferences: {},
  parking_lot: [],
  status: "empty",
  share_id: null,
  visit: emptyVisit,
  focus_place_id: null,
  changed_ids: [],
  nearby: [],

  setTripBasics: ({
    destination_id,
    destination_name,
    start_date,
    end_date,
    travelers,
    vibe,
  }) => {
    const days = buildDays(start_date, end_date);
    set({
      trip: {
        destination_id,
        destination_name,
        start_date,
        end_date,
        travelers,
        vibe,
      },
      days,
      status: "draft",
    });
  },

  setDayModes: (modes) =>
    set((s) => ({
      days: s.days.map((d, i) => ({
        ...d,
        mode: modes[i] ?? d.mode,
      })),
    })),

  addFixedEvent: (day_index, ev) => {
    const id = nanoid(8);
    set((s) => ({
      days: s.days.map((d) =>
        d.index === day_index
          ? { ...d, fixed_events: [...d.fixed_events, { id, ...ev }] }
          : d,
      ),
    }));
    return id;
  },

  setStay: (stay) => set({ stay }),

  addActivity: (day_index, act) => {
    const id = nanoid(8);
    set((s) => ({
      days: s.days.map((d) =>
        d.index === day_index
          ? {
              ...d,
              activities: [...d.activities, { id, ...act }].sort((a, b) =>
                a.start_time.localeCompare(b.start_time),
              ),
            }
          : d,
      ),
    }));
    return id;
  },

  moveActivity: (activity_id, to) => {
    let moved = false;
    set((s) => {
      let payload: ScheduledActivity | null = null;
      const stripped = s.days.map((d) => {
        const found = d.activities.find((a) => a.id === activity_id);
        if (found) {
          payload = found;
          moved = true;
          return {
            ...d,
            activities: d.activities.filter((a) => a.id !== activity_id),
          };
        }
        return d;
      });
      if (!payload) return {};
      const inserted = stripped.map((d) =>
        d.index === to.day_index
          ? {
              ...d,
              activities: [
                ...d.activities,
                { ...payload!, start_time: to.start_time },
              ].sort((a, b) => a.start_time.localeCompare(b.start_time)),
            }
          : d,
      );
      return { days: inserted };
    });
    return moved;
  },

  removeActivity: (activity_id) => {
    let removed = false;
    set((s) => ({
      days: s.days.map((d) => {
        const before = d.activities.length;
        const after = d.activities.filter((a) => a.id !== activity_id);
        if (after.length !== before) removed = true;
        return { ...d, activities: after };
      }),
    }));
    return removed;
  },

  setPreferences: (prefs) =>
    set((s) => ({ preferences: { ...s.preferences, ...prefs } })),

  pushToParkingLot: (item) => {
    const id = nanoid(8);
    set((s) => ({ parking_lot: [...s.parking_lot, { id, ...item }] }));
    return id;
  },

  updateVisit: (patch) =>
    set((s) => ({ visit: { ...s.visit, ...patch } })),

  setFocusPlace: (place_id) => set({ focus_place_id: place_id }),

  setNearby: (items) => set({ nearby: items }),

  replaceActivity: (activity_id, next) => {
    const id = nanoid(8);
    let found = false;
    set((s) => ({
      days: s.days.map((d) => {
        if (!d.activities.some((a) => a.id === activity_id)) return d;
        found = true;
        return {
          ...d,
          activities: d.activities
            .map((a) => (a.id === activity_id ? { id, ...next } : a))
            .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        };
      }),
      changed_ids: [id],
    }));
    return found ? id : null;
  },

  setDayActivities: (day_index, acts) => {
    const withIds = acts.map((a) => ({ id: nanoid(8), ...a }));
    set((s) => ({
      days: s.days.map((d) =>
        d.index === day_index
          ? {
              ...d,
              activities: withIds.sort((a, b) => a.start_time.localeCompare(b.start_time)),
            }
          : d,
      ),
      changed_ids: withIds.map((a) => a.id),
    }));
    return withIds.map((a) => a.id);
  },

  markChanged: (ids) => set({ changed_ids: ids }),

  finalize: () => {
    const id = get().share_id ?? nanoid(10);
    set({ status: "finalized", share_id: id });
    return id;
  },

  reset: () =>
    set({
      trip: emptyTrip,
      days: [],
      stay: null,
      preferences: {},
      parking_lot: [],
      status: "empty",
      share_id: null,
      visit: emptyVisit,
      focus_place_id: null,
      changed_ids: [],
      nearby: [],
    }),

  hydrate: (snapshot) => set((s) => ({ ...s, ...snapshot })),
}));

/**
 * Compact text snapshot of the live itinerary, suitable for injection into
 * the realtime model's system prompt. Used so a re-pressed or reconnected
 * orb knows where we left off and doesn't restart with "where are we going".
 */
export function formatItinerarySnapshot(state: {
  trip: Trip;
  days: ItineraryDay[];
  stay: Stay | null;
  preferences: Preferences;
  status: ItineraryStatus;
  visit?: Visit;
}): string | null {
  const visitLine = state.visit ? formatVisit(state.visit) : null;
  if (state.status === "empty" || !state.trip.destination_name) return visitLine;
  const lines: string[] = [];
  if (visitLine) lines.push(visitLine);
  const t = state.trip;
  lines.push(
    `Trip: ${state.days.length}-day ${t.destination_name}, ${t.start_date}→${t.end_date}, ${t.travelers} traveler${t.travelers === 1 ? "" : "s"}${t.vibe ? `, ${t.vibe} vibe` : ""}.`,
  );
  if (state.stay?.area_id) {
    const name = state.stay.name ?? "stay";
    lines.push(
      `Stay: ${name} in ${state.stay.area_id}${state.stay.tier ? ` (${state.stay.tier})` : ""}, day ${state.stay.check_in_day + 1}→${state.stay.check_out_day + 1}.`,
    );
  }
  for (const d of state.days) {
    const fixed = d.fixed_events
      .map((e) => `${e.start_time} ${e.title}${e.location ? ` @ ${e.location}` : ""}`)
      .join("; ");
    const acts = d.activities
      .map((a) => `${a.start_time} ${a.title} [id=${a.id}${a.catalog_id ? ` place=${a.catalog_id}` : ""}]`)
      .join("; ");
    const pieces = [fixed, acts].filter(Boolean).join(" | ");
    lines.push(
      `Day ${d.index + 1} ${d.date} (${d.mode})${pieces ? `: ${pieces}` : ": open"}`,
    );
  }
  const prefs: string[] = [];
  if (state.preferences.budget_tier) prefs.push(`budget=${state.preferences.budget_tier}`);
  if (state.preferences.mobility) prefs.push(`mobility=${state.preferences.mobility}`);
  if (state.preferences.dietary?.length)
    prefs.push(`diet=${state.preferences.dietary.join(",")}`);
  if (state.preferences.must_sees?.length)
    prefs.push(`must_see=${state.preferences.must_sees.join(",")}`);
  if (state.preferences.avoid?.length)
    prefs.push(`avoid=${state.preferences.avoid.join(",")}`);
  if (prefs.length) lines.push(`Preferences: ${prefs.join("; ")}.`);
  return lines.join("\n");
}

/** One-line summary of the concierge's session memory, or null if empty. */
export function formatVisit(v: Visit): string | null {
  const parts: string[] = [];
  if (v.party) {
    const kids = v.party.children.length
      ? ` + ${v.party.children.length} child${v.party.children.length === 1 ? "" : "ren"} (ages ${v.party.children.join(", ")})`
      : "";
    parts.push(`party=${v.party.adults} adult${v.party.adults === 1 ? "" : "s"}${kids}`);
  }
  if (v.location) parts.push(`location=${v.location.label}${v.location.area_id ? ` (${v.location.area_id})` : ""}`);
  if (v.time_window) parts.push(`free ${v.time_window.start}–${v.time_window.end}`);
  if (v.low_walking) parts.push("minimal walking");
  if (v.indoor_only) parts.push("indoor only");
  if (v.avoid_tags.length) parts.push(`avoid=${v.avoid_tags.join(",")}`);
  if (v.interests.length) parts.push(`interests=${v.interests.join(",")}`);
  if (v.notes.length) parts.push(`notes=${v.notes.join("; ")}`);
  return parts.length ? `Visitor: ${parts.join("; ")}.` : null;
}

/** Helpers for the scheduler / dispatcher. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function dateToWeekday(iso: string): import("@/lib/data/types").Weekday {
  // Sun=0..Sat=6
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  const map: import("@/lib/data/types").Weekday[] = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ];
  return map[d]!;
}
