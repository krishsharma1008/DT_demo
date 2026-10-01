"use client";

import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { TranscriptStream } from "@/components/voice/TranscriptStream";
import { useVoiceSession } from "@/components/voice/VoiceSessionProvider";
import { TextComposer } from "./TextComposer";
import { NextStepChip } from "./Suggestions";

/** Mobile: orb + text input docked at the bottom, latest turns above. */
export function MobileDock() {
  const { hint } = useVoiceSession();
  return (
    <div className="print-hide fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-20px_rgba(19,35,58,0.35)] backdrop-blur-md lg:hidden">
      <TranscriptStream compact className="mb-2" />
      {hint && <p className="mb-2 text-center text-[11px] text-[color:var(--color-danger)]">{hint}</p>}
      <NextStepChip className="mb-2" />
      <div className="flex items-center gap-3">
        <VoiceOrb variant="dock" />
        <TextComposer className="min-w-0 flex-1" showMic={false} />
      </div>
    </div>
  );
}
