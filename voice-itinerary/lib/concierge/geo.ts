/**
 * Geography helpers for the concierge: straight-line distance, a taxi-time
 * estimate tuned for Dubai roads, and Google Maps links. Pure functions —
 * safe to import from data modules and tests.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Door-to-door taxi minutes. Road distance ≈ 1.3× straight line; the first
 * 15 road-km crawl at city speed (~30 km/h), the rest is highway (~100 km/h),
 * plus ~5 minutes to get a car and get out. Downtown → Museum of the Future
 * ≈ 12 min, Downtown → Marina ≈ 30 min, Downtown → Abu Dhabi ≈ 1h50.
 */
export function travelMinutes(a: LatLng, b: LatLng): number {
  const road = distanceKm(a, b) * 1.3;
  if (road < 0.4) return 0; // same building / same mall
  const city = Math.min(road, 15);
  const highway = Math.max(0, road - 15);
  const mins = (city / 30) * 60 + (highway / 100) * 60 + 5;
  return Math.round(mins / 5) * 5 || 5;
}

/** Walking minutes for short hops (~4.5 km/h, 1.25 detour factor). */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.round(((distanceKm(a, b) * 1.25) / 4.5) * 60);
}

export function directionsUrl(dest: LatLng, from?: LatLng): string {
  const params = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lng}` });
  if (from) params.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function mapSearchUrl(name: string, coords?: LatLng): string {
  const q = coords ? `${name} @${coords.lat},${coords.lng}` : `${name}, Dubai`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
