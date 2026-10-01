"use client";

import { useState } from "react";
import {
  Building2,
  Coffee,
  Compass,
  Fish,
  Landmark,
  Moon,
  Mountain,
  Music,
  Palette,
  Ship,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Sunset,
  Tent,
  TreePalm,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Skyline } from "@/components/brand/Skyline";

type Kind = "activity" | "food" | "experience" | "stay";

const ICON_BY_TAG: Array<{ tag: string; Icon: LucideIcon }> = [
  { tag: "aquarium", Icon: Fish },
  { tag: "marine", Icon: Fish },
  { tag: "snow", Icon: Snowflake },
  { tag: "ski", Icon: Snowflake },
  { tag: "fountain", Icon: Waves },
  { tag: "cinema", Icon: Sparkles },
  { tag: "burj", Icon: Building2 },
  { tag: "ice", Icon: Snowflake },
  { tag: "desert", Icon: Tent },
  { tag: "dhow", Icon: Ship },
  { tag: "cruise", Icon: Ship },
  { tag: "abra", Icon: Ship },
  { tag: "museum", Icon: Landmark },
  { tag: "heritage", Icon: Landmark },
  { tag: "cultural", Icon: Landmark },
  { tag: "mosque", Icon: Moon },
  { tag: "souk", Icon: ShoppingBag },
  { tag: "shopping", Icon: ShoppingBag },
  { tag: "mall", Icon: ShoppingBag },
  { tag: "art", Icon: Palette },
  { tag: "view", Icon: Building2 },
  { tag: "skyline", Icon: Building2 },
  { tag: "beach", Icon: TreePalm },
  { tag: "waterpark", Icon: Waves },
  { tag: "ocean", Icon: Waves },
  { tag: "sunset", Icon: Sunset },
  { tag: "hike", Icon: Mountain },
  { tag: "music", Icon: Music },
  { tag: "brunch", Icon: Coffee },
  { tag: "coffee", Icon: Coffee },
  { tag: "iconic", Icon: Sparkles },
];

function pickIcon(kind: Kind, tags: string[] | undefined, name = ""): LucideIcon {
  if (kind === "food") return UtensilsCrossed;
  const n = name.toLowerCase();
  for (const { tag, Icon } of ICON_BY_TAG) {
    if (n.includes(tag)) return Icon;
  }
  if (tags) {
    for (const { tag, Icon } of ICON_BY_TAG) {
      if (tags.some((t) => t.toLowerCase().includes(tag))) return Icon;
    }
  }
  if (kind === "stay") return Building2;
  return Compass;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Four Dubai "moods" for the illustrated fallback: dusk, desert, gulf, night.
const MOODS = [
  "linear-gradient(165deg, #1a2b45 0%, #4a4258 48%, #c49a4a 100%)",
  "linear-gradient(170deg, #f4e6c8 0%, #d8b475 52%, #9c6a2a 100%)",
  "linear-gradient(160deg, #0f3a46 0%, #1e7c7a 55%, #d9c79f 120%)",
  "radial-gradient(ellipse at 72% 18%, #d9b26a 0%, rgba(217,178,106,0) 45%), linear-gradient(180deg, #13233a 0%, #0a1220 100%)",
];

export function imageSrc(destinationId: string | null | undefined, image?: string): string | null {
  if (!image) return null;
  if (image.startsWith("/") || image.startsWith("http")) return image;
  return `/destinations/${destinationId ?? "dubai"}/${image}`;
}

/**
 * Place photo with an intentional, illustrated fallback (gradient mood +
 * mashrabiya lattice + skyline + icon) for places without a photo yet.
 * Photos live at public/destinations/<destination>/<image>.
 */
export function ActivityImage({
  destinationId,
  seed,
  kind = "activity",
  tags,
  image,
  alt = "",
  size = "sm",
  className = "",
}: {
  destinationId: string | null | undefined;
  seed: string;
  kind?: Kind;
  tags?: string[];
  image?: string;
  alt?: string;
  size?: "sm" | "md" | "lg" | "fill";
  className?: string;
}) {
  const src = imageSrc(destinationId, image);
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src && failed !== src;

  const Icon = pickIcon(kind, tags, alt);
  const dim =
    size === "sm"
      ? "h-12 w-12 rounded-xl"
      : size === "md"
        ? "h-20 w-20 rounded-2xl"
        : size === "lg"
          ? "h-32 w-full rounded-2xl"
          : "absolute inset-0 h-full w-full";
  const big = size === "lg" || size === "fill";
  const mood = MOODS[hashSeed(seed) % MOODS.length]!;
  const lightMood = mood.startsWith("linear-gradient(170deg");

  return (
    <span
      role={showPhoto ? undefined : "img"}
      aria-label={showPhoto ? undefined : alt || undefined}
      aria-hidden={showPhoto || !alt ? true : undefined}
      className={`relative grid shrink-0 place-items-center overflow-hidden ${dim} ${className}`}
      style={{ backgroundImage: mood }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <span
            aria-hidden
            className="mashrabiya absolute inset-0"
            style={{ backgroundColor: lightMood ? "rgba(90,60,20,0.16)" : "rgba(255,240,210,0.12)" }}
          />
          {big && (
            <Skyline
              className="absolute inset-x-0 bottom-0 h-[38%] w-full opacity-60"
              color={lightMood ? "rgba(70,45,15,0.55)" : "rgba(246,226,184,0.7)"}
              strokeWidth={1}
            />
          )}
          <span
            className={`relative grid place-items-center rounded-full border ${
              lightMood ? "border-[#5a3c14]/30 text-[#4a3010]" : "border-[#f6e2b8]/40 text-[#f8ecd2]"
            } ${big ? "h-14 w-14" : size === "md" ? "h-11 w-11" : "h-8 w-8"} ${big ? "-mt-6" : ""}`}
          >
            <Icon
              className={big ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4"}
              strokeWidth={1.4}
            />
          </span>
        </>
      )}
    </span>
  );
}
