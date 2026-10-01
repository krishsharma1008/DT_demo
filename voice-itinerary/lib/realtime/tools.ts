/**
 * Tool catalog for the realtime model. Per PLAN §14.3 + §6:
 *  - Tool JSON schemas live here for session.update.tools
 *  - Zod schemas validate at runtime before mutating the store
 *  - Dispatcher executes from `response.done` (Codex P0 #7)
 *  - add_activity goes through the scheduler, never blind
 *
 * The dispatcher is pure-state: it does not touch React. The voice-orb wires
 * the dispatcher's output back to the realtime client (function_call_output).
 */

import { z } from "zod";
import {
  destinationContextForPrompt,
  findDestinationByText,
  getDestination,
  listDestinations,
  queryCatalog as queryCatalogData,
  rankStays,
  nearbyItems,
  getTransportNotes,
} from "@/lib/data";
import { searchFlights } from "@/lib/data/flights";
import {
  CONCIERGE_TOOL_DEFINITIONS,
  CONCIERGE_TOOL_NAMES,
  dispatchConciergeTool,
} from "./conciergeTools";
import { addDays, nextWeekdayDate, weekdayOf } from "./dateTable";
import {
  type DayMode,
  dateToWeekday,
  minutesToTime,
  timeToMinutes,
  useItineraryStore,
} from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import {
  areaToRegion,
  planDay,
  proposeFullItinerary,
  suggestSlots,
  trySchedule,
  type Conflict,
} from "./scheduler";

// ── JSON Schemas (sent in session.update.tools) ──────────────────────────────
//
// OpenAI Realtime tool shape: { type: "function", name, description, parameters }
// where parameters is JSON Schema.

