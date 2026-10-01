import Link from "next/link";
import { CalendarChip } from "@/components/calendar/CalendarChip";
import { SettingsSheet } from "./SettingsSheet";
import { ThemeToggle } from "./ThemeToggle";
import { ZapcomLogo } from "./ZapcomLogo";
import { PrototypeBadge } from "./PrototypeBadge";

export function TopNav() {
  return (
    <header className="print-hide sticky top-0 z-30 h-16 border-b border-line/80 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="Marhaba — Dubai AI Concierge, by Zapcom">
          <SunMark />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="font-display text-[26px] font-semibold leading-none tracking-tight text-ink">
              Marhaba
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">
              <span className="hidden sm:inline">Dubai AI Concierge</span>
              <span aria-hidden className="hidden sm:inline">·</span>
              <span>by</span>
              <span className="text-[color:var(--brand-zapcom)]">
                <ZapcomLogo height={13} />
              </span>
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PrototypeBadge className="max-[359px]:hidden" />
          <span className="hidden md:block">
            <CalendarChip />
          </span>
          <ThemeToggle />
          <SettingsSheet />
        </div>
      </div>
    </header>
  );
}

/** Small gold sun-and-horizon mark beside the wordmark. */
function SunMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className="hidden h-9 w-9 shrink-0 text-gold sm:block transition-transform duration-500 group-hover:rotate-[8deg]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <circle cx="16" cy="17" r="6.5" fill="currentColor" fillOpacity="0.18" />
      <path d="M16 4.5v3M6.8 8.3l2.1 2.1M25.2 8.3l-2.1 2.1M3.5 17h3M25.5 17h3" />
      <path d="M3 24.5h26M7 28h18" />
    </svg>
  );
}
