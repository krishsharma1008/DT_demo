/**
 * Destination-aware gradient placeholders. Real photos arrive in a
 * Phase-11 polish pass; until then every card has a pretty,
 * destination-tinted gradient so the canvas never looks broken.
 *
 * The seed is a stable string (e.g. an activity id) so the same card always
 * renders the same gradient angle.
 */

import { getDestination } from "@/lib/data";

// Marhaba palette: night navy → brass → desert sand.
const FALLBACK = {
  primary: "#13233A",
  secondary: "#C49A4A",
  tertiary: "#E8D9BC",
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function paletteFor(destinationId: string | null | undefined) {
  if (!destinationId) return FALLBACK;
  const dest = getDestination(destinationId);
  const accent = dest?.color_accent ?? FALLBACK.secondary;
  // The primary navy stays constant for brand cohesion; accent shifts per
  // destination. Tertiary is the cream wash.
  return {
    primary: FALLBACK.primary,
    secondary: accent,
    tertiary: FALLBACK.tertiary,
  };
}

export function gradientStyle(opts: {
  destinationId?: string | null;
  seed?: string;
}): React.CSSProperties {
  const palette = paletteFor(opts.destinationId);
  const hash = opts.seed ? hashSeed(opts.seed) : 0;
  const angle = 110 + (hash % 60); // 110°–169°
  const stop = 35 + (hash % 25); // 35–59%
  return {
    backgroundImage: `linear-gradient(${angle}deg, ${palette.primary} 0%, ${palette.secondary} ${stop}%, ${palette.tertiary} 110%)`,
  };
}

/** Solid duo for hero blocks; less stochastic, more dramatic. */
export function heroGradientStyle(
  destinationId: string | null,
): React.CSSProperties {
  const palette = paletteFor(destinationId);
  return {
    backgroundImage: `radial-gradient(ellipse at 30% 20%, ${palette.secondary}, transparent 55%), radial-gradient(ellipse at 80% 90%, ${palette.primary}, transparent 60%), linear-gradient(180deg, ${palette.tertiary}, ${palette.tertiary})`,
  };
}