const TRIP_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    name: "set_trip_basics",
    description:
      "Multi-day trip: set destination, dates, travelers, vibe BEFORE speaking. Always pass start_kind/start_weekday/end_weekday; on ok:false re-call with the corrected dates.",
    parameters: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "Always 'dubai' (day trips to Abu Dhabi, Sharjah, RAK are inside the Dubai catalog).",
        },
        start_date: {
          type: "string",
          description: "ISO yyyy-mm-dd from the date table.",
        },
        end_date: {
          type: "string",
          description: "ISO yyyy-mm-dd, inclusive (last day of the trip).",
        },
        travelers: { type: "integer", minimum: 1, maximum: 12 },
        vibe: {
          type: "string",
          enum: [
            "chill",
            "adventure",
            "foodie",
            "cultural",
            "party",
            "family",
            "mixed",
          ],
        },
        start_kind: {
          type: "string",
          enum: ["weekday", "date", "today", "tomorrow", "relative"],
          description: "How the user described the start.",
        },
        start_weekday: {
          type: "string",
          enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          description: "Weekday of start_date.",
        },
        end_weekday: {
          type: "string",
          enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          description: "Weekday of end_date.",
        },
      },
      required: [
        "destination",
        "start_date",
        "end_date",
        "travelers",
        "start_kind",
        "start_weekday",
        "end_weekday",
      ],
    },
  },
  {
    type: "function" as const,
    name: "set_day_modes",
    description:
      "Tag every day as work, leisure, travel, chill, or adventure. Length must equal trip duration. " +
      "The array is ZERO-INDEXED: modes[0] is the user's 'day 1', modes[1] is 'day 2', etc. " +
      "When the user edits a single day (e.g. 'make day 1 chill'), send the FULL array with only the targeted index changed and every other slot kept at its current value — do NOT shift indices.",
    parameters: {
      type: "object",
      properties: {
        modes: {
          type: "array",
          items: {
            type: "string",
            enum: ["work", "leisure", "travel", "chill", "adventure"],
          },
          description:
            "Zero-indexed: modes[0] = day 1 in the UI, modes[1] = day 2, etc. Length must match trip duration.",
        },
      },
      required: ["modes"],
    },
  },
  {
    type: "function" as const,
    name: "add_fixed_event",
    description:
      "Pin a non-negotiable event (meeting, flight, reservation) to a specific day and time. The scheduler will treat this as a hard constraint. day_index is ZERO-INDEXED: user's 'day 1' = day_index 0.",
    parameters: {
      type: "object",
      properties: {
        day_index: {
          type: "integer",
          minimum: 0,
          description: "Zero-indexed. User's 'day 1' = 0, 'day 2' = 1, etc.",
        },
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["meeting", "flight", "event", "reservation"],
        },
        start_time: { type: "string", description: "24h HH:mm" },
        duration_min: { type: "integer", minimum: 15, maximum: 600 },
        location: { type: "string" },
      },
      required: ["day_index", "title", "type", "start_time", "duration_min"],
    },
  },
  {
    type: "function" as const,
    name: "set_stay",
    description:
      "Pick where the user will sleep. Reference a stay id from query_catalog when possible.",
    parameters: {
      type: "object",
      properties: {
        area_id: { type: "string" },
        property_id: { type: "string" },
        check_in_day: { type: "integer", minimum: 0 },
        check_out_day: { type: "integer", minimum: 0 },
      },
      required: ["area_id", "check_in_day", "check_out_day"],
    },
  },
  {
    type: "function" as const,
    name: "add_activity",
    description:
      "Schedule an activity on a specific day. Routed through the constraint-aware scheduler. " +
      "If the slot conflicts with a fixed event, breaks opening hours, or violates transit buffers, " +
      "you'll get { ok:false, conflict, alternatives } — pivot aloud rather than retrying blindly. " +
      "day_index is ZERO-INDEXED: user's 'day 1' = day_index 0.",
    parameters: {
      type: "object",
      properties: {
        day_index: {
          type: "integer",
          minimum: 0,
          description: "Zero-indexed. User's 'day 1' = 0, 'day 2' = 1, etc.",
        },
        start_time: { type: "string", description: "24h HH:mm" },
        duration_min: { type: "integer", minimum: 15, maximum: 480 },
        activity_id: {
          type: "string",
          description: "Catalog id from query_catalog. Preferred over title.",
        },
        title: {
          type: "string",
          description: "Free-text fallback for generic items like 'morning coffee'.",
        },
        notes: { type: "string" },
      },
      required: ["day_index", "start_time", "duration_min"],
    },
  },
  {
    type: "function" as const,
    name: "move_activity",
    description:
      "Move a scheduled activity to a different day or time. to_day_index is ZERO-INDEXED: user's 'day 3' = to_day_index 2.",
    parameters: {
      type: "object",
      properties: {
        activity_id: { type: "string" },
        to_day_index: {
          type: "integer",
          minimum: 0,
          description: "Zero-indexed. User's 'day 1' = 0, 'day 2' = 1, etc.",
        },
        to_start_time: { type: "string" },
      },
      required: ["activity_id", "to_day_index", "to_start_time"],
    },
  },
  {
    type: "function" as const,
    name: "remove_activity",
    description: "Remove a scheduled activity by id.",
    parameters: {
      type: "object",
      properties: { activity_id: { type: "string" } },
      required: ["activity_id"],
    },
  },
  {
    type: "function" as const,
    name: "set_preferences",
    description:
      "Capture user preferences (budget tier, dietary, mobility, must-sees, avoid). Apply to all future suggestions.",
    parameters: {
      type: "object",
      properties: {
        budget_tier: {
          type: "string",
          enum: ["backpack", "comfort", "premium", "luxury"],
        },
        dietary: { type: "array", items: { type: "string" } },
        mobility: { type: "string", enum: ["high", "moderate", "low"] },
        must_sees: { type: "array", items: { type: "string" } },
        avoid: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    name: "query_catalog",
    description:
      "Fetch up to 6 catalog items matching filters. Call this BEFORE naming a specific stay, activity, or restaurant. " +
      "Do not invent place names that aren't in the catalog.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string" },
        type: { type: "string", enum: ["stay", "activity", "food"] },
        tags: { type: "array", items: { type: "string" } },
        area_id: { type: "string" },
        work_friendly: { type: "boolean" },
      },
      required: ["destination"],
    },
  },
  {
    type: "function" as const,
    name: "get_destination_context",
    description:
      "Compact summary of a destination — areas, seasonal warnings, transit highlights. " +
      "Use early in a trip to ground yourself in geography.",
    parameters: {
      type: "object",
      properties: { destination: { type: "string" } },
      required: ["destination"],
    },
  },
  {
    type: "function" as const,
    name: "suggest_slots",
    description:
      "Given an activity, propose up to 3 day/time slots that satisfy all scheduler constraints.",
    parameters: {
      type: "object",
      properties: {
        activity_id: { type: "string" },
        duration_min: { type: "integer", minimum: 15, maximum: 480 },
      },
      required: ["activity_id"],
    },
  },
  {
    type: "function" as const,
    name: "plan_day",
    description:
      "Multi-day trips: draft ONE day from templates (respects hours, closures, fixed events). Then add_activity each returned slot. Voice the rationale. day_index is zero-based.",
    parameters: {
      type: "object",
      properties: {
        day_index: {
          type: "integer",
          minimum: 0,
          description: "Zero-indexed. User's 'day 1' = 0, 'day 2' = 1, etc.",
        },
        intent: {
          type: "string",
          enum: [
            "auto",
            "work",
            "chill",
            "adventure",
            "cultural",
            "foodie",
            "transit",
          ],
          description: "auto = follow the day's mode. Override only if the user explicitly asks.",
        },
        area_id: {
          type: "string",
          description: "Anchor the plan in this area (defaults to stay area or destination's first area).",
        },
        must_include: {
          type: "array",
          items: { type: "string" },
          description: "Catalog activity ids the user has named — anchored first, others fit around.",
        },
      },
      required: ["day_index"],
    },
  },
  {
    type: "function" as const,
    name: "propose_full_itinerary",
    description:
      "Multi-day trips: draft every remaining day from templates; then add_activity each slot. Use after personalization, or at once for 'just make it'.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "auto",
            "work",
            "chill",
            "adventure",
            "cultural",
            "foodie",
            "transit",
          ],
        },
        must_include: {
          type: "array",
          items: { type: "string" },
          description: "Catalog activity ids the user has named — distributed across days.",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "validate_itinerary",
    description:
      "Final sweep before finalize: scheduler re-checks every placement and reports problems.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "finalize_itinerary",
    description:
      "Freeze the plan and return a share id. Call this only when the user clearly says they're done.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "search_flights",
    description:
      "Indicative (mock) flights into Dubai. Not bookings.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Origin IATA code.",
        },
        to: {
          type: "string",
          description: "Destination IATA code — always DXB. Required.",
        },
        date: {
          type: "string",
          description: "Optional ISO date (informational).",
        },
        max: {
          type: "integer",
          minimum: 1,
          maximum: 6,
          description: "Max results, default 4.",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    type: "function" as const,
    name: "suggest_stays",
    description:
      "Rank top stays for a destination by vibe, budget, work-friendliness, and area. Use after guided personalization so the stay reflects the user's answers. Returns up to 3 picks with a one-line rationale per pick.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string" },
        vibe: { type: "string" },
        budget_tier: {
          type: "string",
          enum: ["backpack", "comfort", "premium", "luxury"],
        },
        work_friendly: { type: "boolean" },
        area_id: { type: "string" },
      },
      required: ["destination"],
    },
  },
  {
    type: "function" as const,
    name: "suggest_nearby",
    description:
      "Surface activities and food within a transit radius of a base area (defaults to the chosen stay's area). Use after set_stay to plant the next idea, or when the user asks 'what's around here'.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string" },
        area_id: { type: "string", description: "Defaults to the stay's area_id." },
        max_minutes: {
          type: "integer",
          minimum: 5,
          maximum: 120,
          description: "Maximum transit time in minutes from the base area; default 25.",
        },
        max: {
          type: "integer",
          minimum: 1,
          maximum: 8,
          description: "Max results, default 4.",
        },
      },
      required: ["destination"],
    },
  },
  {
    type: "function" as const,
    name: "get_transport_info",
    description:
      "Return airport-transfer and intra-city transport notes for a destination. Use when the user asks how to get from the airport to their hotel, or how to move around the city.",
    parameters: {
      type: "object",
      properties: { destination: { type: "string" } },
      required: ["destination"],
    },
  },
  {
    type: "function" as const,
    name: "open_print",
    description:
      "Open the printable / save-as-PDF view of the finalized trip. Use when the user says 'print', 'save as PDF', or asks for a printable copy. Trip must be finalized first.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "export_ics",
    description:
      "Download the trip as an .ics calendar file (one event per scheduled item). Use when the user says 'add to calendar', 'export to calendar', or 'iCal'. Trip must be finalized first.",
    parameters: { type: "object", properties: {} },
  },
] as const;

