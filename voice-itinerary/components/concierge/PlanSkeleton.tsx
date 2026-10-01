"use client";

import { Sparkles } from "lucide-react";

/** Shimmering placeholder timeline while the concierge drafts the day. */
export function PlanSkeleton() {
  return (
    <section aria-label="Planning your day" aria-busy="true" className="flex flex-col gap-5">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-ink">
          <Sparkles className="h-3.5 w-3.5 motion-safe:animate-pulse" />
          Planning your day…
        </p>
        <div className="shimmer mt-2 h-11 w-72 max-w-full rounded-xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[50px_1fr] gap-x-6 sm:grid-cols-[72px_1fr] sm:gap-x-8">
          <div className="shimmer mt-4 h-6 w-12 justify-self-end rounded-md" />
          <div className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-card sm:flex-row">
            <div className="shimmer aspect-[16/9] w-full sm:aspect-auto sm:h-36 sm:w-[190px]" />
            <div className="flex flex-1 flex-col gap-2.5 p-5">
              <div className="shimmer h-3 w-24 rounded" />
              <div className="shimmer h-6 w-3/4 rounded-md" />
              <div className="shimmer h-3 w-full rounded" />
              <div className="shimmer h-3 w-2/3 rounded" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
