import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatItinerarySnapshot,
  timeToMinutes,
  minutesToTime,
  dateToWeekday,
  useItineraryStore,
} from "@/lib/store/itinerary";

describe("itinerary.formatItinerarySnapshot", () => {
  test("returns null for an empty store", () => {
    const snap = formatItinerarySnapshot({
      trip: {
        destination_id: null,
        destination_name: null,
        start_date: null,
        end_date: null,
        travelers: 1,
      },
      days: [],
      stay: null,
      preferences: {},
      status: "empty",
    });
    assert.equal(snap, null);
  });

  test("includes destination, dates, traveler count, vibe", () => {
    const snap = formatItinerarySnapshot({
      trip: {
        destination_id: "dubai",
        destination_name: "Dubai",
        start_date: "2026-05-15",
        end_date: "2026-05-19",
        travelers: 2,
        vibe: "chill",
      },
      days: [
        {
          index: 0,
          date: "2026-05-15",
          mode: "work",
          fixed_events: [],
          activities: [],
        },
      ],
      stay: null,
      preferences: {},
      status: "draft",
    });
    assert.ok(snap?.includes("5-day Dubai") || snap?.includes("1-day Dubai"));
    assert.ok(snap?.includes("2026-05-15"));
    assert.ok(snap?.includes("2026-05-19"));
    assert.ok(snap?.includes("2 traveler"));
    assert.ok(snap?.includes("chill"));
  });

  test("renders fixed events and activities per day", () => {
    const snap = formatItinerarySnapshot({
      trip: {
        destination_id: "dubai",
        destination_name: "Dubai",
        start_date: "2026-05-15",
        end_date: "2026-05-15",
        travelers: 1,
      },
      days: [
        {
          index: 0,
          date: "2026-05-15",
          mode: "work",
          fixed_events: [
            {
              id: "f0",
              title: "Meeting with Anand",
              type: "meeting",
              start_time: "15:00",
              duration_min: 60,
              location: "DIFC",
            },
          ],
          activities: [
            {
              id: "a0",
              title: "Marina cafe",
              start_time: "10:00",
              duration_min: 120,
              area_id: "marina",
            },
          ],
        },
      ],
      stay: null,
      preferences: {},
      status: "draft",
    });
    assert.ok(snap?.includes("Meeting with Anand"));
    assert.ok(snap?.includes("15:00"));
    assert.ok(snap?.includes("Marina cafe"));
    assert.ok(snap?.includes("10:00"));
  });

  test("renders preferences block when set", () => {
    const snap = formatItinerarySnapshot({
      trip: {
        destination_id: "dubai",
        destination_name: "Dubai",
        start_date: "2026-05-15",
        end_date: "2026-05-15",
        travelers: 1,
      },
      days: [],
      stay: null,
      preferences: {
        budget_tier: "premium",
        dietary: ["vegetarian"],
        avoid: ["seafood"],
      },
      status: "draft",
    });
    assert.ok(snap?.includes("budget=premium"));
    assert.ok(snap?.includes("diet=vegetarian"));
    assert.ok(snap?.includes("avoid=seafood"));
  });
});

describe("itinerary helpers", () => {
  test("setTripBasics preserves ISO dates when building days", () => {
    useItineraryStore.getState().reset();
    useItineraryStore.getState().setTripBasics({
      destination_id: "dubai",
      destination_name: "Dubai",
      start_date: "2026-04-30",
      end_date: "2026-05-03",
      travelers: 1,
      vibe: "chill",
    });

    assert.deepEqual(
      useItineraryStore.getState().days.map((d) => d.date),
      ["2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03"],
    );
  });

  test("timeToMinutes / minutesToTime are inverses", () => {
    for (const t of ["00:00", "09:30", "13:45", "23:59"]) {
      assert.equal(minutesToTime(timeToMinutes(t)), t);
    }
  });

  test("dateToWeekday maps known dates", () => {
    // 2026-04-26 is a Sunday.
    assert.equal(dateToWeekday("2026-04-26"), "sun");
    // 2026-05-15 is a Friday.
    assert.equal(dateToWeekday("2026-05-15"), "fri");
  });
});
