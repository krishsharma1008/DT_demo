import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Compass, Printer } from "lucide-react";
import { EditableTripCanvas } from "@/components/itinerary/EditableTripCanvas";

type Snapshot = {
  share_id: string;
  saved_at: number;
  payload: unknown;
};

async function fetchTrip(id: string): Promise<Snapshot | null> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) return null;
  const res = await fetch(`${proto}://${host}/api/share/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Snapshot;
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snap = await fetchTrip(id);
  if (!snap) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
        <div className="rounded-[8px] border border-[color:var(--color-cream-200)] bg-card p-6 shadow-[0_18px_60px_rgba(15,35,55,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ink-400)]">
            trip link unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-[color:var(--color-navy-900)]">
            This itinerary is no longer saved.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--color-ink-600)]">
            Start a fresh conversation with the concierge and save the plan again.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-cream-200)] bg-card px-4 py-2 text-sm font-medium text-[color:var(--color-navy-900)] transition-colors hover:bg-[color:var(--color-cream-50)]"
          >
            <ArrowLeft className="h-4 w-4" />
            back to the concierge
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:px-8">
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--color-ink-400)] transition-colors hover:text-[color:var(--color-navy-900)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          new conversation
        </Link>
        <div className="flex items-center gap-2 text-[color:var(--color-navy-900)]">
          <a
            href={`/trip/${id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-cream-200)] bg-card/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-card"
          >
            <Printer className="h-3.5 w-3.5" />
            print / pdf
          </a>
          <a
            href={`/api/export/${id}/ics`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-cream-200)] bg-card/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-card"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            add to calendar
          </a>
          <span className="hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-400)] sm:inline-flex">
            <Compass className="h-3 w-3" />
            Marhaba by Zapcom
          </span>
        </div>
      </nav>

      <EditableTripCanvas snapshot={snap} />
    </section>
  );
}
