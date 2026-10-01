import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dispatchToolCall } from "@/lib/realtime/tools";
import { useItineraryStore } from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import { addDays, nextWeekdayDate } from "@/lib/realtime/dateTable";

// Dates are relative to today so the suite never ages out: THU is the next
// Thursday strictly after today, WED the day before it, etc.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const THU = nextWeekdayDate(localToday(), "thu");
const WED = addDays(THU, -1);
const SAT = addDays(THU, 2);
const SUN = addDays(THU, 3);
const SAT_BEFORE = addDays(WED, 3);

beforeEach(() => {
  // Reset the Zustand store between tests so previous mutations don't bleed.
  useItineraryStore.getState().reset();
  useVoiceStore.getState().reset();
});

describe("set_trip_basics weekday validation", () => {
  test("accepts a correct Thursday→Sunday range", async () => {
    const result = await dispatchToolCall(
      "set_trip_basics",
      JSON.stringify({
        destination: "dubai",
        start_date: THU, // Thursday
        end_date: SUN, // Sunday
        travelers: 1,
        start_kind: "weekday",
        start_weekday: "thu",
        end_weekday: "sun",
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.summary.includes("thu") && result.summary.includes("sun"),
      "summary mentions weekdays",
    );
  });

  test("rejects start_date whose weekday is wrong (the screenshot bug)", async () => {
    // The exact bug from the user's screenshot: model picked the Wednesday
    // when the user said Thursday.
    const result = await dispatchToolCall(
      "set_trip_basics",
      JSON.stringify({
        destination: "dubai",
        start_date: WED, // Wednesday
        end_date: SAT_BEFORE, // Saturday
        travelers: 1,
        start_kind: "weekday",
        start_weekday: "thu",
        end_weekday: "sun",
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "weekday_mismatch");
    const obj = result as unknown as {
      corrected_start_date: string;
      corrected_end_date: string;
    };
    // Trip duration is 4 days (Wed→Sat inclusive). Shifting the start to
    // the next Thursday keeps the duration → end_date shifts to Sunday.
    assert.equal(obj.corrected_start_date, THU);
    assert.equal(obj.corrected_end_date, SUN);
  });

  test("rejects end_date weekday mismatch", async () => {
    const result = await dispatchToolCall(
      "set_trip_basics",
      JSON.stringify({
        destination: "dubai",
        start_date: THU, // Thursday — correct
        end_date: SAT, // Saturday — but user said Sunday
        travelers: 1,
        start_kind: "date",
        start_weekday: "thu",
        end_weekday: "sun",
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "weekday_mismatch");
    const obj = result as unknown as { corrected_end_date: string };
    assert.equal(obj.corrected_end_date, SUN);
  });

  test("rejects dropping Sunday when user said Thursday to Sunday", async () => {
    useVoiceStore
      .getState()
      .appendUserTurn("u1", "I want to book a trip to Dubai from Thursday to Sunday.");

    const result = await dispatchToolCall(
      "set_trip_basics",
      JSON.stringify({
        destination: "dubai",
        start_date: THU, // Thursday — correct
        end_date: SAT, // Saturday — model dropped Sunday
        travelers: 1,
        start_kind: "weekday",
        start_weekday: "thu",
        end_weekday: "sat",
      }),
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "weekday_not_in_user_speech");
    const obj = result as unknown as { corrected_end_date: string };
    assert.equal(obj.corrected_end_date, SUN);
  });

  test("rejects missing weekday metadata", async () => {
    const result = await dispatchToolCall(
      "set_trip_basics",
      JSON.stringify({
        destination: "dubai",
        start_date: WED, // Wed; would fail if weekday given
        end_date: SAT,
        travelers: 1,
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_arguments");
  });
});
