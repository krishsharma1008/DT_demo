"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, X, RotateCcw, Mic2 } from "lucide-react";
import { useItineraryStore } from "@/lib/store/itinerary";

type CalendarHealth = {
  bridge?: "up" | "down";
  signed_in?: boolean;
  source_mode?: string;
};

/**
 * The TopNav settings button drives this sheet. Surfaces the three things
 * a demo viewer most often wants to know: what voice + language are wired,
 * the calendar source, and a reset button so they can replay the demo
 * without reloading. Closes on outside click or Escape.
 */
export function SettingsSheet() {
  const [open, setOpen] = useState(false);
  const [calendar, setCalendar] = useState<CalendarHealth | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const reset = useItineraryStore((s) => s.reset);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch("/api/calendar/health", { cache: "no-store" });
        const data = (await res.json()) as CalendarHealth;
        if (!cancel) setCalendar(data);
      } catch {
        if (!cancel) setCalendar({ bridge: "down", source_mode: "off" });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        sheetRef.current &&
        e.target instanceof Node &&
        !sheetRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    // Defer click handler one tick so the button click that opens the sheet
    // doesn't immediately close it.
    const id = window.setTimeout(
      () => window.addEventListener("mousedown", onClick),
      0,
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.clearTimeout(id);
    };
  }, [open]);

  const calendarMode =
    process.env.NEXT_PUBLIC_CALENDAR_MODE ?? calendar?.source_mode ?? "off";
  const calendarStatus =
    calendar?.bridge === "up"
      ? calendar.signed_in
        ? "live (browser-use signed in)"
        : "live (run pnpm calendar:setup)"
      : calendarMode === "mock"
        ? "mock fixture"
        : "off";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        className="rounded-full p-2 text-[color:var(--color-navy-900)]/60 transition-colors hover:bg-sunk hover:text-[color:var(--color-navy-900)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-navy-700)]/40"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={sheetRef}
          className="absolute right-0 top-12 z-50 w-[300px] overflow-hidden rounded-2xl border border-[color:var(--color-cream-200)] bg-card shadow-[var(--shadow-soft)] backdrop-blur"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--color-cream-200)]/70 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-navy-900)]">
              Marhaba · settings
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="rounded-full p-1 text-[color:var(--color-ink-400)] transition-colors hover:bg-[color:var(--color-cream-100)] hover:text-[color:var(--color-navy-900)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 px-4 py-3 text-xs">
            <Row label="model" value="gpt-realtime" />
            <Row label="voice" value="marin (warm)" />
            <Row label="language" value="English" />
            <Row label="calendar" value={`${calendarMode} · ${calendarStatus}`} />
            <Row label="turn det." value="semantic VAD" />
            <Row label="reduced motion" value="follows OS preference" />
          </dl>

          <div className="border-t border-[color:var(--color-cream-200)]/70 px-3 py-3">
            <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-400)]">
              actions
            </p>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-[color:var(--color-navy-900)] transition-colors hover:bg-[color:var(--color-cream-100)]"
            >
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                Start a new conversation
              </span>
            </button>
            <a
              href="/"
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-[color:var(--color-navy-900)] transition-colors hover:bg-[color:var(--color-cream-100)]"
            >
              <span className="inline-flex items-center gap-2">
                <Mic2 className="h-3.5 w-3.5" />
                Back to the orb
              </span>
            </a>
          </div>

          <p className="border-t border-[color:var(--color-cream-200)]/70 px-4 py-2 text-[10px] text-[color:var(--color-ink-400)]">
            Marhaba — Dubai AI Concierge by Zapcom · illustrative prototype
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-400)]">
        {label}
      </dt>
      <dd className="text-[color:var(--color-navy-900)]">{value}</dd>
    </>
  );
}
