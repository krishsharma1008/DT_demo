"use client";

import { useVoiceStore } from "@/lib/store/voice";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { TranscriptStream } from "@/components/voice/TranscriptStream";
import { Skyline } from "@/components/brand/Skyline";
import { MemoryStrip } from "./MemoryStrip";
import { TextComposer } from "./TextComposer";
import { NextStepChip, SuggestionCards } from "./Suggestions";

/**
 * Desktop concierge column: the sun orb, live transcript, "What I know"
 * memory and the text composer.
 */
export function ConciergePanel({ showSuggestions }: { showSuggestions: boolean }) {
  const hasTurns = useVoiceStore((s) => s.transcript.length > 0);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div aria-hidden className="mashrabiya pointer-events-none absolute inset-0 opacity-70" />

      <div className="relative flex shrink-0 flex-col items-center px-6 pb-4 pt-10">
        <VoiceOrb size={156} />
        <Skyline className="mt-5 h-7 w-full max-w-[300px] opacity-70" strokeWidth={1} />
      </div>

      <div className="relative shrink-0 border-y border-line/80 bg-card/40 px-6 py-4">
        <MemoryStrip />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pt-4">
        {hasTurns ? (
          <TranscriptStream className="min-h-0 flex-1 pb-3 pr-1" />
        ) : showSuggestions ? (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
              Try saying
            </p>
            <SuggestionCards layout="list" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-4 text-center">
            <p className="font-display text-[22px] italic leading-snug text-ink-soft">
              &ldquo;Good morning. Where are you,
              <br /> and who is with you today?&rdquo;
            </p>
          </div>
        )}
      </div>

      <div className="relative shrink-0 space-y-2 px-5 pb-5 pt-2">
        <NextStepChip />
        <TextComposer />
      </div>
    </div>
  );
}