/** Concierge (in-destination, single day) tools first, then multi-day trip tools. */
export const TOOL_DEFINITIONS = [...CONCIERGE_TOOL_DEFINITIONS, ...TRIP_TOOL_DEFINITIONS];

// ── Zod schemas for runtime validation ───────────────────────────────────────

const setTripBasicsZ = z.object({
  destination: z.string().min(2),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelers: z.number().int().min(1).max(12),
  vibe: z
    .enum(["chill", "adventure", "foodie", "cultural", "party", "family", "mixed"])
    .optional(),
  start_kind: z.enum(["weekday", "date", "today", "tomorrow", "relative"]),
  start_weekday: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  end_weekday: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
});

const dayModeZ = z.enum(["work", "leisure", "travel", "chill", "adventure"]);
const setDayModesZ = z.object({ modes: z.array(dayModeZ).min(1).max(30) });

const addFixedEventZ = z.object({
  day_index: z.number().int().min(0),
  title: z.string().min(1),
  type: z.enum(["meeting", "flight", "event", "reservation"]),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_min: z.number().int().min(15).max(600),
  location: z.string().optional(),
});

const setStayZ = z.object({
  area_id: z.string().min(1),
  property_id: z.string().optional(),
  check_in_day: z.number().int().min(0),
  check_out_day: z.number().int().min(0),
});

const addActivityZ = z.object({
  day_index: z.number().int().min(0),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_min: z.number().int().min(15).max(480),
  activity_id: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
});

const moveActivityZ = z.object({
  activity_id: z.string().min(1),
  to_day_index: z.number().int().min(0),
  to_start_time: z.string().regex(/^\d{2}:\d{2}$/),
});

const removeActivityZ = z.object({ activity_id: z.string().min(1) });

const setPrefsZ = z.object({
  budget_tier: z.enum(["backpack", "comfort", "premium", "luxury"]).optional(),
  dietary: z.array(z.string()).optional(),
  mobility: z.enum(["high", "moderate", "low"]).optional(),
  must_sees: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
});

const queryCatalogZ = z.object({
  destination: z.string().min(1),
  type: z.enum(["stay", "activity", "food"]).optional(),
  tags: z.array(z.string()).optional(),
  area_id: z.string().optional(),
  work_friendly: z.boolean().optional(),
});

const getDestZ = z.object({ destination: z.string().min(1) });

const suggestSlotsZ = z.object({
  activity_id: z.string().min(1),
  duration_min: z.number().int().min(15).max(480).optional(),
});

const searchFlightsZ = z.object({
  from: z.string().min(2),
  to: z.string().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  max: z.number().int().min(1).max(6).optional(),
});

const suggestStaysZ = z.object({
  destination: z.string().min(1),
  vibe: z.string().optional(),
  budget_tier: z.enum(["backpack", "comfort", "premium", "luxury"]).optional(),
  work_friendly: z.boolean().optional(),
  area_id: z.string().optional(),
});

const suggestNearbyZ = z.object({
  destination: z.string().min(1),
  area_id: z.string().optional(),
  max_minutes: z.number().int().min(5).max(120).optional(),
  max: z.number().int().min(1).max(8).optional(),
});

const getTransportZ = z.object({ destination: z.string().min(1) });

const planIntentZ = z.enum([
  "auto",
  "work",
  "chill",
  "adventure",
  "cultural",
  "foodie",
  "transit",
]);

const planDayZ = z.object({
  day_index: z.number().int().min(0),
  intent: planIntentZ.optional(),
  area_id: z.string().optional(),
  must_include: z.array(z.string()).optional(),
});

const proposeFullZ = z.object({
  intent: planIntentZ.optional(),
  must_include: z.array(z.string()).optional(),
});

// ── Dispatcher ────────────────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; summary: string; [k: string]: unknown }
  | { ok: false; error: string; summary: string; [k: string]: unknown };

