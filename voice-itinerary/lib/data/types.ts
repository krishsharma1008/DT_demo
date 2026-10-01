/**
 * Shared catalog types used by every destination. Schema follows PLAN §14.6.
 * Real-world fields like closed_days, seasonal, available_hours, transit_time_matrix
 * are what stop the demo from feeling like generic AI slop — the scheduler and the
 * model both read these fields to make the itinerary plausible.
 */

export type Weekday =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type TimeOfDay =
  | "morning"
  | "afternoon"
  | "evening"
  | "sunset"
  | "late_night";

export type Tier = "backpack" | "comfort" | "premium" | "luxury";
export type Intensity = "chill" | "moderate" | "active";
export type IndoorOutdoor = "indoor" | "outdoor" | "mixed";
export type Mobility = "high" | "moderate" | "low";

export type AreaDef = {
  id: string;
  name: string;
  vibe_tags: string[];
  description: string; // 25–35 word hand-written vibe statement
  /** Area centroid; drives distance-based transit when the matrix has no row. */
  coords?: { lat: number; lng: number };
};

export type StayDef = {
  id: string;
  name: string;
  area_id: string;
  tier: Tier;
  tags: string[];
  image: string; // path under /public/destinations/<dest>/
  blurb: string; // ~20 words, names a specific quality
  work_friendly: boolean;
  price_band: 1 | 2 | 3 | 4;
};

export type Hours = { open: string; close: string }; // "HH:mm" 24h

export type ActivityKind = "activity" | "food" | "experience";

export type CrowdLevel = { weekday: 1 | 2 | 3 | 4 | 5; weekend: 1 | 2 | 3 | 4 | 5 };

export type ActivityDef = {
  id: string;
  name: string;
  area_id: string;
  kind: ActivityKind;
  duration_min: { typical: number; min: number; max: number };
  best_time: TimeOfDay[];
  available_hours: Hours[]; // empty = "always"
  closed_days: Weekday[];
  seasonal?: { open_months: number[]; notes?: string };
  booking_required: boolean;
  intensity: Intensity;
  indoor_outdoor: IndoorOutdoor;
  rain_fallback: boolean;
  weather_sensitive: boolean;
  kid_friendly: boolean;
  mobility: Mobility;
  crowd_level: CrowdLevel;
  price_band: 1 | 2 | 3 | 4;
  tags: string[];
  image: string;
  blurb: string;
  pair_avoid?: string[]; // activity ids
  source_notes?: string; // human-written authentic detail
  // Food-specific (optional on non-food entries)
  cuisine?: string;
  signature_dish?: string;
  // Concierge fields — power "help me now", directions cards and family fit.
  coords?: { lat: number; lng: number };
  address?: string;
  website?: string; // official site only
  /** Youngest age the place genuinely works for; 0 = all ages. */
  min_age?: number;
  /** How much walking a visit involves, independent of getting there. */
  walking?: "minimal" | "some" | "lots";
  /** Emirate / region for day trips outside Dubai city. */
  emirate?: "dubai" | "abu_dhabi" | "sharjah" | "ras_al_khaimah" | "ajman" | "fujairah" | "umm_al_quwain";
  /** One-line, visitor-facing description for the detail card. */
  details?: string;
  image_credit?: string;
};

export type DayTemplateSlot = {
  time: string; // "HH:mm"
  activity_id?: string;
  food_id?: string;
  notes?: string;
};

export type DayTemplate = {
  id: string;
  title: string;
  mood: "chill" | "work" | "adventure" | "cultural" | "foodie" | "family";
  slots: DayTemplateSlot[];
};

export type SeasonalWarning = {
  months: number[]; // 1..12
  level: "info" | "warn" | "blocker";
  message: string;
};

export type DestinationDef = {
  id: string;
  name: string;
  country: string;
  airport_code: string;
  hero_images: string[];
  color_accent: string;
  one_line_summary: string;
  weather_window: { best_months: number[]; notes?: string };
  seasonal_warnings: SeasonalWarning[];
  areas: AreaDef[];
  stays: StayDef[];
  activities: ActivityDef[];
  food: ActivityDef[]; // share shape; food has cuisine/signature_dish populated
  transit_time_matrix: Record<string, Record<string, number>>; // minutes
  canonical_day_templates: DayTemplate[];
  /** Hand-written airport-to-city transfer copy. Voiced by get_transport_info. */
  airport_transfer?: string;
  /** Hand-written intra-city movement copy (rideshare, metro, walkability). */
  intracity_notes?: string;
  /**
   * Logical regions that group nearby `area` ids. The scheduler uses this to
   * HARD-EXCLUDE templates whose primary area is in a different region from
   * the user's stay (e.g., Anjuna stay → no Palolem template). When omitted,
   * region locking is skipped and the scheduler falls back to soft scoring.
   */
  regions?: Record<string, string[]>;
};
