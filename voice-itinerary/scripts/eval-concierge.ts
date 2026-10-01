/**
 * Live behaviour eval: drives the REAL realtime model (text modality) with
 * the production system prompt, tool definitions and dispatcher through
 * scripted multi-turn conversations, then asserts on tool calls, store state
 * and replies after every turn.
 *
 *   pnpm eval                 # all scenarios
 *   pnpm eval -- plan         # scenarios whose id contains "plan"
 *   EVAL_RUNS=3 pnpm eval     # repeat each scenario (flakiness check)
 *
 * Needs OPENAI_API_KEY (read from .env.local if not in the environment).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildSystemPrompt } from "@/lib/realtime/prompt";
import { TOOL_DEFINITIONS, dispatchToolCall } from "@/lib/realtime/tools";
import { useItineraryStore, formatItinerarySnapshot } from "@/lib/store/itinerary";
import { useVoiceStore } from "@/lib/store/voice";
import { dubaiNow } from "@/lib/concierge/clock";
import { findPlace } from "@/lib/data";
import { REALTIME_MODEL } from "@/lib/realtime/config";

// ── env ─────────────────────────────────────────────────────────────────────
function apiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const m = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1]!.trim();
  } catch {}
  throw new Error("OPENAI_API_KEY missing");
}

// ── realtime text session ───────────────────────────────────────────────────
type ToolCall = { name: string; args: Record<string, unknown>; result: { ok: boolean; summary: string; [k: string]: unknown } };
type Turn = { user: string; reply: string; calls: ToolCall[]; ms: number };

class Session {
  private ws!: WebSocket;
  private waiters: Array<(e: Record<string, unknown>) => void> = [];
  private queue: Record<string, unknown>[] = [];

  async open(instructions: string) {
    this.ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, [
      "realtime",
      `openai-insecure-api-key.${apiKey()}`,
    ]);
    this.ws.onmessage = (m) => {
      const e = JSON.parse(String(m.data)) as Record<string, unknown>;
      if (e.type === "error") console.error("  [server error]", JSON.stringify(e.error));
      const w = this.waiters.shift();
      if (w) w(e);
      else this.queue.push(e);
    };
    await new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (err) => rej(err);
    });
    await this.until("session.created");
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["text"],
        instructions,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      },
    });
    await this.until("session.updated");
  }

  send(e: object) {
    this.ws.send(JSON.stringify(e));
  }

  private next(): Promise<Record<string, unknown>> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    return new Promise((res) => this.waiters.push(res));
  }

  private async until(type: string, timeoutMs = 60_000) {
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${type}`);
      const e = await Promise.race([
        this.next(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout waiting for ${type}`)), timeoutMs)),
      ]);
      if (e.type === type) return e;
    }
  }

  /** One user turn: run responses + tool loops until the model stops calling tools. */
  async say(text: string): Promise<Turn> {
    const t0 = Date.now();
    useVoiceStore.getState().appendUserTurn(`u_${t0}`, text);
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    const calls: ToolCall[] = [];
    let reply = "";
    let rateRetries = 0;
    for (let round = 0; round < 8; round++) {
      this.send({ type: "response.create" });
      const done = (await this.until("response.done", 90_000)) as {
        response: { status: string; output: Array<Record<string, unknown>>; status_details?: unknown };
      };
      if (done.response.status === "failed") {
        const d = done.response.status_details as { error?: { code?: string; message?: string } } | undefined;
        if (d?.error?.code === "rate_limit_exceeded" && rateRetries < 6) {
          rateRetries++;
          const secs = Number(/try again in ([\d.]+)s/i.exec(d.error.message ?? "")?.[1] ?? 10);
          console.log(`     ⏳ rate limited, waiting ${Math.ceil(secs + 1)}s`);
          await new Promise((r) => setTimeout(r, Math.ceil(secs + 1) * 1000));
          round--;
          continue;
        }
        throw new Error(`response failed: ${JSON.stringify(done.response.status_details)}`);
      }
      const fnCalls = done.response.output.filter((o) => o.type === "function_call");
      for (const o of done.response.output) {
        if (o.type === "message") {
          for (const c of (o.content as Array<{ type: string; text?: string; transcript?: string }>) ?? []) {
            reply += (c.text ?? c.transcript ?? "") + " ";
          }
        }
      }
      if (fnCalls.length === 0) break;
      for (const f of fnCalls) {
        const args = JSON.parse(String(f.arguments || "{}"));
        const result = (await dispatchToolCall(String(f.name), String(f.arguments || "{}"))) as ToolCall["result"];
        calls.push({ name: String(f.name), args, result });
        this.send({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: f.call_id, output: JSON.stringify(result) },
        });
      }
    }
    reply = reply.trim();
    useVoiceStore.getState().appendAssistantDelta(`a_${t0}`, reply);
    return { user: text, reply, calls, ms: Date.now() - t0 };
  }

  close() {
    this.ws.close();
  }
}

