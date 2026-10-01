/**
 * RFC 5545 .ics generator for finalized trips. Hand-rolled because the spec
 * is small and we don't want a library for ~80 lines of work.
 *
 * Each fixed event and scheduled activity becomes a VEVENT with a stable UID
 * (`<share_id>:<day_index>:<event_or_activity_id>`) so re-imports merge in
 * place rather than duplicating. Times are emitted with `TZID=<IANA zone>`
 * so the calendar app shows them at correct local times in any timezone.
 */

type IcsActivity = {
  id: string;
  title: string;
  start_time: string; // "HH:mm"
  duration_min: number;
  area_id?: string;
  notes?: string;
};

type IcsFixedEvent = {
  id: string;
  title: string;
  start_time: string;
  duration_min: number;
  location?: string;
  type?: string;
};

type IcsDay = {
  index: number;
  date: string; // "YYYY-MM-DD"
  fixed_events: IcsFixedEvent[];
  activities: IcsActivity[];
};

type IcsTrip = {
  destination_id: string | null;
  destination_name: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type IcsPayload = {
  trip: IcsTrip;
  days: IcsDay[];
};

/**
 * IANA timezone per destination. Kept in lockstep with /lib/data destinations.
 * If a destination is added without an entry here we fall back to floating
 * time (no TZID) which most calendar apps interpret as the user's local zone.
 */
const TZ_BY_DESTINATION: Record<string, string> = {
  dubai: "Asia/Dubai",
};

const CRLF = "\r\n";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatLocal(date: string, time: string): string {
  // date: YYYY-MM-DD, time: HH:mm → YYYYMMDDTHHMMSS
  const [y, m, d] = date.split("-");
  const [h, min] = time.split(":");
  return `${y}${m}${d}T${h}${min}00`;
}

function addMinutesToTime(time: string, minutes: number): { time: string; dayDelta: number } {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const dayDelta = Math.floor(total / (24 * 60));
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return { time: `${pad(hh)}:${pad(mm)}`, dayDelta };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Per RFC 5545 §3.3.11 — backslash-escape commas, semicolons, newlines, backslashes. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Lines in ICS must be ≤75 octets — fold long ones with CRLF + space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = i === 0 ? 75 : 74; // continuation lines start with a space, that counts
    out.push((i === 0 ? "" : " ") + line.slice(i, i + chunk));
    i += chunk;
  }
  return out.join(CRLF);
}

function vevent(args: {
  uid: string;
  dtstamp: string; // YYYYMMDDTHHMMSSZ
  date: string; // YYYY-MM-DD start day
  start_time: string;
  duration_min: number;
  summary: string;
  location?: string;
  description?: string;
  tzid?: string;
}): string[] {
  const dtstart = formatLocal(args.date, args.start_time);
  const end = addMinutesToTime(args.start_time, args.duration_min);
  const endDate = shiftDate(args.date, end.dayDelta);
  const dtend = formatLocal(endDate, end.time);
  const tzPart = args.tzid ? `;TZID=${args.tzid}` : "";
  const lines = [
    "BEGIN:VEVENT",
    `UID:${args.uid}`,
    `DTSTAMP:${args.dtstamp}`,
    `DTSTART${tzPart}:${dtstart}`,
    `DTEND${tzPart}:${dtend}`,
    `SUMMARY:${escapeText(args.summary)}`,
  ];
  if (args.location) lines.push(`LOCATION:${escapeText(args.location)}`);
  if (args.description)
    lines.push(`DESCRIPTION:${escapeText(args.description)}`);
  lines.push("END:VEVENT");
  return lines.map(fold);
}

export function buildIcs(share_id: string, payload: IcsPayload): string {
  const tzid = payload.trip.destination_id
    ? TZ_BY_DESTINATION[payload.trip.destination_id]
    : undefined;

  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const tripName = payload.trip.destination_name ?? "Trip";

  const blocks: string[][] = [];
  for (const day of payload.days) {
    for (const ev of day.fixed_events) {
      blocks.push(
        vevent({
          uid: `${share_id}:${day.index}:fx:${ev.id}@marhaba.zapcom`,
          dtstamp,
          date: day.date,
          start_time: ev.start_time,
          duration_min: ev.duration_min,
          summary: ev.title,
          location: ev.location,
          description: ev.type ? `Type: ${ev.type}` : undefined,
          tzid,
        }),
      );
    }
    for (const a of day.activities) {
      blocks.push(
        vevent({
          uid: `${share_id}:${day.index}:act:${a.id}@marhaba.zapcom`,
          dtstamp,
          date: day.date,
          start_time: a.start_time,
          duration_min: a.duration_min,
          summary: a.title,
          location: a.area_id,
          description: a.notes,
          tzid,
        }),
      );
    }
  }

  const calLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zapcom//Marhaba Dubai Concierge//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(tripName)}`,
    ...(tzid ? [`X-WR-TIMEZONE:${tzid}`] : []),
    ...blocks.flat(),
    "END:VCALENDAR",
  ];
  return calLines.join(CRLF) + CRLF;
}

/** Suggested filename for the download — destination + dates, slug-safe. */
export function suggestedFilename(payload: IcsPayload): string {
  const slug = (payload.trip.destination_name ?? "trip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const dates =
    payload.trip.start_date && payload.trip.end_date
      ? `-${payload.trip.start_date}-to-${payload.trip.end_date}`
      : "";
  return `${slug}${dates}.ics`;
}
