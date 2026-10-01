import type { ActivityDef, AreaDef, DestinationDef } from "./types";
import { dubai as dubaiBase } from "./dubai";
import {
  areaCoords,
  enrichment,
  extraActivities,
  extraAreas,
  extraDayTemplates,
  extraFood,
} from "./dubai-extra";
import { travelMinutes } from "@/lib/concierge/geo";

/**
 * Destination registry. Dubai is the only destination: the hand-written base
 * catalog (dubai.ts) merged with the researched concierge extras
 * (dubai-extra.ts — coords, family fit, day trips around the UAE).
 */

function buildDubai(): DestinationDef {
  const enrich = (a: ActivityDef): ActivityDef => ({
    emirate: "dubai",
    ...a,
    ...(enrichment[a.id] ?? {}),
  });
  const areas: AreaDef[] = [
    ...dubaiBase.areas.map((a) => ({ ...a, coords: a.coords ?? areaCoords[a.id] })),
    ...extraAreas.filter((x) => !dubaiBase.areas.some((a) => a.id === x.id)),
  ];
  const seen = new Set<string>();
  const uniq = (xs: ActivityDef[]) =>
    xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  const activities = uniq([...dubaiBase.activities.map(enrich), ...extraActivities.map(enrich)]);
  const food = uniq([...dubaiBase.food.map(enrich), ...extraFood.map(enrich)]);

  // Hand-tuned matrix rows win; every other pair is derived from centroids.
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of areas) {
    matrix[a.id] = {};
    for (const b of areas) {
      const hand = dubaiBase.transit_time_matrix[a.id]?.[b.id];
      matrix[a.id]![b.id] =
        hand ?? (a.id === b.id ? 0 : a.coords && b.coords ? travelMinutes(a.coords, b.coords) : 60);
    }
  }

  const regions: Record<string, string[]> = {
    west: ["marina", "jbr", "palm", "al_barsha"],
    central: ["downtown", "old_dubai", "jumeirah", "creek_harbour", "al_quoz"],
  };
  for (const a of areas) {
    if (!Object.values(regions).some((ids) => ids.includes(a.id))) regions[a.id] = [a.id];
  }

  return {
    ...dubaiBase,
    areas,
    activities,
    food,
    transit_time_matrix: matrix,
    canonical_day_templates: [...dubaiBase.canonical_day_templates, ...extraDayTemplates],
    regions,
  };
}

export const dubai: DestinationDef = buildDubai();

const all: DestinationDef[] = [dubai];

/** Every visitable place (activities + food) in the catalog. */
export function allPlaces(): ActivityDef[] {
  return [...dubai.activities, ...dubai.food];
}

export function findPlace(id: string): ActivityDef | null {
  return allPlaces().find((p) => p.id === id) ?? null;
}

export function listDestinations(): {
  id: string;
  name: string;
  country: string;
  one_line_summary: string;
}[] {
  return all.map((d) => ({
    id: d.id,
    name: d.name,
    country: d.country,
    one_line_summary: d.one_line_summary,
  }));
}

export function getDestination(id: string): DestinationDef | null {
  return all.find((d) => d.id === id) ?? null;
}

// Day trips (Abu Dhabi, Sharjah, RAK…) live inside the Dubai catalog, so any
// UAE place name resolves to it rather than failing with "not found".
const UAE_ALIASES = ["dubai", "dxb", "uae", "emirates", "abu dhabi", "sharjah", "ras al khaimah", "rak", "hatta", "ajman", "fujairah"];

export function findDestinationByText(text: string): DestinationDef | null {
  const t = text.toLowerCase().trim();
  const direct = all.find(
    (d) => d.id === t || d.name.toLowerCase() === t || t.includes(d.id),
  );
  if (direct) return direct;
  return UAE_ALIASES.some((a) => t.includes(a)) ? dubai : null;
}

export type CatalogQuery = {
  destination: string;
  filter?: {
    type?: "stay" | "activity" | "food";
    tags?: string[];
    area_id?: string;
    work_friendly?: boolean;
    max_results?: number;
  };
};

export function queryCatalog(q: CatalogQuery) {
  const dest = findDestinationByText(q.destination);
  if (!dest) return { ok: false as const, error: "destination_not_found" };

  const max = q.filter?.max_results ?? 6;
  const tags = q.filter?.tags ?? [];
  const area = q.filter?.area_id;
  const wf = q.filter?.work_friendly;

  function tagMatch(t: string[]): boolean {
    if (tags.length === 0) return true;
    return tags.some((needle) =>
      t.map((s) => s.toLowerCase()).includes(needle.toLowerCase()),
    );
  }

  const out = {
    ok: true as const,
    destination_id: dest.id,
    stays: [] as DestinationDef["stays"],
    activities: [] as ActivityDef[],
    food: [] as ActivityDef[],
  };

  if (!q.filter?.type || q.filter.type === "stay") {
    out.stays = dest.stays
      .filter((s) => (area ? s.area_id === area : true))
      .filter((s) => (wf === undefined ? true : s.work_friendly === wf))
      .filter((s) => tagMatch(s.tags))
      .slice(0, max);
  }
  if (!q.filter?.type || q.filter.type === "activity") {
    out.activities = dest.activities
      .filter((a) => (area ? a.area_id === area : true))
      .filter((a) => tagMatch(a.tags))
      .slice(0, max);
  }
  if (!q.filter?.type || q.filter.type === "food") {
    out.food = dest.food
      .filter((f) => (area ? f.area_id === area : true))
      .filter((f) => tagMatch(f.tags))
      .slice(0, max);
  }
  return out;
}

