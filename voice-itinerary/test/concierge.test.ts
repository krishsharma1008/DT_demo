/**
 * The four client demo use cases, driven through the same tool dispatcher
 * the realtime model calls. Assertions are invariants (fit, unchanged
 * stops, radius) so they hold on any weekday and at any time of day.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dispatchToolCall } from "@/lib/realtime/tools";
import { useItineraryStore } from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import { dubai, findPlace } from "@/lib/data";
import { fitsVisit, resolveLocation, visitorCoords, placeCoords } from "@/lib/concierge/planner";
import { travelMinutes } from "@/lib/concierge/geo";

const call = (name: string, args: object) => dispatchToolCall(name, JSON.stringify(args));
const acts = () => useItineraryStore.getState().days[0]?.activities ?? [];

async function planFamilyDowntownDay() {
  const v = await call("update_visit", {
    adults: 2,
    children_ages: [8, 12],
    location: "Downtown",
    low_walking: true,
  });
  assert.equal(v.ok, true, v.summary);
  const r = await call("plan_my_day", { start_time: "10:00", end_time: "20:00" });
  assert.equal(r.ok, true, r.summary);
  return r;
}

beforeEach(() => {
  useItineraryStore.getState().reset();
  useVoiceStore.getState().reset();
});

describe("catalog", () => {
  test("Dubai is the only destination and every place has coordinates", () => {
    const places = [...dubai.activities, ...dubai.food];
    assert.ok(places.length >= 60, `expected a rich catalog, got ${places.length}`);
    const missing = places.filter((p) => !p.coords).map((p) => p.id);
    assert.deepEqual(missing, [], "places without coords");
    const ids = places.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids");
  });

  test("resolves spoken locations", () => {
    assert.equal(resolveLocation("near Downtown", dubai).area_id, "downtown");
    assert.equal(resolveLocation("we're by the Dubai Mall", dubai).area_id, "downtown");
    assert.equal(resolveLocation("in the Marina", dubai).area_id, "marina");
  });
});

describe("use case 1 — plan my day", () => {
  test("timed, family-suitable, low-walking itinerary with a reason per stop", async () => {
    await planFamilyDowntownDay();
    const visit = useItineraryStore.getState().visit;
    assert.deepEqual(visit.party, { adults: 2, children: [8, 12] });
    assert.equal(visit.location?.area_id, "downtown");

    const stops = acts();
    assert.ok(stops.length >= 3, `expected ≥3 stops, got ${stops.length}`);
    let prevEnd = 0;
    for (const s of stops) {
      const p = findPlace(s.catalog_id!);
      assert.ok(p, `${s.title} is a catalog place`);
      assert.ok(fitsVisit(p!, visit), `${p!.name} fits the family`);
      assert.notEqual(p!.walking, "lots", `${p!.name} isn't a long walk`);
      assert.ok(s.reason && s.reason.length > 10, `${p!.name} has a reason`);
      const [h, m] = s.start_time.split(":").map(Number);
      const start = h! * 60 + m!;
      assert.ok(start >= prevEnd, `${s.title} doesn't overlap the previous stop`);
      prevEnd = start + s.duration_min;
    }
    assert.ok(stops[0]!.start_time >= "10:00");
    assert.ok(prevEnd <= 20 * 60, "ends within the window");
  });
});

describe("use case 2 — change one part", () => {
  test("swaps only the targeted stop for an indoor non-museum one", async () => {
    await planFamilyDowntownDay();
    const before = acts().map((a) => ({ ...a }));
    // Make sure there is a museum to swap: replace the first activity with one.
    const museum = [...dubai.activities].find(
      (p) => p.tags.includes("museum") && fitsVisit(p, useItineraryStore.getState().visit),
    );
    assert.ok(museum, "catalog has a family-suitable museum");
    let target = before.find((a) => findPlace(a.catalog_id!)?.tags.includes("museum"));
    if (!target) {
      const first = before.find((a) => findPlace(a.catalog_id!)?.kind !== "food")!;
      useItineraryStore.getState().replaceActivity(first.id, {
        ...first,
        catalog_id: museum!.id,
        title: museum!.name,
      });
      target = acts().find((a) => a.catalog_id === museum!.id)!;
    }
    const snapshot = acts().map((a) => ({ ...a }));

    const r = await call("replace_stop", { avoid: ["museum"], indoor: true });
    assert.equal(r.ok, true, r.summary);

    const after = acts();
    assert.equal(after.length, snapshot.length, "same number of stops");
    const newStop = after.find((a) => !snapshot.some((b) => b.id === a.id))!;
    assert.ok(newStop, "one new stop");
    assert.equal(newStop.start_time, target.start_time, "keeps the slot time");
    const p = findPlace(newStop.catalog_id!)!;
    assert.equal(p.indoor_outdoor, "indoor", `${p.name} is indoors`);
    assert.ok(!p.tags.includes("museum") && !/museum/i.test(p.name), `${p.name} isn't a museum`);
    for (const b of snapshot.filter((x) => x.id !== target!.id)) {
      const still = after.find((a) => a.id === b.id);
      assert.ok(still, `${b.title} kept`);
      assert.equal(still!.start_time, b.start_time, `${b.title} time kept`);
    }
    assert.ok(useItineraryStore.getState().visit.avoid_tags.includes("museum"), "dislike remembered");
    assert.deepEqual(useItineraryStore.getState().changed_ids, [newStop.id]);
  });
});

describe("use case 3 — help me now", () => {
  test("two nearby options within 20 minutes that suit the family and aren't in the plan", async () => {
    await planFamilyDowntownDay();
    const r = await call("find_nearby", { max_minutes: 20, purpose: "rest" });
    assert.equal(r.ok, true, r.summary);
    const opts = (r as unknown as { options: Array<{ place_id: string; travel_min: number }> }).options;
    assert.equal(opts.length, 2);
    const s = useItineraryStore.getState();
    const planned = new Set(acts().map((a) => a.catalog_id));
    const from = visitorCoords(dubai, s.visit);
    for (const o of opts) {
      const p = findPlace(o.place_id)!;
      assert.ok(o.travel_min <= 20, `${p.name} within 20 min`);
      assert.ok(travelMinutes(from, placeCoords(dubai, p)) <= 20);
      assert.ok(fitsVisit(p, s.visit), `${p.name} fits the family`);
      assert.ok(!planned.has(p.id), `${p.name} not already planned`);
    }
    assert.equal(s.nearby.length, 2, "options are on screen");
  });
});

describe("use case 4 — take the next step", () => {
  test("show_place opens the card with details and a directions link", async () => {
    await planFamilyDowntownDay();
    const near = await call("find_nearby", { max_minutes: 20 });
    const id = (near as unknown as { options: Array<{ place_id: string }> }).options[0]!.place_id;
    const r = await call("show_place", { place_id: id });
    assert.equal(r.ok, true, r.summary);
    const place = (r as unknown as { place: { directions_url: string; details: string; travel_min_by_taxi?: number } }).place;
    assert.match(place.directions_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
    assert.ok(place.details.length > 10);
    assert.equal(typeof place.travel_min_by_taxi, "number");
    assert.equal(useItineraryStore.getState().focus_place_id, id);
  });

  test("show_place resolves a spoken name", async () => {
    const r = await call("show_place", { name: "Burj Khalifa" });
    assert.equal(r.ok, true, r.summary);
    assert.equal(useItineraryStore.getState().focus_place_id, "act_burj_khalifa");
  });
});
