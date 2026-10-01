import type { RedactedEvent } from "./types";

/**
 * Deterministic mock calendar for the Dubai demo.
 * Lets the demo prove calendar-awareness without an OAuth consent screen.
 *
 * Activate with NEXT_PUBLIC_CALENDAR_MODE=mock or via the source=mock query
 * param on /api/calendar/events.
 */
export const MOCK_EVENTS: RedactedEvent[] = [
  {
    id: "mock_difc_meeting",
    title: "Client meeting",
    start_local: "2026-05-16T15:00",
    end_local: "2026-05-16T16:00",
    location: "DIFC, Dubai",
    has_video: false,
  },
  {
    id: "mock_quarterly_review",
    title: "Quarterly Review",
    start_local: "2026-05-15T10:00",
    end_local: "2026-05-15T11:00",
    location: undefined,
    has_video: true,
  },
  {
    id: "mock_team_standup",
    title: "Team standup",
    start_local: "2026-05-15T09:30",
    end_local: "2026-05-15T09:45",
    location: undefined,
    has_video: true,
  },
];

export function eventsBetween(
  startIso: string,
  endIso: string,
): RedactedEvent[] {
  return MOCK_EVENTS.filter((e) => {
    const t = e.start_local.slice(0, 10);
    return t >= startIso && t <= endIso;
  });
}