function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function dispatchToolCall(
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  let args: unknown;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return {
      ok: false,
      error: "invalid_json",
      summary: "Could not parse tool arguments. Please retry.",
    };
  }

  const store = useItineraryStore.getState();

  try {
    if (CONCIERGE_TOOL_NAMES.has(name as never)) {
      const r = await dispatchConciergeTool(name, args);
      if (r) return r;
    }
    switch (name) {
      case "set_trip_basics": {
        const a = setTripBasicsZ.parse(args);
        const dest =
          findDestinationByText(a.destination) ?? getDestination(a.destination);
        if (!dest) {
          return {
            ok: false,
            error: "destination_not_found",
            summary: `I don't have ${a.destination} in the catalog. Try one of: ${listDestinations()
              .map((d) => d.name)
              .join(", ")}.`,
            available: listDestinations().map((d) => d.id),
          };
        }

        // Date validation pipeline. Three layers:
        //   1. start_weekday must match the actual weekday of start_date
        //   2. end_weekday   must match the actual weekday of end_date
        //   3. start_kind must be consistent with start_date
        //      ("weekday" → start_date strictly after today; "today" →
        //       start_date == today; "tomorrow" → start_date == today+1).
        //
        // Layer 3 catches the failure mode where the model picks today as
        // start_date and labels it with today's weekday — both layers 1+2
        // pass (the labels match) but the user said a future weekday.
        const today = localIsoDate();

        const buildShiftedEnd = (newStart: string): string => {
          const startMs = new Date(a.start_date + "T00:00:00Z").getTime();
          const endMs = new Date(a.end_date + "T00:00:00Z").getTime();
          const durDays = Math.max(0, Math.round((endMs - startMs) / 86_400_000));
          return addDays(newStart, durDays);
        };

        const actualStartWd = weekdayOf(a.start_date);
        if (actualStartWd !== a.start_weekday) {
          const corrected_start_date = nextWeekdayDate(today, a.start_weekday);
          const corrected_end_date = buildShiftedEnd(corrected_start_date);
          return {
            ok: false,
            error: "weekday_mismatch",
            summary: `${a.start_weekday[0]?.toUpperCase()}${a.start_weekday.slice(1)} is ${corrected_start_date}, not ${a.start_date} (a ${actualStartWd}). Re-call with the corrected dates.`,
            expected_start_weekday: a.start_weekday,
            actual_start_weekday: actualStartWd,
            corrected_start_date,
            corrected_end_date,
          };
        }
        const actualEndWd = weekdayOf(a.end_date);
        if (actualEndWd !== a.end_weekday) {
          const corrected_end_date = nextWeekdayDate(
            a.start_date,
            a.end_weekday,
            true,
          );
          return {
            ok: false,
            error: "weekday_mismatch",
            summary: `${a.end_weekday[0]?.toUpperCase()}${a.end_weekday.slice(1)} is ${corrected_end_date}, not ${a.end_date} (a ${actualEndWd}). Re-call with the corrected end date.`,
            expected_end_weekday: a.end_weekday,
            actual_end_weekday: actualEndWd,
            corrected_start_date: a.start_date,
            corrected_end_date,
          };
        }

        // Loophole closer: a "weekday"/"date"/"relative" trip must NOT
        // start on today. The only way start_date can equal current_date
        // is start_kind="today". This catches the failure mode where the
        // model picked today and labeled it "date" / "weekday" to bypass
        // validation.
        if (a.start_date === today && a.start_kind !== "today") {
          return {
            ok: false,
            error: "start_today_without_today_kind",
            summary: `start_date is today (${today}) but start_kind is "${a.start_kind}". If the user said "today"/"now", set start_kind="today". Otherwise pick a future date — the user named a weekday or specific date that isn't today.`,
            current_date: today,
          };
        }

        // Transcript cross-check: if the user actually said specific
        // weekday names in their last few turns, the model's
        // start_weekday / end_weekday MUST be drawn from that set.
        // Catches the failure mode where speech is "Wednesday" but the
        // model invents "Tuesday".
        const recentUserText = useVoiceStore
          .getState()
          .transcript.filter((t) => t.role === "user")
          .slice(-3)
          .map((t) => t.text)
          .join(" ");
        const mentionedWeekdays = extractWeekdays(recentUserText);
        if (mentionedWeekdays.size > 0) {
          const claimedWeekdays = new Set([a.start_weekday, a.end_weekday]);
          const missingUserWeekdays = Array.from(mentionedWeekdays).filter(
            (wd) => !claimedWeekdays.has(wd),
          );
          const claimedNothingUserSaid =
            !mentionedWeekdays.has(a.start_weekday) &&
            !mentionedWeekdays.has(a.end_weekday);

          // If the user said a range like "Thursday to Sunday", both
          // endpoints must survive into the tool call. A partial match
          // (thu/sat) is still wrong because it drops Sunday.
          if (missingUserWeekdays.length > 0 || claimedNothingUserSaid) {
            const userList = Array.from(mentionedWeekdays).join("/");
            const missing = missingUserWeekdays[0];
            const correction =
              missing && a.start_weekday !== missing
                ? {
                    corrected_start_date: a.start_date,
                    corrected_end_date: nextWeekdayDate(
                      a.start_date,
                      missing,
                      true,
                    ),
                    corrected_end_weekday: missing,
                  }
                : {};
            return {
              ok: false,
              error: "weekday_not_in_user_speech",
              summary: `User said ${userList} but you picked start_weekday="${a.start_weekday}", end_weekday="${a.end_weekday}". Re-call with the weekdays the user actually named.`,
              user_mentioned: Array.from(mentionedWeekdays),
              you_claimed: [a.start_weekday, a.end_weekday],
              ...correction,
            };
          }
        }

        // Layer 3 — start_kind ↔ start_date consistency.
        if (a.start_kind === "weekday") {
          // The user named a weekday; the start MUST be strictly after today.
          // nextWeekdayDate(today, X, inclusive_today=false) is the canonical
          // answer.
          const expected = nextWeekdayDate(today, a.start_weekday);
          if (a.start_date !== expected) {
            const corrected_end_date = buildShiftedEnd(expected);
            return {
              ok: false,
              error: "start_kind_mismatch",
              summary: `User named a weekday — the next ${a.start_weekday} is ${expected}, not ${a.start_date}. Re-call with start_date=${expected} and shift end accordingly.`,
              expected_start_date: expected,
              corrected_start_date: expected,
              corrected_end_date,
            };
          }
        } else if (a.start_kind === "today") {
          if (a.start_date !== today) {
            const corrected_end_date = buildShiftedEnd(today);
            return {
              ok: false,
              error: "start_kind_mismatch",
              summary: `User said 'today' — start_date must be ${today}, not ${a.start_date}.`,
              corrected_start_date: today,
              corrected_end_date,
            };
          }
        } else if (a.start_kind === "tomorrow") {
          const tomorrow = addDays(today, 1);
          if (a.start_date !== tomorrow) {
            const corrected_end_date = buildShiftedEnd(tomorrow);
            return {
              ok: false,
              error: "start_kind_mismatch",
              summary: `User said 'tomorrow' — start_date must be ${tomorrow}, not ${a.start_date}.`,
              corrected_start_date: tomorrow,
              corrected_end_date,
            };
          }
        }
        // start_kind === "date" or "relative" → trust start_date as-is.

        store.setTripBasics({
          destination_id: dest.id,
          destination_name: dest.name,
          start_date: a.start_date,
          end_date: a.end_date,
          travelers: a.travelers,
          vibe: a.vibe,
        });
        return {
          ok: true,
          summary: `Trip set: ${dest.name}, ${a.start_date} (${weekdayOf(a.start_date)}) to ${a.end_date} (${weekdayOf(a.end_date)}), ${a.travelers} traveler${a.travelers === 1 ? "" : "s"}.`,
          destination_id: dest.id,
        };
      }

      case "set_day_modes": {
        const a = setDayModesZ.parse(args);
        const len = useItineraryStore.getState().days.length;
        if (a.modes.length !== len) {
          return {
            ok: false,
            error: "length_mismatch",
            summary: `Trip has ${len} days; you provided ${a.modes.length} modes.`,
            expected: len,
          };
        }
        store.setDayModes(a.modes as DayMode[]);
        return {
          ok: true,
          summary: `Day modes: ${a.modes.join(" → ")}.`,
        };
      }

      case "add_fixed_event": {
        const a = addFixedEventZ.parse(args);
        const id = store.addFixedEvent(a.day_index, {
          title: a.title,
          type: a.type,
          start_time: a.start_time,
          duration_min: a.duration_min,
          location: a.location,
          source: "user",
        });
        return {
          ok: true,
          summary: `Pinned ${a.title} on day ${a.day_index + 1} at ${a.start_time}.`,
          fixed_event_id: id,
        };
      }

      case "set_stay": {
        const a = setStayZ.parse(args);
        const trip = useItineraryStore.getState().trip;
        const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
        const property = a.property_id
          ? dest?.stays.find((s) => s.id === a.property_id)
          : undefined;
        store.setStay({
          area_id: a.area_id,
          property_id: a.property_id,
          name: property?.name,
          tier: property?.tier,
          image: property?.image,
          blurb: property?.blurb,
          check_in_day: a.check_in_day,
          check_out_day: a.check_out_day,
        });
        return {
          ok: true,
          summary: property
            ? `Staying at ${property.name} in ${property.area_id}.`
            : `Stay area set to ${a.area_id}.`,
        };
      }

      case "add_activity": {
        const a = addActivityZ.parse(args);
        const trip = useItineraryStore.getState().trip;
        const days = useItineraryStore.getState().days;
        const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
        const day = days[a.day_index];
        if (!day) {
          return {
            ok: false,
            error: "day_out_of_range",
            summary: `There is no day ${a.day_index + 1}.`,
          };
        }
        const catalogActivity = a.activity_id
          ? dest?.activities.find((x) => x.id === a.activity_id) ??
            dest?.food.find((x) => x.id === a.activity_id)
          : undefined;
        const result = trySchedule({
          day,
          activity: catalogActivity,
          start_time: a.start_time,
          duration_min: a.duration_min,
          area_id: catalogActivity?.area_id,
          transit_time_matrix: dest?.transit_time_matrix,
        });
        if (!result.ok) {
          return {
            ok: false,
            error: "schedule_conflict",
            summary: explainConflict(result.conflict),
            conflict: result.conflict,
            alternatives: result.alternatives,
          };
        }
        const id = store.addActivity(a.day_index, {
          catalog_id: catalogActivity?.id,
          title: catalogActivity?.name ?? a.title ?? "Activity",
          start_time: a.start_time,
          duration_min: a.duration_min,
          area_id: catalogActivity?.area_id,
          notes: a.notes,
          image: catalogActivity?.image,
        });
        return {
          ok: true,
          summary: `Added ${catalogActivity?.name ?? a.title} on day ${a.day_index + 1} at ${a.start_time}.`,
          activity_id: id,
        };
      }

      case "move_activity": {
        const a = moveActivityZ.parse(args);
        const moved = store.moveActivity(a.activity_id, {
          day_index: a.to_day_index,
          start_time: a.to_start_time,
        });
        return moved
          ? {
              ok: true,
              summary: `Moved to day ${a.to_day_index + 1} at ${a.to_start_time}.`,
            }
          : {
              ok: false,
              error: "activity_not_found",
              summary: "Couldn't find that activity to move.",
            };
      }

      case "remove_activity": {
        const a = removeActivityZ.parse(args);
        const removed = store.removeActivity(a.activity_id);
        return removed
          ? { ok: true, summary: "Removed." }
          : {
              ok: false,
              error: "activity_not_found",
              summary: "Nothing to remove with that id.",
            };
      }

      case "set_preferences": {
        const a = setPrefsZ.parse(args);
        store.setPreferences(a);
        return { ok: true, summary: "Preferences updated." };
      }

      case "query_catalog": {
        const a = queryCatalogZ.parse(args);
        const result = queryCatalogData({
          destination: a.destination,
          filter: {
            type: a.type,
            tags: a.tags,
            area_id: a.area_id,
            work_friendly: a.work_friendly,
            max_results: 6,
          },
        });
        if (!result.ok) {
          return {
            ok: false,
            error: result.error,
            summary: `I don't have ${a.destination}.`,
          };
        }
        const { ok: _omit, ...rest } = result;
        void _omit;
        return {
          ok: true,
          summary: `Catalog hits: ${result.activities.length} act, ${result.stays.length} stay, ${result.food.length} food.`,
          ...rest,
        };
      }

      case "get_destination_context": {
        const a = getDestZ.parse(args);
        const dest = findDestinationByText(a.destination);
        if (!dest) {
          return {
            ok: false,
            error: "destination_not_found",
            summary: `I don't have ${a.destination}.`,
            available: listDestinations().map((d) => d.id),
          };
        }
        const context = destinationContextForPrompt(dest.id);
        return {
          ok: true,
          summary: context ?? "No context.",
          destination_id: dest.id,
          context,
          areas: dest.areas.map((x) => ({ id: x.id, name: x.name, vibe_tags: x.vibe_tags })),
          seasonal_warnings: dest.seasonal_warnings,
        };
      }

      case "suggest_slots": {
        const a = suggestSlotsZ.parse(args);
        const trip = useItineraryStore.getState().trip;
        const days = useItineraryStore.getState().days;
        const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
        const activity =
          dest?.activities.find((x) => x.id === a.activity_id) ??
          dest?.food.find((x) => x.id === a.activity_id);
        if (!activity) {
          return {
            ok: false,
            error: "activity_not_in_catalog",
            summary: `Activity ${a.activity_id} not in ${dest?.name ?? "catalog"}.`,
          };
        }
        const slots = suggestSlots({
          days,
          activity,
          duration_min: a.duration_min ?? activity.duration_min.typical,
          area_id: activity.area_id,
          transit_time_matrix: dest?.transit_time_matrix,
        });
        return {
          ok: true,
          summary:
            slots.length === 0
              ? `No clean slot for ${activity.name}.`
              : `Try day ${slots[0]!.day_index + 1} at ${slots[0]!.start_time}.`,
          slots,
        };
      }

      case "plan_day": {
        const a = planDayZ.parse(args);
        const trip = useItineraryStore.getState().trip;
        const days = useItineraryStore.getState().days;
        const stay = useItineraryStore.getState().stay;
        const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
        if (!dest) {
          return {
            ok: false,
            error: "no_destination",
            summary: "Set the trip first — I need a destination to draft a day.",
          };
        }
        const day = days[a.day_index];
        if (!day) {
          return {
            ok: false,
            error: "day_out_of_range",
            summary: `There is no day ${a.day_index + 1}.`,
          };
        }
        const result = planDay({
          day,
          dest,
          intent: a.intent,
          area_id: a.area_id ?? stay?.area_id,
          stay_area_id: stay?.area_id,
          must_include: a.must_include,
        });
        if (!result.ok) {
          return {
            ok: false,
            error: result.reason,
            summary:
              result.reason === "transit_day"
                ? `Day ${a.day_index + 1} is a travel day; nothing to draft.`
                : result.reason === "no_matching_template"
                  ? `No template matches day ${a.day_index + 1}; ask the user for a steer.`
                  : `Day ${a.day_index + 1} is fully booked or every template slot got filtered.`,
          };
        }
        return {
          ok: true,
          summary: result.rationale,
          day_index: result.day_index,
          slots: result.slots,
          template_id: result.template_id,
        };
      }

      case "propose_full_itinerary": {
        const a = proposeFullZ.parse(args);
        const trip = useItineraryStore.getState().trip;
        const days = useItineraryStore.getState().days;
        const stay = useItineraryStore.getState().stay;
        const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
        if (!dest) {
          return {
            ok: false,
            error: "no_destination",
            summary: "Set the trip first — I need a destination to draft.",
          };
        }
        const result = proposeFullItinerary({
          days,
          dest,
          intent: a.intent,
          must_include: a.must_include,
          stay_area_id: stay?.area_id,
        });
        return {
          ok: true,
          summary: result.summary,
          days: result.days,
        };
      }

      case "validate_itinerary": {
        const issues = validateAll();
        return {
          ok: true,
          summary:
            issues.length === 0
              ? "Itinerary checks out."
              : `${issues.length} issue${issues.length === 1 ? "" : "s"} to resolve.`,
          issues,
        };
      }

      case "finalize_itinerary": {
        const issues = validateAll();
        if (issues.length > 0) {
          return {
            ok: false,
            error: "validation_failed",
            summary: `Can't finalize — ${issues.length} issue(s).`,
            issues,
          };
        }
        const id = store.finalize();
        return {
          ok: true,
          summary: "Locked in.",
          share_id: id,
        };
      }

      case "search_flights": {
        const a = searchFlightsZ.parse(args);
        const result = searchFlights({ from: a.from, to: a.to, max: a.max });
        if (!result.ok) {
          return {
            ok: false,
            error: result.error,
            summary: `I don't have flights into ${a.to.toUpperCase()}. Supported airports: ${result.supported_destinations.join(", ")}.`,
            supported_destinations: result.supported_destinations,
            supported_origins: result.supported_origins,
          };
        }
        const top = result.flights.slice(0, 3);
        const summary =
          top.length === 0
            ? `No options found ${result.from}→${result.to}.`
            : `${result.flights.length} ${result.from}→${result.to}: ` +
              top
                .map(
                  (f) =>
                    `${f.airline} ${f.flight_no} ${f.depart}${f.arrives_next_day ? " (+1)" : ""} $${f.price_usd}${f.stops ? ` (${f.stops} stop)` : ""}`,
                )
                .join("; ");
        return {
          ok: true,
          summary,
          from: result.from,
          to: result.to,
          destination_id: result.destination_id,
          flights: result.flights,
        };
      }

      case "suggest_stays": {
        const a = suggestStaysZ.parse(args);
        const dest = findDestinationByText(a.destination);
        if (!dest) {
          return {
            ok: false,
            error: "destination_not_found",
            summary: `I don't have ${a.destination}.`,
            available: listDestinations().map((d) => d.id),
          };
        }
        const ranked = rankStays(dest, {
          vibe: a.vibe,
          budget_tier: a.budget_tier,
          work_friendly: a.work_friendly,
          area_id: a.area_id,
        });
        if (ranked.length === 0) {
          return {
            ok: true,
            summary: `No clean stay match for ${dest.name}; widening the search may help.`,
            stays: [],
          };
        }
        return {
          ok: true,
          summary: ranked
            .map((r) => `${r.stay.name} — ${r.rationale}`)
            .join(" | "),
          stays: ranked.map((r) => ({
            id: r.stay.id,
            name: r.stay.name,
            area_id: r.stay.area_id,
            tier: r.stay.tier,
            tags: r.stay.tags,
            blurb: r.stay.blurb,
            work_friendly: r.stay.work_friendly,
            rationale: r.rationale,
          })),
        };
      }

      case "suggest_nearby": {
        const a = suggestNearbyZ.parse(args);
        const dest = findDestinationByText(a.destination);
        if (!dest) {
          return {
            ok: false,
            error: "destination_not_found",
            summary: `I don't have ${a.destination}.`,
          };
        }
        const stay = useItineraryStore.getState().stay;
        const baseArea = a.area_id ?? stay?.area_id;
        if (!baseArea) {
          return {
            ok: false,
            error: "no_base_area",
            summary: "Pick a stay first so I know where 'nearby' is from.",
          };
        }
        const items = nearbyItems(dest, {
          base_area_id: baseArea,
          max_minutes: a.max_minutes ?? 25,
          max: a.max ?? 4,
        });
        return {
          ok: true,
          summary:
            items.length === 0
              ? `Nothing within ${a.max_minutes ?? 25} min of ${baseArea}.`
              : `${items.length} nearby ${baseArea}: ` +
                items
                  .map((i) => `${i.item.name} (${i.transit_min}m)`)
                  .join(", "),
          base_area_id: baseArea,
          items,
        };
      }

      case "get_transport_info": {
        const a = getTransportZ.parse(args);
        const dest = findDestinationByText(a.destination);
        if (!dest) {
          return {
            ok: false,
            error: "destination_not_found",
            summary: `I don't have ${a.destination}.`,
          };
        }
        const info = getTransportNotes(dest);
        return {
          ok: true,
          summary: info.summary,
          airport_code: dest.airport_code,
          airport_transfer: info.airport_transfer,
          intracity: info.intracity,
        };
      }

      case "open_print": {
        const id = useItineraryStore.getState().share_id;
        const status = useItineraryStore.getState().status;
        if (!id || status !== "finalized") {
          return {
            ok: false,
            error: "not_finalized",
            summary: "Finalize the trip before opening the printable view.",
          };
        }
        return {
          ok: true,
          summary: "Opening the printable view.",
          url: `/trip/${id}/print`,
        };
      }

      case "export_ics": {
        const id = useItineraryStore.getState().share_id;
        const status = useItineraryStore.getState().status;
        if (!id || status !== "finalized") {
          return {
            ok: false,
            error: "not_finalized",
            summary: "Finalize the trip before exporting to calendar.",
          };
        }
        return {
          ok: true,
          summary: "Calendar file ready.",
          url: `/api/export/${id}/ics`,
        };
      }

      default:
        return {
          ok: false,
          error: "unknown_tool",
          summary: `Tool ${name} is not available.`,
        };
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        error: "invalid_arguments",
        summary: "Argument validation failed.",
        issues: err.issues,
      };
    }
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("[tools] dispatch error", err);
    return { ok: false, error: msg, summary: msg };
  }
}