// ── Ranking helpers (proactive suggestions) ───────────────────────────────

const TIER_ORDER: Record<string, number> = {
  backpack: 0,
  comfort: 1,
  premium: 2,
  luxury: 3,
};

/**
 * Rank up to 3 stays for proactive suggestion. Prioritise: tier match,
 * vibe-tag overlap, work_friendly match, and area filter. Returns each
 * stay with a short rationale the model can voice as-is.
 */
export function rankStays(
  dest: DestinationDef,
  filters: {
    vibe?: string;
    budget_tier?: "backpack" | "comfort" | "premium" | "luxury";
    work_friendly?: boolean;
    area_id?: string;
  },
): Array<{ stay: DestinationDef["stays"][number]; rationale: string; score: number }> {
  const target = filters.budget_tier
    ? TIER_ORDER[filters.budget_tier] ?? 1
    : null;
  const wantedVibe = filters.vibe?.toLowerCase();

  const scored = dest.stays
    .filter((s) => (filters.area_id ? s.area_id === filters.area_id : true))
    .map((s) => {
      let score = 0;
      const reasons: string[] = [];

      if (target !== null) {
        const diff = Math.abs((TIER_ORDER[s.tier] ?? 1) - target);
        score += 4 - diff; // exact match → 4, off by 3 → 1
        if (diff === 0) reasons.push(`${s.tier} tier`);
      }

      if (wantedVibe) {
        const tagSet = s.tags.map((t) => t.toLowerCase());
        const hit =
          tagSet.includes(wantedVibe) ||
          tagSet.some((t) => wantedVibe.includes(t) || t.includes(wantedVibe));
        if (hit) {
          score += 3;
          reasons.push(`matches your ${wantedVibe} vibe`);
        }
      }

      if (filters.work_friendly !== undefined) {
        if (s.work_friendly === filters.work_friendly) {
          score += 2;
          if (filters.work_friendly) reasons.push("work-friendly");
        } else {
          score -= 1;
        }
      }

      // Mild bias toward the destination's first canonical area when no
      // explicit filter is set, so the demo opening lands on a recognisable name.
      if (!filters.area_id && s.area_id === dest.areas[0]?.id) score += 0.5;

      const rationale =
        reasons.length === 0
          ? s.blurb.slice(0, 90)
          : `${reasons.join(", ")} — ${s.blurb.slice(0, 60)}`;

      return { stay: s, score, rationale };
    });

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Activities and food within `max_minutes` of `base_area_id` per the
 * destination's transit_time_matrix. Returns sorted by transit time.
 */
export function nearbyItems(
  dest: DestinationDef,
  args: { base_area_id: string; max_minutes: number; max: number },
): Array<{ item: ActivityDef; transit_min: number }> {
  const matrix = dest.transit_time_matrix[args.base_area_id] ?? {};
  const pool = [...dest.activities, ...dest.food];
  const out: Array<{ item: ActivityDef; transit_min: number }> = [];
  for (const item of pool) {
    const m =
      item.area_id === args.base_area_id
        ? 0
        : matrix[item.area_id] ?? Number.MAX_SAFE_INTEGER;
    if (m <= args.max_minutes) {
      out.push({ item, transit_min: m });
    }
  }
  return out.sort((a, b) => a.transit_min - b.transit_min).slice(0, args.max);
}

/**
 * Transport summary for a destination. Reads the optional `airport_transfer`
 * + `intracity_notes` fields from the destination definition; falls back to
 * generic copy when missing so the demo never breaks.
 */
export function getTransportNotes(dest: DestinationDef): {
  summary: string;
  airport_transfer: string;
  intracity: string;
} {
  const transfer =
    (dest as DestinationDef & { airport_transfer?: string }).airport_transfer ??
    `Pre-paid taxi from ${dest.airport_code} arrivals is the safest option for a first-time visitor.`;
  const intra =
    (dest as DestinationDef & { intracity_notes?: string }).intracity_notes ??
    `Move between areas in ${dest.name} via taxi or rideshare; check transit_time_matrix for typical durations.`;
  return {
    summary: `${dest.airport_code} → city: ${transfer.split(".")[0]}. Intra-city: ${intra.split(".")[0]}.`,
    airport_transfer: transfer,
    intracity: intra,
  };
}

/** Compact summary for injection into the system prompt. ≤180 tokens. */
export function destinationContextForPrompt(id: string): string | null {
  const d = getDestination(id);
  if (!d) return null;
  const areas = d.areas
    .map((a) => a.id)
    .join("; ");
  const seasonalLines =
    d.seasonal_warnings.length > 0
      ? d.seasonal_warnings
          .map((w) => w.message.split(";")[0]!.split(".")[0])
          .slice(0, 2)
          .join(" | ")
      : "no major seasonal blockers";
  const transitSample = (() => {
    const a = d.areas[0]?.id;
    const b = d.areas[d.areas.length - 1]?.id;
    if (!a || !b || a === b) return "";
    const min = d.transit_time_matrix[a]?.[b];
    return min ? `${a}↔${b} ≈${min}m` : "";
  })();
  return [
    `${d.name}, ${d.country} (${d.airport_code}). ${d.one_line_summary}`,
    `Areas: ${areas}.`,
    `Seasonal: ${seasonalLines}.`,
    transitSample ? `Transit sample: ${transitSample}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
