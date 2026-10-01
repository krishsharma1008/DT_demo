/** The four journeys from the client brief, in presentation order. */
export const DEMO_LINES = [
  {
    step: "Plan my day",
    text: "We are near Downtown with two children, aged 8 and 12. We have today free and do not want much walking.",
  },
  {
    step: "Change one part",
    text: "My younger child does not want a museum. Can we do something indoors instead?",
  },
  {
    step: "Help me now",
    text: "We are tired. What can we do within 20 minutes from here?",
  },
  {
    step: "Take the next step",
    text: "Tell me more about that place. How do we get there?",
  },
] as const;

export type DemoLine = (typeof DEMO_LINES)[number];

/** Next demo line the visitor hasn't sent yet (after the latest one sent). */
export function nextDemoLine(userTexts: string[]): DemoLine | null {
  let lastIdx = -1;
  for (const t of userTexts) {
    const i = DEMO_LINES.findIndex((d) => d.text === t.trim());
    if (i > lastIdx) lastIdx = i;
  }
  if (lastIdx === -1) return null;
  return DEMO_LINES[lastIdx + 1] ?? null;
}
