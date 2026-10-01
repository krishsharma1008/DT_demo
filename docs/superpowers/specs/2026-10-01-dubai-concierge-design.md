# Marhaba — Dubai AI Concierge (by Zapcom) — design record

Date: 2026-10-01 · Branch: `feat/dubai-concierge`

## Goal
Turn the voice itinerary demo into a Zapcom-branded, Dubai-themed AI concierge
that runs the four use cases in the client brief end to end (voice + text):

| Use case | Visitor says | Tool path |
|---|---|---|
| Plan my day | "Near Downtown, two children aged 8 and 12, today free, not much walking" | `update_visit` → `plan_my_day` |
| Change one part | "Younger child doesn't want a museum — something indoors?" | `replace_stop(avoid:["museum"], indoor:true)` |
| Help me now | "We're tired — what's within 20 minutes from here?" | `find_nearby(max_minutes:20, purpose:"rest")` |
| Take the next step | "Tell me more about that place — how do we get there?" | `show_place` (card + Google Maps directions) |

## Decisions (agreed with the user)
- Approach A: evolve the existing app. Keep WebRTC/realtime plumbing and the
  multi-day trip planner; remove Goa/Bali/Tokyo/Lisbon; Dubai is the only
  destination, with researched day trips (Abu Dhabi, Sharjah, Hatta, RAK).
- Branding: "Marhaba — Dubai AI Concierge, by Zapcom". Zapcom logo + colours
  supplied later via `public/brand/` and `--brand-*` CSS tokens. "Illustrative
  prototype" badge; no Dubai Tourism marks.
- Location is spoken only (remembered in session memory). `?clock=HH:mm` /
  `?date=` pin the Dubai clock for demos; `?mic=0` runs text-only.
- Audience: presented on laptop and tried on phones — both layouts first-class.

## Architecture
- `lib/concierge/geo.ts` — haversine, Dubai taxi-time model, Maps links.
- `lib/concierge/clock.ts` — Asia/Dubai "now" with demo overrides.
- `lib/concierge/planner.ts` — pure: resolve location, party/constraint fit,
  opening hours, plan a day with reasons, find replacements, nearby-now.
- `lib/realtime/conciergeTools.ts` — six tools over the planner + store.
- `lib/store/itinerary.ts` — `visit` session memory, `focus_place_id`,
  `changed_ids`, `nearby`; snapshot includes the visitor line + stop ids.
- `lib/data/dubai-extra.ts` — researched places with coords, ages, walking,
  official links; merged in `lib/data/index.ts`.
- Text input: `useVoiceSession().sendText()`; mic-less sessions are receive-only.

## Testing
- `test/concierge.test.ts` drives the four use cases through the dispatcher
  and asserts invariants (fit, untouched stops, radius, directions link).
- Live check: drive the app in Chrome via the text box with the real model.