const WEEKDAY_TOKENS: ReadonlyArray<readonly [string, "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"]> = [
  ["monday", "mon"],
  ["tuesday", "tue"],
  ["wednesday", "wed"],
  ["thursday", "thu"],
  ["friday", "fri"],
  ["saturday", "sat"],
  ["sunday", "sun"],
];

/**
 * Pull weekday short codes out of arbitrary user speech. Used by the
 * dispatcher to cross-check that the model's start_weekday/end_weekday
 * claim is actually grounded in what the user said — catches the failure
 * mode where speech is "Wednesday" but the model fabricates "Tuesday".
 */
function extractWeekdays(text: string): Set<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"> {
  const found = new Set<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">();
  const lower = text.toLowerCase();
  for (const [longWd, shortWd] of WEEKDAY_TOKENS) {
    if (lower.includes(longWd)) found.add(shortWd);
  }
  return found;
}

function explainConflict(c: Conflict): string {
  switch (c.kind) {
    case "fixed_event":
      return `Conflicts with ${c.with} at ${c.at}.`;
    case "activity_overlap":
      return `Overlaps with ${c.with} at ${c.at}.`;
    case "closed_day":
      return `Closed on ${c.weekday}.`;
    case "outside_hours":
      return `Outside opening hours (${c.window}).`;
    case "transit_buffer_required":
      return `Need ${c.minutes} min transit from ${c.from}.`;
    case "before_morning_floor":
      return "Too early — model rules say no scheduling before 09:00.";
  }
}

