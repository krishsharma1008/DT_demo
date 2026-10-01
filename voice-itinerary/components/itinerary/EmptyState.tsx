"use client";

import { Mic, Keyboard, MapPinned } from "lucide-react";
import { Skyline } from "@/components/brand/Skyline";
import { SuggestionCards } from "@/components/concierge/Suggestions";

/** First-run hero: who we are, what to try. */
export function EmptyState() {
  return (
    <section className="relative flex flex-1 flex-col">
      <div
        className="relative overflow-hidden rounded-[32px] border border-line px-5 pb-0 pt-8 sm:px-10 sm:pt-12"
        style={{ backgroundImage: "var(--hero-wash)" }}
      >
        <span aria-hidden className="hero-glow" />
        <p className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-ink">
          <span aria-hidden className="h-px w-8 bg-gold" />
          Marhaba · <span lang="ar" className="font-display text-[15px] normal-case tracking-normal">مرحبا</span>
        </p>
        <h1 className="max-w-3xl font-display text-[44px] font-semibold leading-[0.98] tracking-tight text-ink sm:text-[64px] xl:text-[76px]">
          Your personal
          <br />
          <span className="italic text-gold-ink">Dubai</span> concierge
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-soft sm:text-[18px]">
          Tell me who you&apos;re with and where you are. I&apos;ll plan a day that
          fits, change any part of it as you go, and point you to what&apos;s close
          when you need a break.
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-ink-soft">
          <li className="inline-flex items-center gap-1.5">
            <Mic className="h-4 w-4 text-gold-ink" /> Speak in English
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Keyboard className="h-4 w-4 text-gold-ink" /> Or type
          </li>
          <li className="inline-flex items-center gap-1.5">
            <MapPinned className="h-4 w-4 text-gold-ink" /> Directions included
          </li>
        </ul>

        <Skyline animate className="mt-6 block h-auto w-full sm:mt-4" strokeWidth={1.2} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          Try the journey — tap a line to send it
        </h2>
        <SuggestionCards />
      </div>
    </section>
  );
}
