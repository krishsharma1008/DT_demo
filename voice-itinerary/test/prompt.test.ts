import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "@/lib/realtime/prompt";

describe("prompt.buildSystemPrompt", () => {
  test("contains all expected sections", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    const required = [
      "You are Marhaba",
      "In-Dubai concierge",
      "Language. Speak English",
      "RULE — show, then tell",
      "Information hierarchy",
      "Day-by-day planning",
      "Guided personalization",
      "Personalization defaults",
      "Tool discipline",
      "Flights. When the user mentions",
      "Hospitality (stays, nearby, transport)",
      "Recovery rules",
      "Out of scope",
      "Voice quirks",
    ];
    for (const needle of required) {
      assert.ok(
        prompt.includes(needle),
        `expected section "${needle}" in prompt`,
      );
    }
  });

  test("injects current_date into the prompt", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    assert.ok(prompt.includes("Current date in Dubai: 2026-04-26"));
  });

  test("requires guided personalization before drafting", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    assert.ok(prompt.includes("Ask exactly two quick preference questions"));
    assert.ok(prompt.includes("paint the skeleton only"));
    assert.ok(prompt.includes("Do NOT call"));
    assert.ok(prompt.includes("suggest_stays"));
    assert.ok(prompt.includes("propose_full_itinerary yet"));
    assert.ok(prompt.includes("call set_preferences for the user's answer"));
    assert.ok(prompt.includes("Any budget"));
    assert.ok(prompt.includes("must-see"));
    assert.ok(prompt.includes("must-avoid"));
  });

  test("removes immediate auto-fill instructions", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    assert.ok(!prompt.includes("Do NOT ask \"what kind of"));
    assert.ok(!prompt.includes("BEFORE asking any Tier-3"));
    assert.ok(!prompt.includes("BEFORE asking the user"));
    assert.ok(!prompt.includes("RIGHT AFTER set_trip_basics + set_day_modes"));
    assert.ok(!prompt.includes("Aggressive defaults"));
  });

  test("documents the intended personalization tool sequence", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    const skeleton = prompt.indexOf("set_trip_basics + set_day_modes");
    const preferences = prompt.indexOf("set_preferences");
    const stays = prompt.lastIndexOf("suggest_stays");
    const draft = prompt.lastIndexOf("propose_full_itinerary");

    assert.ok(skeleton !== -1, "skeleton tools are named");
    assert.ok(preferences > skeleton, "preferences happen after skeleton");
    assert.ok(stays > preferences, "stays happen after preferences");
    assert.ok(draft > preferences, "draft happens after preferences");
  });

  test("renders existing_commitments block when provided", () => {
    const prompt = buildSystemPrompt({
      current_date: "2026-04-26",
      existing_commitments: [
        {
          title: "Standup",
          start_local: "2026-05-16T09:30",
          end_local: "2026-05-16T10:00",
          has_video: true,
        },
        {
          title: "Client meeting",
          start_local: "2026-05-16T15:00",
          end_local: "2026-05-16T16:00",
          location: "DIFC, Dubai",
          has_video: false,
        },
      ],
    });
    assert.ok(prompt.includes("Existing commitments"));
    assert.ok(prompt.includes("Calendar awareness"), "calendar rules only when commitments exist");
    assert.ok(prompt.includes("Standup"));
    assert.ok(prompt.includes("DIFC, Dubai"));
    assert.ok(prompt.includes("(video)"));
  });

  test("omits commitments block when none provided", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    assert.ok(!prompt.includes("Existing commitments"));
    assert.ok(!prompt.includes("Calendar awareness"));
  });

  test("renders itinerary_snapshot block when continuity is needed", () => {
    const snapshot =
      "Trip: 5-day Dubai, 2026-05-15→2026-05-19, 1 traveler, chill vibe.\nDay 1 2026-05-15 (work): open";
    const prompt = buildSystemPrompt({
      current_date: "2026-04-26",
      itinerary_snapshot: snapshot,
    });
    assert.ok(prompt.includes("CURRENT STATE"));
    assert.ok(prompt.includes("do NOT start over"));
    assert.ok(prompt.includes("do NOT re-greet"));
    assert.ok(prompt.includes("5-day Dubai"));
  });

  test("names all four concierge use-case tools", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26", current_time: "10:15" });
    for (const tool of ["update_visit", "plan_my_day", "replace_stop", "find_nearby", "show_place"]) {
      assert.ok(prompt.includes(tool), `prompt mentions ${tool}`);
    }
    assert.ok(prompt.includes("local time 10:15"));
    assert.ok(!/tineri|goa|panjim/i.test(prompt), "no legacy branding or cities");
  });

  test("omits snapshot block when none provided (fresh session)", () => {
    const prompt = buildSystemPrompt({ current_date: "2026-04-26" });
    assert.ok(!prompt.includes("CURRENT STATE"));
  });
});
