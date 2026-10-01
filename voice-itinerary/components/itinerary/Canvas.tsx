"use client";

import { useItineraryStore } from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";
import { MobileDock } from "@/components/concierge/MobileDock";
import { MemoryStrip } from "@/components/concierge/MemoryStrip";
import { NearbyPanel } from "@/components/concierge/NearbyPanel";
import { PlaceSheet } from "@/components/concierge/PlaceSheet";
import { DemoSeeder } from "@/components/concierge/DemoSeeder";
import { ChangeToast } from "@/components/concierge/ChangeToast";
import { PlanSkeleton } from "@/components/concierge/PlanSkeleton";
import { DayPlan } from "./DayPlan";
import { EmptyState } from "./EmptyState";
import { Announcer } from "./Announcer";

/**
 * Home: concierge column (left, desktop) + "Your day in Dubai" (right).
 * On mobile it collapses to one column with the orb and text input docked
 * at the bottom.
 */
export function Canvas() {
  const status = useItineraryStore((s) => s.status);
  const days = useItineraryStore((s) => s.days);
  const nearbyCount = useItineraryStore((s) => s.nearby.length);
  const hasTurns = useVoiceStore((s) => s.transcript.length > 0);
  const voiceState = useVoiceStore((s) => s.state);

  const hasPlan = status !== "empty" && days.length > 0;
  const hasContent = hasPlan || nearbyCount > 0;
  // A request is in flight but nothing is on the canvas yet.
  const planning = !hasContent && hasTurns && voiceState !== "idle" && voiceState !== "disconnected";

  return (
    <div className="flex flex-1">
      <aside
        aria-label="Concierge"
        className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[400px] shrink-0 border-r border-line bg-panel/80 lg:block xl:w-[440px]"
      >
        <ConciergePanel showSuggestions={hasContent && !hasTurns} />
      </aside>

      <div className="min-w-0 flex-1 px-4 pb-[calc(170px+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8 xl:px-14">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
          <MemoryStrip className="lg:hidden" />
          {hasContent ? (
            <>
              <NearbyPanel />
              {hasPlan && <DayPlan />}
            </>
          ) : planning ? (
            <PlanSkeleton />
          ) : (
            <EmptyState />
          )}
          <Footer />
        </div>
      </div>

      <MobileDock />
      <PlaceSheet />
      <ChangeToast />
      <DemoSeeder />
      <Announcer />
    </div>
  );
}

function Footer() {
  return (
    <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-muted">
      Marhaba is an illustrative prototype by Zapcom. Suggestions are indicative —
      check opening hours and bookings with each venue.
    </p>
  );
}
