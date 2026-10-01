"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarCheck, RefreshCw } from "lucide-react";
import { useItineraryStore, type ItineraryDay } from "@/lib/store/itinerary";

type Toast = { id: number; kind: "swap" | "add" | "plan"; from?: string; to: string };

/** Announces itinerary changes: "Swapped X → Y", "Added X", "Your day is ready". */
export function ChangeToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const reduce = useReducedMotion();
  const prevDays = useRef<ItineraryDay[]>(useItineraryStore.getState().days);
  const seq = useRef(0);

  useEffect(() => {
    return useItineraryStore.subscribe((s, prev) => {
      const before = prevDays.current;
      prevDays.current = s.days;
      if (s.changed_ids === prev.changed_ids || s.changed_ids.length === 0) return;
      const all = s.days.flatMap((d) => d.activities);
      const changed = all.filter((a) => s.changed_ids.includes(a.id));
      if (changed.length === 0) return;
      const day = s.days.find((d) => d.activities.some((a) => a.id === changed[0]!.id));
      const prevDay = before.find((d) => d.index === day?.index);
      let next: Omit<Toast, "id">;
      if (day && changed.length >= day.activities.length && day.activities.length > 1) {
        next = { kind: "plan", to: `Your day is ready — ${day.activities.length} stops` };
      } else {
        const keep = new Set(day?.activities.map((a) => a.id));
        const removed = prevDay?.activities.find((a) => !keep.has(a.id));
        next = removed
          ? { kind: "swap", from: removed.title, to: changed[0]!.title }
          : { kind: "add", to: changed[0]!.title };
      }
      seq.current += 1;
      setToast({ id: seq.current, ...next });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[45] flex justify-center px-4 lg:left-[400px] xl:left-[440px]"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-gold/60 bg-[rgba(19,35,58,0.94)] py-2 pl-2 pr-4 text-[13px] text-[#f6efe2] shadow-[var(--shadow-lift)] backdrop-blur"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold text-on-gold">
              {toast.kind === "plan" ? <CalendarCheck className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </span>
            {toast.kind === "swap" ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[#d9b26a]">Swapped</span>
                <span className="truncate line-through decoration-[#d9b26a]/70 opacity-70">{toast.from}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#d9b26a]" />
                <span className="truncate font-semibold">{toast.to}</span>
              </span>
            ) : toast.kind === "add" ? (
              <span className="truncate">
                <span className="text-[#d9b26a]">Added</span> <span className="font-semibold">{toast.to}</span>
              </span>
            ) : (
              <span className="truncate font-semibold">{toast.to}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
