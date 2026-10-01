# Marhaba — Dubai AI Concierge, by Zapcom

An illustrative prototype of a voice-led concierge for visitors to Dubai.
Talk (or type) to plan a day, change one stop, get help nearby right now, and
open a place card with directions. The itinerary stays in session memory, so
later requests never require restating the trip. Multi-day trip planning is
also supported. Powered by the OpenAI Realtime API (`gpt-realtime-2.1`, `gpt-transcribe`) over WebRTC.

## Setup (≤5 minutes)

```bash
pnpm install
cp .env.local.example .env.local   # then paste your OPENAI_API_KEY
pnpm dev                            # http://localhost:3000
```

Open in **Chrome**. Click the orb and allow the mic — or just type in the
message box.

## Demo script (the four client use cases)

1. **Plan my day** — "We are near Downtown with two children, aged 8 and 12.
   We have today free and do not want much walking."
2. **Change one part** — "My younger child does not want a museum. Can we do
   something indoors instead?" *(only that stop changes, highlighted)*
3. **Help me now** — "We are tired. What can we do within 20 minutes from
   here?" *(two nearby options for the family)*
4. **Take the next step** — "Tell me more about that place. How do we get
   there?" *(detail card + Get directions)*

Presenter URL options: `?clock=10:30` pins Dubai time (so "now" behaves the
same whenever you demo), `?date=2026-12-04` pins the date, `?mic=0` runs
text-only.

## Environment

| Var | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Server-only. Never reaches the browser. |
| `ALLOWED_ORIGINS` | optional | Comma-separated extra origins for `/api/realtime/session`. Same-origin always allowed. |
| `NEXT_PUBLIC_CALENDAR_MODE` | optional | `mock` to inject the demo calendar fixture (a DIFC meeting). Leave unset for off. |

The key is read by the server route `app/api/realtime/session/route.ts`,
which mints a short-lived ephemeral `client_secret` per call. The browser
only ever sees that ephemeral key (and only for ~60s).

## What's wired today

- `gpt-realtime-2.1` over WebRTC (transcription: `gpt-transcribe`), `semantic_vad`, ephemeral client-secret minting;
  typed messages share the same session (text-only if no mic)
- Concierge tools: `update_visit` (session memory: party, location, walking /
  indoor limits, dislikes, time window), `plan_my_day`, `replace_stop`,
  `find_nearby`, `show_place`, `add_place_to_plan`
- Multi-day trip tools: `set_trip_basics`, `set_day_modes`, `add_fixed_event`,
  `set_stay`, `add_activity`, `move_activity`, `remove_activity`,
  `plan_day`, `propose_full_itinerary`, `validate_itinerary`,
  `finalize_itinerary`, `search_flights` (mock, into DXB), `suggest_stays`,
  `suggest_nearby`, `get_transport_info`, `open_print`, `export_ics`
- Dubai catalog with coordinates, family fit (minimum age, walking level,
  indoor/outdoor), opening hours and official links, plus day trips to Abu
  Dhabi, Sharjah, Hatta and Ras Al Khaimah. Travel times come from a Dubai
  taxi model over real coordinates.
- Share page `/trip/[id]`, print view and `.ics` export for finalized trips

## What's not wired yet

- Real Google Calendar OAuth (superseded by browser-use bridge in
  `services/calendar-bridge`; OAuth path may return if the bridge proves
  too heavy for production hosts)
- True PDF rendering via `@react-pdf/renderer` (the print route covers
  the demo; revisit when the library officially supports React 19)
- Durable share-link store (in-memory `Map`; swap for Vercel KV before
  a real launch)

See `PLAN.md` in the parent directory for the full roadmap.

## Troubleshooting

**Silence after "tuning in…"** — Chrome blocked autoplay. Click anywhere
on the page once, then click the orb.

**"Microphone permission denied"** — Click the lock icon in the URL bar,
allow mic access, refresh.

**"upstream_error 400 Unknown parameter"** — OpenAI Realtime API shape
drifted. Check `lib/realtime/config.ts`; both `output_modalities` and
`audio.output.voice` are placement-sensitive.

**"upstream_error 400 model"** — Your account may not be enabled for
`gpt-realtime-2.1`. Fall back to `gpt-realtime-2` or `gpt-realtime` in
`lib/realtime/config.ts` as a fallback.

**Latency > 3s on first reply** — The Next.js route is cold. Hit it once
with curl before the demo to warm it.

## Security

The OpenAI API key is server-only and never reaches the browser. The
browser holds a short-lived (~60s) ephemeral `client_secret` minted just
before each WebRTC handshake. Other defenses:

- Strict origin allow-list on `/api/realtime/session`
- Per-IP rate limit (10/min in dev; production should swap to Vercel KV)
- Tight CSP including `connect-src 'self' https://api.openai.com wss://api.openai.com`
- `Permissions-Policy: microphone=(self), camera=()`

`.env.local` is gitignored. Rotate the key after public demos.

## Built by

Zapcom. Illustrative prototype — not affiliated with or
endorsed by any government tourism body. Recommendations come from a small
curated catalog; there is no live availability, booking or payment.