// ── assertions ──────────────────────────────────────────────────────────────
type Check = { ok: boolean; label: string };
const check = (ok: boolean, label: string): Check => ({ ok, label });
const called = (t: Turn, name: string) => t.calls.filter((c) => c.name === name);
const okCalled = (t: Turn, name: string) => called(t, name).some((c) => c.result.ok);
const state = () => useItineraryStore.getState();
const stops = () => state().days.flatMap((d) => d.activities);
const asksAgain = (reply: string) =>
  /how many (people|of you|adults|kids|children)|how old|what ages|where are you( staying)?\??$/i.test(reply);

type Step = { user: string; expect: (t: Turn, ctx: Ctx) => Check[] };
type Ctx = { snapshot: ReturnType<typeof stops>; mark: () => void; prev: () => ReturnType<typeof stops> };
type Scenario = { id: string; title: string; steps: Step[] };

function makeCtx(): Ctx {
  let snap = stops().map((s) => ({ ...s }));
  return {
    get snapshot() {
      return snap;
    },
    mark() {
      snap = stops().map((s) => ({ ...s }));
    },
    prev() {
      return snap;
    },
  };
}

const FAMILY =
  "We are near Downtown with two children, aged 8 and 12. We have today free and do not want much walking.";

const SCENARIOS: Scenario[] = [
  {
    id: "brief-four-use-cases",
    title: "Client brief: plan → change one part → help me now → next step",
    steps: [
      {
        user: FAMILY,
        expect: (t) => {
          const v = state().visit;
          const ss = stops();
          return [
            check(okCalled(t, "update_visit"), "remembers the visit (update_visit)"),
            check(JSON.stringify(v.party?.children?.slice().sort()) === "[8,12]", `party kids [8,12] (got ${JSON.stringify(v.party)})`),
            check(v.location?.area_id === "downtown", `location Downtown (got ${v.location?.label})`),
            check(v.low_walking === true, "low walking remembered"),
            check(okCalled(t, "plan_my_day"), "plans the day (plan_my_day)"),
            check(ss.length >= 3, `≥3 timed stops (got ${ss.length})`),
            check(ss.every((s) => (s.reason ?? "").length > 10), "every stop has a reason"),
            check(ss.every((s) => findPlace(s.catalog_id ?? "")?.kid_friendly !== false), "all stops kid-friendly"),
            check(t.reply.length > 0 && t.reply.length < 400, "short spoken reply"),
            check(!asksAgain(t.reply), "doesn't re-ask known facts"),
          ];
        },
      },
      {
        user: "My younger child does not want a museum. Can we do something indoors instead?",
        expect: (t, ctx) => {
          const before = ctx.prev();
          const after = stops();
          const hadMuseum = before.some((s) => findPlace(s.catalog_id ?? "")?.tags.includes("museum"));
          const added = after.filter((a) => !before.some((b) => b.id === a.id));
          const kept = before.filter((b) => after.some((a) => a.id === b.id && a.start_time === b.start_time));
          const checks = [
            check(!okCalled(t, "plan_my_day"), "doesn't rebuild the whole day"),
            check(after.every((s) => !findPlace(s.catalog_id ?? "")?.tags.includes("museum")), "no museum left in plan"),
            check(state().visit.avoid_tags.includes("museum"), "remembers 'no museum'"),
          ];
          if (hadMuseum) {
            checks.push(
              check(okCalled(t, "replace_stop"), "swaps one stop (replace_stop)"),
              check(added.length === 1, `exactly one stop changed (got ${added.length})`),
              check(kept.length === before.length - 1, `rest of the day intact (${kept.length}/${before.length - 1})`),
              check(added.every((a) => findPlace(a.catalog_id ?? "")?.indoor_outdoor === "indoor"), "replacement is indoors"),
            );
          } else {
            checks.push(check(after.length === before.length, "plan had no museum; plan unchanged"));
          }
          return checks;
        },
      },
      {
        user: "We are tired. What can we do within 20 minutes from here?",
        expect: (t) => {
          const near = called(t, "find_nearby").find((c) => c.result.ok);
          const opts = (near?.result.options as Array<{ travel_min: number; place_id: string }>) ?? [];
          return [
            check(Boolean(near), "finds nearby options (find_nearby)"),
            check(Number(near?.args.max_minutes ?? 20) <= 20, `radius ≤20 min (got ${near?.args.max_minutes})`),
            check(opts.length === 2, `two options (got ${opts.length})`),
            check(opts.every((o) => o.travel_min <= 20), "both within 20 min"),
            check(state().nearby.length === 2, "options shown on screen"),
            check(opts.every((o) => t.reply.toLowerCase().includes((findPlace(o.place_id)?.name ?? "").split(/[ ,(]/)[0]!.toLowerCase())), "reply names both options"),
            check(!asksAgain(t.reply), "uses remembered location & party"),
          ];
        },
      },
      {
        user: "Tell me more about that place. How do we get there?",
        expect: (t) => {
          const sp = called(t, "show_place").find((c) => c.result.ok);
          const shownId = (sp?.result.place as { id?: string } | undefined)?.id;
          const nearbyIds = state().nearby.map((n) => n.place_id);
          return [
            check(Boolean(sp), "opens the place card (show_place)"),
            check(Boolean(shownId && (nearbyIds.includes(shownId) || nearbyIds.length === 0)), "card is one of the options just discussed"),
            check(state().focus_place_id === shownId, "card visible (focus set)"),
            check(/min|taxi|metro|walk|drive|minutes/i.test(t.reply), "explains how to get there"),
            check(t.reply.length < 500, "concise answer"),
          ];
        },
      },
    ],
  },
  {
    id: "context-carry",
    title: "Context carries forward: move, eat nearby, add to plan, recall",
    steps: [
      {
        user: FAMILY,
        expect: (t) => [check(okCalled(t, "plan_my_day"), "plans the day")],
      },
      {
        user: "We just got to the Dubai Mall. The kids are hungry — anything to eat close by?",
        expect: (t) => {
          const near = called(t, "find_nearby").find((c) => c.result.ok);
          return [
            check(state().visit.location?.area_id === "downtown", "location updated to Dubai Mall / Downtown"),
            check(Boolean(near), "finds nearby food"),
            check(near?.args.purpose === "eat", `purpose=eat (got ${near?.args.purpose})`),
            check(!asksAgain(t.reply), "doesn't re-ask party"),
          ];
        },
      },
      {
        user: "Great, let's do the first one.",
        expect: (t) => [
          check(okCalled(t, "add_place_to_plan"), "adds the pick to the plan (add_place_to_plan)"),
        ],
      },
      {
        user: "Remind me, how old are my kids and what did I say I want to avoid?",
        expect: (t) => [
          check(/8/.test(t.reply) && /12/.test(t.reply), "recalls ages 8 and 12"),
          check(/walk/i.test(t.reply), "recalls minimal walking"),
          check(t.calls.every((c) => c.name !== "plan_my_day"), "doesn't replan"),
        ],
      },
    ],
  },
  {
    id: "multi-day",
    title: "Multi-day trip planned ahead still works",
    steps: [
      {
        user: "Plan a three-day Dubai trip from next Thursday to Saturday for two adults. We love culture and food. Just make it.",
        expect: (t) => {
          const s = state();
          const filled = s.days.filter((d) => d.activities.length >= 2).length;
          return [
            check(okCalled(t, "set_trip_basics"), "sets trip basics"),
            check(s.days.length === 3, `3 days (got ${s.days.length})`),
            check(s.days[0] ? new Date(s.days[0].date + "T00:00:00Z").getUTCDay() === 4 : false, `starts on a Thursday (got ${s.days[0]?.date})`),
            check(filled >= 2, `days filled with activities (${filled}/3)`),
          ];
        },
      },
      {
        user: "Swap whatever is on day two in the evening for something with a view.",
        expect: (t) => [
          check(t.calls.some((c) => c.result.ok && ["replace_stop", "remove_activity", "add_activity", "move_activity"].includes(c.name)), "edits day two"),
          check(state().days.length === 3, "trip length unchanged"),
        ],
      },
    ],
  },
  {
    id: "day-trip",
    title: "Day trip around Dubai",
    steps: [
      {
        user: "It's two of us adults, staying in the Marina. Could we do a day trip to Abu Dhabi today? We'd love the Grand Mosque.",
        expect: (t) => {
          const ss = stops();
          return [
            check(okCalled(t, "plan_my_day") || okCalled(t, "add_place_to_plan") || okCalled(t, "add_activity"), "plans the trip"),
            check(ss.some((s) => findPlace(s.catalog_id ?? "")?.emirate === "abu_dhabi"), "includes Abu Dhabi stops"),
          ];
        },
      },
    ],
  },
  {
    id: "boundaries",
    title: "Prototype boundaries: no bookings, stays on topic",
    steps: [
      {
        user: "Can you book Burj Khalifa tickets for us and pay with my card?",
        expect: (t) => [
          check(!/booked|i've reserved|confirmed your|payment (is )?complete/i.test(t.reply), "doesn't pretend to book"),
          check(/can't|cannot|not able|unable|prototype/i.test(t.reply), "says it can't book"),
        ],
      },
      {
        user: "Write me a Python script to sort a list.",
        expect: (t) => [
          check(!/def |sorted\(/.test(t.reply), "doesn't write code"),
          check(t.calls.length === 0, "no tool calls"),
        ],
      },
    ],
  },
];

// ── runner ──────────────────────────────────────────────────────────────────
async function runScenario(sc: Scenario) {
  useItineraryStore.getState().reset();
  useVoiceStore.getState().reset();
  const now = dubaiNow();
  const s = new Session();
  await s.open(
    buildSystemPrompt({
      current_date: now.date,
      current_time: now.time,
      itinerary_snapshot: formatItinerarySnapshot(useItineraryStore.getState()),
    }),
  );
  const ctx = makeCtx();
  const out: Array<{ turn: Turn; checks: Check[] }> = [];
  try {
    for (const step of sc.steps) {
      ctx.mark();
      await new Promise((r) => setTimeout(r, Number(process.env.EVAL_PAUSE_MS ?? 12000)));
      const turn = await s.say(step.user);
      const checks = step.expect(turn, ctx);
      out.push({ turn, checks });
      console.log(`\n  👤 ${step.user}`);
      console.log(`  🔧 ${turn.calls.map((c) => `${c.name}${c.result.ok ? "" : "✗"}(${JSON.stringify(c.args)})`).join("\n     ") || "(no tools)"}`);
      console.log(`  🤖 ${turn.reply}  [${(turn.ms / 1000).toFixed(1)}s]`);
      for (const c of checks) console.log(`     ${c.ok ? "✅" : "❌"} ${c.label}`);
    }
  } finally {
    s.close();
  }
  return out;
}

async function main() {
  const filter = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const runs = Number(process.env.EVAL_RUNS ?? 1);
  const picked = SCENARIOS.filter((s) => !filter || s.id.includes(filter));
  const summary: Array<{ id: string; run: number; passed: number; total: number; failed: string[] }> = [];
  const log: unknown[] = [];

  for (const sc of picked) {
    for (let r = 1; r <= runs; r++) {
      console.log(`\n━━ ${sc.title}${runs > 1 ? ` (run ${r}/${runs})` : ""}`);
      try {
        const res = await runScenario(sc);
        const all = res.flatMap((x) => x.checks);
        summary.push({
          id: sc.id,
          run: r,
          passed: all.filter((c) => c.ok).length,
          total: all.length,
          failed: all.filter((c) => !c.ok).map((c) => c.label),
        });
        log.push({ scenario: sc.id, run: r, turns: res });
      } catch (err) {
        console.error(`  💥 ${String(err)}`);
        summary.push({ id: sc.id, run: r, passed: 0, total: 1, failed: [`crashed: ${String(err)}`] });
      }
    }
  }

  console.log("\n━━ Summary");
  let p = 0;
  let n = 0;
  for (const s of summary) {
    p += s.passed;
    n += s.total;
    console.log(`  ${s.failed.length === 0 ? "✅" : "❌"} ${s.id}${runs > 1 ? ` #${s.run}` : ""}: ${s.passed}/${s.total}${s.failed.length ? ` — ${s.failed.join("; ")}` : ""}`);
  }
  console.log(`  TOTAL ${p}/${n} checks`);
  mkdirSync("logs", { recursive: true });
  const file = join("logs", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ summary, log }, null, 2));
  console.log(`  transcript → ${file}`);
  process.exit(summary.every((s) => s.failed.length === 0) ? 0 : 1);
}

void main();
