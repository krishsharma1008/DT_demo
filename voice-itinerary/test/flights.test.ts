import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { searchFlights } from "@/lib/data/flights";

describe("flights.searchFlights", () => {
  test("returns options for BOM → DXB", () => {
    const r = searchFlights({ from: "BOM", to: "DXB" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.flights.length > 0);
    assert.equal(r.from, "BOM");
    assert.equal(r.to, "DXB");
    assert.equal(r.destination_id, "dubai");
  });

  test("falls back to a hub when origin is unknown (HYD → DXB uses BOM)", () => {
    const r = searchFlights({ from: "HYD", to: "DXB" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.from, "BOM", "DXB fallback hub is BOM");
    assert.ok(r.flights.length > 0, "fallback still returns flights");
  });

  test("returns ok:false for airports other than DXB", () => {
    for (const to of ["XXX", "GOI", "LIS"]) {
      const r = searchFlights({ from: "BOM", to });
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.error, "destination_airport_not_supported");
      assert.deepEqual(r.supported_destinations, ["DXB"]);
    }
  });

  test("respects max parameter", () => {
    const r = searchFlights({ from: "LHR", to: "DXB", max: 1 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.flights.length <= 1);
  });
});
