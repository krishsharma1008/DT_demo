"use client";

import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Printer,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useItineraryStore } from "@/lib/store/itinerary";

/**
 * Visible only when the trip is finalized OR has been started. Lets the user
 * (1) finalize on demand, (2) copy the share URL, (3) reset the canvas to
 * start over. Voice editing keeps working on /trip/[id] either way.
 */
export function ShareBar() {
  const status = useItineraryStore((s) => s.status);
  const share_id = useItineraryStore((s) => s.share_id);
  const finalize = useItineraryStore((s) => s.finalize);
  const reset = useItineraryStore((s) => s.reset);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!share_id || typeof window === "undefined") {
      setShareUrl(null);
      return;
    }
    setShareUrl(`${window.location.origin}/trip/${share_id}`);
  }, [share_id]);

  // Persist the trip JSON to /api/share whenever it changes after finalize.
  useEffect(() => {
    if (status !== "finalized" || !share_id) return;
    const payload = useItineraryStore.getState();
    void fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        share_id,
        payload: {
          trip: payload.trip,
          days: payload.days,
          stay: payload.stay,
          preferences: payload.preferences,
          parking_lot: payload.parking_lot,
          status: payload.status,
        },
      }),
    });
  }, [status, share_id]);

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  if (status === "empty") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <button
          type="button"
          onClick={() => {
            const id = finalize();
            // Eager save so the share URL works immediately.
            const s = useItineraryStore.getState();
            void fetch("/api/share", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                share_id: id,
                payload: {
                  trip: s.trip,
                  days: s.days,
                  stay: s.stay,
                  preferences: s.preferences,
                  parking_lot: s.parking_lot,
                  status: "finalized",
                },
              }),
            });
          }}
          className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-1.5 text-[13px] font-semibold text-on-gold shadow-[var(--shadow-card)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
        >
          <Lock className="h-3.5 w-3.5" />
          Save & share
        </button>
      )}

      {status === "finalized" && shareUrl && share_id && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card/90 px-3 py-1.5 text-sm">
          <Link
            href={`/trip/${share_id}`}
            className="max-w-[180px] truncate font-mono text-xs text-ink-soft underline-offset-2 hover:underline"
          >
            {shareUrl.replace(/^https?:\/\//, "")}
          </Link>
          <Link
            href={`/trip/${share_id}`}
            aria-label="Open share view"
            className="rounded-full bg-sunk px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-gold/15"
          >
            <span className="inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> open
            </span>
          </Link>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy share link"
            className="rounded-full bg-sunk px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-gold/15"
          >
            {copied ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> copied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> copy
              </span>
            )}
          </button>
          <a
            href={`/trip/${share_id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Print or save as PDF"
            className="rounded-full bg-sunk px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-gold/15"
          >
            <span className="inline-flex items-center gap-1">
              <Printer className="h-3 w-3" /> print / pdf
            </span>
          </a>
          <a
            href={`/api/export/${share_id}/ics`}
            aria-label="Download as calendar file"
            className="rounded-full bg-sunk px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-gold/15"
          >
            <span className="inline-flex items-center gap-1">
              <CalendarPlus className="h-3 w-3" /> add to calendar
            </span>
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-card hover:text-ink"
      >
        <RotateCcw className="h-3 w-3" />
        Start over
      </button>
    </div>
  );
}
