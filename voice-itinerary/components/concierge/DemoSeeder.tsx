"use client";

import { useEffect, useRef } from "react";
import { demoStepFromQuery, seedDemo } from "@/lib/demo/seed";

/** Hydrates a sample family day when the URL carries ?demo=… (presenters). */
export function DemoSeeder() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const step = demoStepFromQuery(window.location.search);
    if (step) seedDemo(step);
  }, []);
  return null;
}
