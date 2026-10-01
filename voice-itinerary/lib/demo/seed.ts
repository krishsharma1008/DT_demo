"use client";

/**
 * Presenter / preview seed. Gated on a query param, never runs otherwise:
 *
 *   /?demo=1  (or plan)    family day near Downtown
 *   /?demo=2  (or change)  …with the museum swapped for an indoor stop
 *   /?demo=3  (or nearby)  …plus two "nearby now" options
 *   /?demo=4  (or focus)   …with the place detail card open
 *
 * Uses real catalog ids; candidates fall back gracefully if a place is
 * missing from the catalog.
 */

import { dubai, findPlace } from "@/lib/data";
import type { ActivityDef } from "@/lib/data/types";
import { travelMinutes, type LatLng } from "@/lib/concierge/geo";
import { useItineraryStore, type ScheduledActivity } from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import { DEMO_LINES } from "@/components/concierge/demoLines";

const STEP_ALIASES: Record<string, number> = {
  "1": 1, plan: 1,
  "2": 2, change: 2,
  "3": 3, nearby: 3,
  "4": 4, focus: 4, detail: 4,
};

export function demoStepFromQuery(search: string): number | null {
  const v = new URLSearchParams(search).get("demo");
  if (!v) return null;
  return STEP_ALIASES[v.toLowerCase()] ?? 1;
}

function pick(ids: string[], exclude: string[] = []): ActivityDef | null {
  for (const id of ids) {
    if (exclude.includes(id)) continue;
    const p = findPlace(id);
    if (p) return p;
  }
  return null;
}

function todayDubai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DOWNTOWN: LatLng =
  dubai.areas.find((a) => a.id === "downtown")?.coords ?? { lat: 25.1972, lng: 55.2744 };

function taxi(from: LatLng | undefined, p: ActivityDef, fallback: number): number {
  return from && p.coords ? travelMinutes(from, p.coords) : fallback;
}

function stop(
  p: ActivityDef,
  start_time: string,
  duration_min: number,
  reason: string,
  travel_min: number,
): Omit<ScheduledActivity, "id"> {
  return {
    catalog_id: p.id,
    title: p.name,
    start_time,
    duration_min,
    area_id: p.area_id,
    image: p.image,
    reason,
    travel_min,
  };
}