/**
 * Issue catalog returned by validate_itinerary. Each issue carries enough
 * structure for the model to voice ONE sentence and pivot to a corrective
 * tool call without re-asking the user.
 */
type ValidationIssue =
  | { kind: "activity_overlap"; day_index: number; with: string; at: string; issue: string }
  | { kind: "fixed_event_clash"; day_index: number; with: string; at: string; issue: string }
  | {
      kind: "weekday_mismatch";
      day_index: number;
      stated_weekday: string;
      actual_weekday: string;
      issue: string;
    }
  | {
      kind: "stay_area_mismatch";
      day_index: number;
      activity_id: string;
      transit_min: number;
      issue: string;
      suggestion: "remove_or_swap";
    }
  | {
      kind: "empty_planned_day";
      day_index: number;
      issue: string;
      suggestion: "call_plan_day";
    }
  | {
      kind: "meeting_day_mode_mismatch";
      day_index: number;
      meeting_title: string;
      current_mode: string;
      issue: string;
      suggestion: "set_day_modes";
    };

/**
 * Cross-checks the live itinerary store against the model's stated intent.
 * The model is told (in TOOLS_DISCIPLINE) to call this AFTER every
 * meaningful mutation and to voice any issues + pivot to a corrective
 * tool call. Catches the classes of bugs the user kept hitting:
 *  - Wed paint when user said Thursday
 *  - Palm Jumeirah activity on an Old Dubai day
 *  - Empty leisure day after propose_full_itinerary tried
 *  - Meeting on a "leisure" day
 */
