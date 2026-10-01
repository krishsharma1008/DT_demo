/**
 * Hand-curated mock flight catalog.
 *
 * The realtime model used to offer to "search for flights" with no backing
 * tool, which made the demo feel hollow. This module is the backing data
 * for the `search_flights` tool: a small set of plausible routes from
 * common origins (BOM, DEL, BLR, JFK, LHR, LAX, SIN, DXB) into each of
 * Dubai International (DXB).
 *
 * These are NOT real bookings — pricing and times are indicative only.
 * The model voices a couple of options and, when the user picks one,
 * lands the choice on the canvas via add_fixed_event(type:'flight').
 */

export type MockFlight = {
  airline: string;
  flight_no: string;
  from: string; // IATA airport code
  to: string;
  /** Local departure time at origin, "HH:mm" 24h. */
  depart: string;
  /** Local arrival time at destination, "HH:mm". May be next-day if `arrives_next_day`. */
  arrive: string;
  arrives_next_day?: boolean;
  duration_min: number;
  stops: 0 | 1;
  /** Indicative round-trip-equivalent USD price. */
  price_usd: number;
  cabin: "economy" | "premium" | "business";
};

const FLIGHTS: MockFlight[] = [
  // ── Dubai (DXB) ────────────────────────────────────────────────────────
  { airline: "Emirates",    flight_no: "EK-204",  from: "JFK", to: "DXB", depart: "23:00", arrive: "19:35", arrives_next_day: true, duration_min: 755, stops: 0, price_usd: 882, cabin: "economy" },
  { airline: "Emirates",    flight_no: "EK-242",  from: "LAX", to: "DXB", depart: "16:30", arrive: "19:30", arrives_next_day: true, duration_min: 960, stops: 0, price_usd: 1224, cabin: "economy" },
  { airline: "British Airways", flight_no: "BA-107", from: "LHR", to: "DXB", depart: "21:45", arrive: "08:20", arrives_next_day: true, duration_min: 405, stops: 0, price_usd: 488, cabin: "economy" },
  { airline: "Emirates",    flight_no: "EK-501",  from: "BOM", to: "DXB", depart: "04:45", arrive: "06:35", duration_min: 200, stops: 0, price_usd: 218, cabin: "economy" },
  { airline: "IndiGo",      flight_no: "6E-1407", from: "DEL", to: "DXB", depart: "04:20", arrive: "06:55", duration_min: 215, stops: 0, price_usd: 196, cabin: "economy" },
  { airline: "Emirates",    flight_no: "EK-569",  from: "BLR", to: "DXB", depart: "10:05", arrive: "12:50", duration_min: 255, stops: 0, price_usd: 204, cabin: "economy" },
  { airline: "Air India Express", flight_no: "IX-813", from: "BOM", to: "DXB", depart: "13:40", arrive: "15:25", duration_min: 195, stops: 0, price_usd: 162, cabin: "economy" },
  { airline: "Emirates",    flight_no: "EK-2",    from: "LHR", to: "DXB", depart: "14:15", arrive: "00:40", arrives_next_day: true, duration_min: 415, stops: 0, price_usd: 612, cabin: "economy" },
  { airline: "Singapore Airlines", flight_no: "SQ-490", from: "SIN", to: "DXB", depart: "21:25", arrive: "00:45", arrives_next_day: true, duration_min: 440, stops: 0, price_usd: 612, cabin: "economy" },
];

/** IATA airport code → destination id in /lib/data. */
const AIRPORT_TO_DESTINATION: Record<string, string> = {
  DXB: "dubai",
};

const KNOWN_ORIGINS = [
  "BOM",
  "DEL",
  "BLR",
  "JFK",
  "LHR",
  "LAX",
  "SIN",
  "DXB",
];

/**
 * Look up flights between an origin and a destination airport. Returns at
 * most `max` results sorted by total duration (shortest first), with a
 * gentle preference for non-stop. Soft fallbacks:
 *   • If `from` isn't in the curated origin set, fall back to a sensible hub (BOM)
 *     or LHR (for everything else) so the model still has something.
 *   • If `to` doesn't match any catalog destination, return ok:false so the
 *     model can pivot aloud.
 */
export function searchFlights(args: {
  from: string;
  to: string;
  max?: number;
}):
  | { ok: true; from: string; to: string; destination_id: string; flights: MockFlight[] }
  | { ok: false; error: string; supported_origins: string[]; supported_destinations: string[] } {
  const max = Math.max(1, Math.min(args.max ?? 4, 6));
  const to = args.to.toUpperCase();
  const destinationId = AIRPORT_TO_DESTINATION[to];
  if (!destinationId) {
    return {
      ok: false,
      error: "destination_airport_not_supported",
      supported_origins: KNOWN_ORIGINS,
      supported_destinations: Object.keys(AIRPORT_TO_DESTINATION),
    };
  }
  const requestedFrom = args.from.toUpperCase();
  const fallbackFrom =
    to === "DXB" ? "BOM" : "LHR";
  const from = KNOWN_ORIGINS.includes(requestedFrom)
    ? requestedFrom
    : fallbackFrom;

  const candidates = FLIGHTS.filter((f) => f.from === from && f.to === to);
  if (candidates.length === 0) {
    // No curated direct route; widen to any flight into `to`.
    const widened = FLIGHTS.filter((f) => f.to === to)
      .slice()
      .sort((a, b) => a.stops - b.stops || a.duration_min - b.duration_min)
      .slice(0, max);
    return {
      ok: true,
      from,
      to,
      destination_id: destinationId,
      flights: widened,
    };
  }

  const sorted = candidates
    .slice()
    .sort((a, b) => a.stops - b.stops || a.duration_min - b.duration_min)
    .slice(0, max);
  return { ok: true, from, to, destination_id: destinationId, flights: sorted };
}
