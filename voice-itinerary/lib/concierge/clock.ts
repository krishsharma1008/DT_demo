/**
 * "Now" in Dubai. The visitor is in Dubai even when the demo runs from a
 * meeting room elsewhere, so we always read Asia/Dubai wall-clock time.
 *
 * Presenters can pin the clock with `?clock=10:30` (and `?date=2026-12-04`)
 * so "help me now" behaves the same whatever time the demo happens.
 */

export type DubaiNow = { date: string; time: string; weekday: number; month: number };

function override(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function dubaiNow(at: Date = new Date()): DubaiNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let date = `${get("year")}-${get("month")}-${get("day")}`;
  let time = `${get("hour")}:${get("minute")}`;

  const clock = override("clock");
  if (clock && /^\d{1,2}:\d{2}$/.test(clock)) time = clock.padStart(5, "0");
  const d = override("date");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;

  const js = new Date(date + "T00:00:00Z");
  return { date, time, weekday: js.getUTCDay(), month: js.getUTCMonth() + 1 };
}
