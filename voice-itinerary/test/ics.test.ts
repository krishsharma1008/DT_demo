import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, suggestedFilename, type IcsPayload } from "@/lib/share/ics";

const SAMPLE: IcsPayload = {
  trip: {
    destination_id: "dubai",
    destination_name: "Dubai",
    start_date: "2026-05-15",
    end_date: "2026-05-19",
  },
  days: [
    {
      index: 0,
      date: "2026-05-15",
      fixed_events: [
        {
          id: "f0",
          title: "6E-2317 BOM-GOI arr",
          type: "flight",
          start_time: "09:45",
          duration_min: 30,
          location: "GOI",
        },
      ],
      activities: [
        {
          id: "a1",
          title: "Coworking, cafe",
          start_time: "11:00",
          duration_min: 180,
          area_id: "marina",
        },
      ],
    },
    {
      index: 1,
      date: "2026-05-16",
      fixed_events: [
        {
          id: "f1",
          title: "Meeting with Anand",
          type: "meeting",
          start_time: "15:00",
          duration_min: 60,
          location: "DIFC, Dubai",
        },
      ],
      activities: [],
    },
  ],
};

describe("ics.buildIcs", () => {
  test("emits a valid VCALENDAR header", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    assert.ok(out.startsWith("BEGIN:VCALENDAR"), "starts with BEGIN:VCALENDAR");
    assert.ok(out.includes("VERSION:2.0"));
    assert.ok(out.includes("END:VCALENDAR"));
  });

  test("includes one VEVENT per fixed_event + activity", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    const matches = out.match(/BEGIN:VEVENT/g) ?? [];
    assert.equal(matches.length, 3, "2 fixed events + 1 activity = 3");
  });

  test("escapes commas in LOCATION per RFC 5545", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    assert.ok(
      out.includes("LOCATION:DIFC\\, Dubai"),
      "comma in 'DIFC, Dubai' is backslash-escaped",
    );
  });

  test("escapes commas in SUMMARY", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    assert.ok(
      out.includes("SUMMARY:Coworking\\, cafe"),
      "comma in summary is escaped",
    );
  });

  test("uses TZID for known destinations", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    assert.ok(
      out.includes("X-WR-TIMEZONE:Asia/Dubai"),
      "Dubai → Asia/Dubai",
    );
    assert.ok(
      out.includes("DTSTART;TZID=Asia/Dubai:"),
      "events stamp with TZID",
    );
  });

  test("UIDs are stable per (share, day, kind, id)", () => {
    const out = buildIcs("smoke-1", SAMPLE);
    assert.ok(out.includes("UID:smoke-1:0:fx:f0@marhaba.zapcom"));
    assert.ok(out.includes("UID:smoke-1:1:fx:f1@marhaba.zapcom"));
    assert.ok(out.includes("UID:smoke-1:0:act:a1@marhaba.zapcom"));
  });
});

describe("ics.suggestedFilename", () => {
  test("includes destination + dates", () => {
    assert.equal(
      suggestedFilename(SAMPLE),
      "dubai-2026-05-15-to-2026-05-19.ics",
    );
  });

  test("falls back gracefully when destination is missing", () => {
    const stripped: IcsPayload = {
      trip: { ...SAMPLE.trip, destination_name: null },
      days: SAMPLE.days,
    };
    assert.equal(suggestedFilename(stripped), "trip-2026-05-15-to-2026-05-19.ics");
  });
});
