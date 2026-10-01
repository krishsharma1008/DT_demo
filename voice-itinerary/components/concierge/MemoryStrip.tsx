"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Ban,
  Building2,
  Clock3,
  Footprints,
  Heart,
  LocateFixed,
  NotebookPen,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useItineraryStore, type Visit } from "@/lib/store/itinerary";

type Chip = { key: string; Icon: LucideIcon; label: string; strong?: boolean };

function partyLabel(p: NonNullable<Visit["party"]>): string {
  const adults = `${p.adults} adult${p.adults === 1 ? "" : "s"}`;
  if (p.children.length === 0) return adults;
  const ages = [...p.children].sort((a, b) => a - b);
  const kids =
    ages.length === 1
      ? `1 child (${ages[0]})`
      : `${ages.length} children (${ages.slice(0, -1).join(", ")} & ${ages[ages.length - 1]})`;
  return `${adults} · ${kids}`;
}

const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function visitChips(v: Visit): Chip[] {
  const chips: Chip[] = [];
  if (v.location?.label)
    chips.push({ key: "loc", Icon: LocateFixed, label: `You are here · ${v.location.label}`, strong: true });
  if (v.party) chips.push({ key: "party", Icon: Users, label: partyLabel(v.party) });
  if (v.time_window)
    chips.push({ key: "time", Icon: Clock3, label: `Free ${v.time_window.start}–${v.time_window.end}` });
  if (v.low_walking) chips.push({ key: "walk", Icon: Footprints, label: "Minimal walking" });
  if (v.indoor_only) chips.push({ key: "indoor", Icon: Building2, label: "Indoor only" });
  for (const t of v.avoid_tags) chips.push({ key: `avoid-${t}`, Icon: Ban, label: `No ${t.replace(/[_-]+/g, " ")}${t.endsWith("s") ? "" : "s"}` });
  for (const t of v.interests) chips.push({ key: `int-${t}`, Icon: Heart, label: pretty(t) });
  for (const [i, n] of v.notes.entries()) chips.push({ key: `note-${i}`, Icon: StickyNote, label: n });
  return chips;
}

/** "What I know" — the concierge's visible session memory. */
export function MemoryStrip({ className = "" }: { className?: string }) {
  const visit = useItineraryStore((s) => s.visit);
  const reduce = useReducedMotion();
  const chips = visitChips(visit);

  return (
    <section aria-label="What I know" className={className}>
      <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
        <NotebookPen className="h-3 w-3 text-gold-ink" />
        What I know
      </h2>
      {chips.length === 0 ? (
        <p className="text-[13px] leading-snug text-ink-muted">
          I&apos;ll remember who you&apos;re with, where you are and what you&apos;d
          rather avoid — so you never have to repeat yourself.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {chips.map(({ key, Icon, label, strong }) => (
              <motion.li
                key={key}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                  strong
                    ? "border-teal/40 bg-[color:var(--teal-soft)] text-teal"
                    : "border-line bg-card text-ink-soft"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{label}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
