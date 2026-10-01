import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  planDay,
  proposeFullItinerary,
  suggestSlots,
  trySchedule,
} from "@/lib/realtime/scheduler";
import { dubai } from "@/lib/data";
import type { ItineraryDay } from "@/lib/store/itinerary";

function buildDays(start_iso: string, end_iso: string): ItineraryDay[] {
  // Local copy of the helper from the store so we can test without booting it.
  const start = new Date(start_iso + "T00:00:00");
  const end = new Date(end_iso + "T00:00:00");
  const days: ItineraryDay[] = [];
  let i = 0;
  for (
    let cur = new Date(start);
    cur.getTime() <= end.getTime();
    cur.setDate(cur.getDate() + 1)
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

describe("scheduler.planDay", () => {
  test("draws from chill template for leisure day", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const day = days[2]!; // 2026-05-17, a Sunday
    const r = planDay({ day, dest: dubai, intent: "chill" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.slots.length > 0, "should produce slots");
    assert.ok(r.template_id, "should pick a template");
    assert.ok(
      r.rationale.length > 0 && r.rationale.length < 200,
      "rationale present and short",
    );
  });

  test("travel day returns ok:false with transit_day reason", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const day = { ...days[0]!, mode: "travel" as const };
    const r = planDay({ day, dest: dubai, intent: "auto" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "transit_day");
  });

  test("closed_days slots are dropped (Jumeirah Mosque tours skip Friday)", () => {
    const days = buildDays("2026-05-15", "2026-05-15"); // Friday
    const day = days[0]!;
    for (const intent of ["cultural", "chill", "auto"] as const) {
      const r = planDay({ day, dest: dubai, intent });
      if (!r.ok) continue;
      for (const s of r.slots) {
        const p = [...dubai.activities, ...dubai.food].find((x) => x.id === s.activity_id);
        if (p) assert.ok(!p.closed_days.includes("fri"), `${p.name} is closed on Friday`);
      }
    }
  });

  test("fixed_event causes overlapping slots to be dropped", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const day = {
      ...days[1]!,
      fixed_events: [
        {
          id: "f1",
          title: "Client meeting",
          type: "meeting" as const,
          start_time: "11:00",
          duration_min: 90,
          location: "DIFC, Dubai",
        },
      ],
    };
    const r = planDay({ day, dest: dubai, intent: "work" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    // No slot should overlap 11:00–12:30 (plus pre/post buffer).
    for (const s of r.slots) {
      const start = parseInt(s.start_time.split(":")[0]!, 10) * 60 + parseInt(s.start_time.split(":")[1]!, 10);
      const end = start + s.duration_min;
      const evStart = 11 * 60 - 30;
      const evEnd = 12 * 60 + 30 + 30;
      assert.ok(
        start >= evEnd || end <= evStart,
        `slot ${s.start_time} (${s.title}) shouldn't overlap meeting buffer`,
      );
    }
  });

  test("must_include anchors a named activity even if not in the chosen template", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const day = days[0]!;
    const r = planDay({
      day,
      dest: dubai,
      intent: "chill",
      must_include: ["act_dubai_frame"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const anchor = r.slots.find(
      (s) => s.activity_id === "act_dubai_frame",
    );
    assert.ok(anchor, "must_include item is in the slots");
  });

  test("returns ok:false when no templates exist (empty templates array)", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const day = days[0]!;
    const stripped = { ...dubai, canonical_day_templates: [] };
    const r = planDay({ day, dest: stripped });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "no_matching_template");
  });
});

describe("scheduler.proposeFullItinerary", () => {
  test("plans every day on a 5-day Dubai trip", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const r = proposeFullItinerary({ days, dest: dubai });
    assert.equal(r.ok, true);
    assert.equal(r.days.length, 5);
    assert.ok(r.summary.length > 0, "summary present");
    assert.ok(r.summary.length < 250, "summary stays terse");
  });

  test("rotates templates so adjacent days don't repeat", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const r = proposeFullItinerary({ days, dest: dubai });
    const template_ids = r.days
      .map((d) => (d.ok ? d.template_id : null))
      .filter((id): id is string => Boolean(id));
    for (let i = 1; i < template_ids.length; i++) {
      assert.notEqual(
        template_ids[i],
        template_ids[i - 1],
        `day ${i} repeats template from day ${i - 1}`,
      );
    }
  });

  test("respects mode=work for work days", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    days[0]!.mode = "work";
    days[1]!.mode = "work";
    const r = proposeFullItinerary({ days, dest: dubai });
    const day0 = r.days[0];
    assert.ok(day0?.ok, "day 0 plan");
    if (day0?.ok) {
      // Work template should bias toward the work-from-cafe template.
      assert.equal(
        day0.template_id,
        "tpl_dubai_work_cafe",
        "work day picks work template",
      );
    }
  });
});

describe("scheduler.trySchedule", () => {
  test("rejects scheduling before 09:00 morning floor", () => {
    const days = buildDays("2026-05-15", "2026-05-15");
    const day = days[0]!;
    const r = trySchedule({
      day,
      start_time: "07:00",
      duration_min: 60,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.conflict.kind, "before_morning_floor");
  });

  test("accepts a clean 10:00 placement", () => {
    const days = buildDays("2026-05-15", "2026-05-15");
    const day = days[0]!;
    const r = trySchedule({
      day,
      start_time: "10:00",
      duration_min: 90,
    });
    assert.equal(r.ok, true);
  });
});

describe("scheduler.suggestSlots", () => {
  test("returns up to 3 candidate slots", () => {
    const days = buildDays("2026-05-15", "2026-05-19");
    const slots = suggestSlots({ days, duration_min: 60 });
    assert.ok(slots.length <= 3, `got ${slots.length} slots`);
    assert.ok(slots.length > 0, "should find at least one slot");
  });
});
