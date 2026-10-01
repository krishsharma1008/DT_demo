import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  areaToRegion,
  templatePrimaryRegion,
  planDay,
  proposeFullItinerary,
} from "@/lib/realtime/scheduler";
import { dubai } from "@/lib/data";
import type { ItineraryDay } from "@/lib/store/itinerary";

function buildDays(start_iso: string, end_iso: string): ItineraryDay[] {
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

describe("scheduler.areaToRegion", () => {
  test("Marina is in the west region", () => {
    assert.equal(areaToRegion(dubai, "marina"), "west");
  });
  test("Downtown is in the central region", () => {
    assert.equal(areaToRegion(dubai, "downtown"), "central");
  });
  test("unknown area returns null", () => {
    assert.equal(areaToRegion(dubai, "atlantis"), null);
  });
  test("undefined area returns null", () => {
    assert.equal(areaToRegion(dubai, undefined), null);
  });
});

describe("scheduler.templatePrimaryRegion", () => {
  test("iconic template maps to central", () => {
    const tpl = dubai.canonical_day_templates.find((t) => t.id === "tpl_dubai_iconic");
    assert.ok(tpl);
    assert.equal(templatePrimaryRegion(tpl!, dubai), "central");
  });
  test("work-from-café template maps to west", () => {
    const tpl = dubai.canonical_day_templates.find((t) => t.id === "tpl_dubai_work_cafe");
    assert.ok(tpl);
    assert.equal(templatePrimaryRegion(tpl!, dubai), "west");
  });
});

describe("scheduler region lock (Marina stay → no central-only templates)", () => {
  test("planDay with a Marina stay never picks a template anchored in another region", () => {
    const days = buildDays("2026-11-05", "2026-11-08");
    for (const day of days) {
      for (const intent of ["chill", "cultural", "work", "auto"] as const) {
        const r = planDay({ day, dest: dubai, intent, stay_area_id: "marina" });
        if (!r.ok || !r.template_id) continue;
        const tpl = dubai.canonical_day_templates.find((t) => t.id === r.template_id)!;
        const region = templatePrimaryRegion(tpl, dubai);
        assert.ok(
          region === null || region === "west",
          `${day.date} ${intent}: ${r.template_id} is in ${region}`,
        );
      }
    }
  });

  test("no stay_area_id means lock is disabled", () => {
    const days = buildDays("2026-11-05", "2026-11-08");
    const r = proposeFullItinerary({ days, dest: dubai, intent: "cultural" });
    assert.ok(
      r.days.some((d) => d.ok && d.template_id === "tpl_dubai_iconic"),
      "central iconic template reachable when no stay set",
    );
  });
});
