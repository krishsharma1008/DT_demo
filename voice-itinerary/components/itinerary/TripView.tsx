import { Clock, MapPin, Pin, Star, Users, Wifi } from "lucide-react";
import { heroGradientStyle } from "@/lib/images/gradient";
import { getDestination } from "@/lib/data";
import { ActivityImage } from "./ActivityImage";

type Trip = {
  destination_name: string | null;
  destination_id: string | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number;
  vibe?: string | null;
};

type FixedEvent = {
  id: string;
  title: string;
  start_time: string;
  duration_min: number;
  location?: string;
  type?: string;
};

type Activity = {
  id: string;
  title: string;
  start_time: string;
  duration_min: number;
  area_id?: string;
  notes?: string;
  catalog_id?: string;
  image?: string;
  reason?: string;
};

type Day = {
  index: number;
  date: string;
  mode: string;
  fixed_events: FixedEvent[];
  activities: Activity[];
};

type Stay = {
  area_id: string;
  property_id?: string;
  name?: string;
  tier?: "backpack" | "comfort" | "premium" | "luxury";
  blurb?: string;
  check_in_day: number;
  check_out_day: number;
};

type Payload = {
  trip: Trip;
  days: Day[];
  stay?: Stay | null;
  status?: string;
};

const TIER_DOTS: Record<string, number> = {
  backpack: 1,
  comfort: 2,
  premium: 3,
  luxury: 4,
};

function formatRange(start: string | null, end: string | null) {
  if (!start || !end) return "";
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function dayTitle(iso: string, idx: number) {
  return `Day ${idx + 1} · ${new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`;
}

export function TripView({
  snapshot,
  printMode = false,
}: {
  snapshot: { share_id: string; saved_at: number; payload: unknown };
  printMode?: boolean;
}) {
  const payload = snapshot.payload as Payload | null;
  if (!payload?.trip) {
    return (
      <p className="text-sm text-[color:var(--color-ink-600)]">
        Trip not found.
      </p>
    );
  }
  const { trip, days, stay } = payload;
  const dest = trip.destination_id ? getDestination(trip.destination_id) : null;
  const stayProperty =
    stay?.property_id && dest
      ? dest.stays.find((s) => s.id === stay.property_id)
      : null;
  const dots = TIER_DOTS[stay?.tier ?? "comfort"] ?? 2;

  return (
    <article className="flex flex-col gap-5">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-cream-200)] shadow-[var(--shadow-soft)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={heroGradientStyle(trip.destination_id)}
        />
        <div className="relative px-6 py-7 sm:px-8">
          <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-white/80">
            {printMode ? "Marhaba · Dubai itinerary" : "Your saved plan"}
          </p>
          <h1
            className="font-display text-5xl font-semibold tracking-tight text-white drop-shadow"
            style={{ textShadow: "0 1px 6px rgba(14,63,92,0.25)" }}
          >
            {trip.destination_name ?? "Untitled"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
            <span>{formatRange(trip.start_date, trip.end_date)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {trip.travelers} traveler
              {trip.travelers === 1 ? "" : "s"}
            </span>
            {trip.vibe && (
              <span className="inline-flex items-center gap-1 capitalize">
                <span aria-hidden>·</span>
                <MapPin className="h-3.5 w-3.5" />
                {trip.vibe}
              </span>
            )}
          </div>
        </div>
      </header>

      {stay?.area_id && (
        <section className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[color:var(--color-cream-200)] bg-card p-4 shadow-[var(--shadow-soft)]">
          <ActivityImage
            destinationId={trip.destination_id}
            seed={stay.property_id ?? stay.area_id}
            kind="stay"
            tags={["stay"]}
            size="md"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight text-[color:var(--color-navy-900)]">
                {stay.name ?? stayProperty?.name ?? "Stay"}
              </h3>
              <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-ink-400)]">
                {stay.area_id}
              </span>
            </div>
            {(stay.blurb ?? stayProperty?.blurb) && (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--color-ink-600)]">
                {stay.blurb ?? stayProperty?.blurb}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-400)]">
              <span className="inline-flex items-center gap-0.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-2.5 w-2.5 ${
                      i < dots
                        ? "fill-[color:var(--color-orange-500)] text-[color:var(--color-orange-500)]"
                        : "text-[color:var(--color-cream-200)]"
                    }`}
                    strokeWidth={1}
                  />
                ))}
              </span>
              <span aria-hidden>·</span>
              <span>
                day {stay.check_in_day + 1} → day {stay.check_out_day + 1}
              </span>
              <Wifi className="ml-auto h-3 w-3 text-[color:var(--color-success)]" />
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-4">
        {days.map((day) => (
          <section
            key={day.index}
            className="print-day rounded-[var(--radius-card)] border border-[color:var(--color-cream-200)] bg-card p-5 shadow-[var(--shadow-soft)]"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
                {dayTitle(day.date, day.index)}
              </h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-400)]">
                {day.mode}
              </span>
            </div>

            {day.fixed_events.length === 0 && day.activities.length === 0 && (
              <p className="text-sm italic text-[color:var(--color-ink-400)]">
                Open day.
              </p>
            )}

            <ol className="flex flex-col gap-3">
              {day.fixed_events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-sunk px-3 py-3 text-sm text-ink"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-card text-gold-ink">
                    <Pin className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-2">
                      <span className="font-semibold tabular-nums">
                        {ev.start_time}
                      </span>
                      {ev.type && (
                        <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">
                          {ev.type}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm opacity-95">{ev.title}</span>
                    {ev.location && (
                      <span className="truncate text-xs opacity-70">
                        {ev.location}
                      </span>
                    )}
                  </span>
                  <span className="hidden text-[10px] uppercase tracking-[0.16em] opacity-60 sm:inline">
                    {ev.duration_min}m
                  </span>
                </li>
              ))}

              {day.activities.map((a) => {
                const catalog = a.catalog_id
                  ? dest?.activities.find((x) => x.id === a.catalog_id) ??
                    dest?.food.find((x) => x.id === a.catalog_id)
                  : undefined;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl bg-[color:var(--color-cream-100)]/60 px-3 py-3 text-sm text-[color:var(--color-navy-900)]"
                  >
                    <ActivityImage
                      destinationId={trip.destination_id}
                      seed={a.catalog_id ?? a.id}
                      kind={catalog?.kind ?? "activity"}
                      tags={catalog?.tags}
                      image={a.image ?? catalog?.image}
                      size="md"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-2">
                        <Clock className="h-3 w-3 opacity-50" />
                        <span className="font-semibold tabular-nums">
                          {a.start_time}
                        </span>
                        {a.area_id && (
                          <span className="rounded-full bg-white/70 px-2 py-[1px] text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-400)]">
                            {a.area_id}
                          </span>
                        )}
                      </span>
                      <span className="font-display text-lg font-semibold leading-tight">{a.title}</span>
                      {(a.reason ?? a.notes) && (
                        <span className="text-xs leading-snug text-[color:var(--color-ink-600)]">
                          {a.reason ?? a.notes}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-400)]">
                      {a.duration_min}m
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-400)]">
        Marhaba — Dubai AI Concierge by Zapcom · illustrative prototype
      </p>
    </article>
  );
}