export function seedDemo(step: number) {
  const aquarium = pick(["act_dubai_mall_aquarium"]);
  const lunch = pick(["food_baker_friends", "food_ravi_restaurant"]);
  const museum = pick(["act_museum_of_the_future", "act_etihad_museum", "act_dubai_frame"]);
  const burj = pick(["act_burj_khalifa"]);
  const fountain = pick(["act_dubai_mall_fountain"]);
  const used = [aquarium, lunch, museum, burj, fountain].filter(Boolean).map((p) => p!.id);
  const indoorSwap = pick(
    ["act_kidzania", "act_play_dxb", "act_dubai_ice_rink", "act_green_planet", "act_difc_art"],
    used,
  );

  const acts: Array<Omit<ScheduledActivity, "id"> & { key: string }> = [];
  let prev: LatLng | undefined = DOWNTOWN;
  const add = (key: string, p: ActivityDef | null, t: string, d: number, why: string, fb: number) => {
    if (!p) return;
    acts.push({ key, ...stop(p, t, d, why, taxi(prev, p, fb)) });
    prev = p.coords ?? prev;
  };
  add("aquarium", aquarium, "10:00", 90,
    "Inside Dubai Mall and fully air-conditioned — the tunnel and shark tank hold both kids' attention.", 5);
  add("lunch", lunch, "12:00", 60,
    "Shaded lakeside tables facing the Burj, an easy kids' menu and no extra walking.", 0);
  const swapNow = step >= 2 && indoorSwap;
  if (swapNow) {
    add("swap", indoorSwap, "13:45", 120,
      "Indoors, hands-on and nothing like a museum — the younger one's pick.", 10);
  } else {
    add("museum", museum, "13:45", 90,
      "Hands-on exhibits pitched well for ages 8 and up, with lifts between floors.", 10);
  }
  add("burj", burj, "16:30", 90,
    "The lifts do the climbing — golden-hour views from the 124th floor.", 10);
  add("fountain", fountain, "18:30", 30,
    "Steps from the Burj exit; watch two shows back to back from the lakeside.", 0);

  const days = [
    {
      index: 0,
      date: todayDubai(),
      mode: "leisure" as const,
      fixed_events: [],
      activities: acts.map(({ key, ...a }) => ({ id: `demo-${key}`, ...a })),
    },
  ];

  const nearbyPicks = [
    pick(["act_reel_cinemas_dubai_mall", "act_dubai_ice_rink", "act_dubai_opera", "act_difc_art"], [...used, indoorSwap?.id ?? ""]),
  ];
  nearbyPicks.push(
    pick(
      ["act_dubai_dino", "act_dubai_mall_waterfall", "act_dubai_ice_rink", "food_ravi_restaurant", "act_cafe_bateel"],
      [...used, indoorSwap?.id ?? "", nearbyPicks[0]?.id ?? ""],
    ),
  );
  const nearbyReasons = [
    "Reclining seats, cool air and a family film — a proper rest without a long walk.",
    "A short buggy-friendly hop inside the mall that both kids will want to see.",
  ];
  const nearby =
    step >= 3
      ? nearbyPicks
          .filter((p): p is ActivityDef => !!p)
          .map((p, i) => ({
            place_id: p.id,
            travel_min: Math.max(5 + i * 5, Math.min(20, taxi(DOWNTOWN, p, 10 + i * 5))),
            reason: nearbyReasons[i] ?? p.blurb,
          }))
      : [];

  useItineraryStore.getState().hydrate({
    trip: {
      destination_id: "dubai",
      destination_name: "Dubai",
      start_date: days[0]!.date,
      end_date: days[0]!.date,
      travelers: 4,
      vibe: "family",
    },
    days,
    status: "draft",
    share_id: null,
    visit: {
      party: { adults: 2, children: [8, 12] },
      location: { label: "Downtown", coords: DOWNTOWN, area_id: "downtown" },
      interests: [],
      low_walking: true,
      indoor_only: step >= 2 ? true : undefined,
      avoid_tags: step >= 2 ? ["museum"] : [],
      time_window: { start: "10:00", end: "20:00" },
      notes: [],
    },
    changed_ids: step === 2 && swapNow ? ["demo-swap"] : [],
    nearby,
    focus_place_id: step >= 4 ? (nearby[0]?.place_id ?? null) : null,
  });

  // A matching transcript so the concierge column tells the same story.
  const voice = useVoiceStore.getState();
  voice.reset();
  const say = (i: number, reply: string) => {
    voice.appendUserTurn(`demo-u${i}`, DEMO_LINES[i]!.text);
    voice.appendAssistantDelta(`demo-a${i}`, reply);
    voice.finalizeAssistantTurn(`demo-a${i}`, reply);
  };
  say(0, "Here's an easy family day around Downtown — mostly indoors, short taxi hops, and the Burj Khalifa at golden hour.");
  if (step >= 2 && indoorSwap)
    say(1, `Done — I've swapped the museum for ${indoorSwap.name}. Everything else stays as it was.`);
  if (step >= 3 && nearby.length) {
    const a = findPlace(nearby[0]!.place_id)!;
    const b = nearby[1] ? findPlace(nearby[1].place_id) : null;
    say(2, `Two easy options close by: ${a.name}, about ${nearby[0]!.travel_min} minutes away${b ? `, or ${b.name}` : ""}.`);
  }
  if (step >= 4 && nearby.length) {
    const a = findPlace(nearby[0]!.place_id)!;
    say(
      3,
      nearby[0]!.travel_min <= 0
        ? `${a.name} is right here in Downtown — a short walk inside the mall, no taxi needed. I've opened the details with directions.`
        : `${a.name} is about ${nearby[0]!.travel_min} minutes by taxi from Downtown. I've opened the details with directions.`,
    );
  }
}
