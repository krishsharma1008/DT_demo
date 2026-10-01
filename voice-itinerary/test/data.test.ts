import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  rankStays,
  nearbyItems,
  getTransportNotes,
  queryCatalog,
  listDestinations,
  destinationContextForPrompt,
} from "@/lib/data";
import { dubai } from "@/lib/data";

describe("data.rankStays", () => {
  test("returns at most 3 picks", () => {
    const r = rankStays(dubai, { vibe: "family", budget_tier: "comfort" });
    assert.ok(r.length <= 3);
    assert.ok(r.length > 0, "Dubai has comfort stays");
  });

  test("each pick carries a rationale", () => {
    const r = rankStays(dubai, { vibe: "chill" });
    for (const p of r) assert.ok(p.rationale.length > 0);
  });

  test("filters by area_id", () => {
    const r = rankStays(dubai, { area_id: "marina" });
    for (const p of r) assert.equal(p.stay.area_id, "marina");
  });

  test("work_friendly filter respected", () => {
    const r = rankStays(dubai, { work_friendly: true });
    for (const p of r) assert.equal(p.stay.work_friendly, true);
  });
});

describe("data.nearbyItems", () => {
  test("returns items within max_minutes of base area", () => {
    const r = nearbyItems(dubai, {
      base_area_id: "marina",
      max_minutes: 25,
      max: 4,
    });
    assert.ok(r.length > 0);
    for (const item of r) {
      assert.ok(
        item.transit_min <= 25,
        `${item.item.name} transit ${item.transit_min}m exceeds 25m`,
      );
    }
  });

  test("respects max parameter", () => {
    const r = nearbyItems(dubai, {
      base_area_id: "marina",
      max_minutes: 90,
      max: 3,
    });
    assert.ok(r.length <= 3);
  });

  test("sorted by transit time ascending", () => {
    const r = nearbyItems(dubai, {
      base_area_id: "old_dubai",
      max_minutes: 60,
      max: 6,
    });
    for (let i = 1; i < r.length; i++) {
      assert.ok(r[i]!.transit_min >= r[i - 1]!.transit_min);
    }
  });
});

describe("data.getTransportNotes", () => {
  test("returns airport_transfer + intracity copy for Dubai", () => {
    const notes = getTransportNotes(dubai);
    assert.ok(notes.summary.includes("DXB"));
    assert.ok(notes.airport_transfer.length > 0);
    assert.ok(notes.intracity.length > 0);
  });
});

describe("data.queryCatalog", () => {
  test("returns activities, stays, food when no filter", () => {
    const r = queryCatalog({ destination: "dubai" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.activities.length > 0);
    assert.ok(r.stays.length > 0);
    assert.ok(r.food.length > 0);
  });

  test("filter by type narrows result", () => {
    const r = queryCatalog({
      destination: "dubai",
      filter: { type: "stay" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.stays.length > 0);
    assert.equal(r.activities.length, 0);
    assert.equal(r.food.length, 0);
  });

  test("returns ok:false on unknown destination", () => {
    const r = queryCatalog({ destination: "atlantis" });
    assert.equal(r.ok, false);
  });
});

describe("data.listDestinations", () => {
  test("Dubai is the only destination", () => {
    const ids = listDestinations().map((d) => d.id);
    assert.deepEqual(ids, ["dubai"]);
  });

  test("UAE place names resolve to the Dubai catalog", () => {
    for (const q of ["Dubai", "abu dhabi", "Sharjah"]) {
      const r = queryCatalog({ destination: q });
      assert.equal(r.ok, true, q);
    }
  });
});

describe("data.destinationContextForPrompt", () => {
  test("Dubai context is non-empty and concise", () => {
    const ctx = destinationContextForPrompt("dubai");
    assert.ok(ctx);
    assert.ok(ctx!.length < 800, "context should be ≤180 token-equivalent");
    assert.ok(ctx!.includes("Dubai"));
  });
});