function validateAll(): ValidationIssue[] {
  const days = useItineraryStore.getState().days;
  const trip = useItineraryStore.getState().trip;
  const stay = useItineraryStore.getState().stay;
  const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
  const issues: ValidationIssue[] = [];
  if (!dest) return issues;

  const stayRegion = areaToRegion(dest, stay?.area_id);
  const transit = dest.transit_time_matrix;

  for (const day of days) {
    // 1. Activity overlap check
    const sorted = [...day.activities].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const prevEnd = timeToMinutes(prev.start_time) + prev.duration_min;
      if (timeToMinutes(cur.start_time) < prevEnd) {
        issues.push({
          kind: "activity_overlap",
          day_index: day.index,
          with: prev.title,
          at: cur.start_time,
          issue: `${cur.title} overlaps ${prev.title}`,
        });
      }
    }

    // 2. Fixed-event vs activity clash
    for (const ev of day.fixed_events) {
      const evStart = timeToMinutes(ev.start_time);
      const evEnd = evStart + ev.duration_min;
      for (const a of day.activities) {
        const aStart = timeToMinutes(a.start_time);
        const aEnd = aStart + a.duration_min;
        if (aStart < evEnd && evStart < aEnd) {
          issues.push({
            kind: "fixed_event_clash",
            day_index: day.index,
            with: ev.title,
            at: ev.start_time,
            issue: `${a.title} clashes with ${ev.title} at ${ev.start_time}`,
          });
        }
      }
    }

    // 3. Weekday mismatch — fixed_event title contains a stated weekday
    //    that conflicts with the actual weekday of day.date.
    const actualWd = dateToWeekday(day.date);
    const wdFull: Record<string, string> = {
      mon: "monday",
      tue: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      fri: "friday",
      sat: "saturday",
      sun: "sunday",
    };
    for (const ev of day.fixed_events) {
      const titleLc = ev.title.toLowerCase();
      for (const [shortWd, longWd] of Object.entries(wdFull)) {
        if (
          (titleLc.includes(longWd) || titleLc.includes(` ${shortWd} `)) &&
          shortWd !== actualWd
        ) {
          issues.push({
            kind: "weekday_mismatch",
            day_index: day.index,
            stated_weekday: longWd,
            actual_weekday: wdFull[actualWd] ?? actualWd,
            issue: `${ev.title} says ${longWd} but day ${day.index + 1} is a ${wdFull[actualWd]}`,
          });
        }
      }
    }

    // 4. Stay-area mismatch: activities >90min from stay area on a non-
    //    adventure day. Triggers when the model picks a far-region template.
    if (stay?.area_id && day.mode !== "adventure" && day.mode !== "travel") {
      for (const a of day.activities) {
        if (!a.area_id || a.area_id === stay.area_id) continue;
        const minutes = transit[stay.area_id]?.[a.area_id];
        if (minutes !== undefined && minutes > 90) {
          issues.push({
            kind: "stay_area_mismatch",
            day_index: day.index,
            activity_id: a.id,
            transit_min: minutes,
            issue: `${a.title} is ${minutes}min from your stay (${stay.area_id}) — too far for a ${day.mode} day`,
            suggestion: "remove_or_swap",
          });
        }
        // Also flag cross-region picks when regions are defined.
        if (stayRegion) {
          const aRegion = areaToRegion(dest, a.area_id);
          if (aRegion && aRegion !== stayRegion) {
            // Avoid double-counting if we already flagged transit > 90min.
            if (!minutes || minutes <= 90) {
              issues.push({
                kind: "stay_area_mismatch",
                day_index: day.index,
                activity_id: a.id,
                transit_min: minutes ?? -1,
                issue: `${a.title} is in the ${aRegion} region but your stay is in ${stayRegion}`,
                suggestion: "remove_or_swap",
              });
            }
          }
        }
      }
    }

    // 5. Empty leisure/chill day with no fixed events. Legitimate state
    //    BEFORE propose_full_itinerary has run, but a problem after.
    if (
      (day.mode === "leisure" || day.mode === "chill") &&
      day.fixed_events.length === 0 &&
      day.activities.length === 0
    ) {
      issues.push({
        kind: "empty_planned_day",
        day_index: day.index,
        issue: `Day ${day.index + 1} is ${day.mode} but completely empty`,
        suggestion: "call_plan_day",
      });
    }

    // 6. Meeting on a non-work day. Heuristic: if the day has a meeting-
    //    type fixed_event but mode is chill/leisure, surface it.
    const hasMeeting = day.fixed_events.some((e) => e.type === "meeting");
    if (hasMeeting && (day.mode === "chill" || day.mode === "leisure")) {
      const meeting = day.fixed_events.find((e) => e.type === "meeting")!;
      issues.push({
        kind: "meeting_day_mode_mismatch",
        day_index: day.index,
        meeting_title: meeting.title,
        current_mode: day.mode,
        issue: `Day ${day.index + 1} has a meeting but is marked ${day.mode}`,
        suggestion: "set_day_modes",
      });
    }
  }

  // Reference minutesToTime so the import isn't reported unused.
  void minutesToTime;
  return issues;
}
