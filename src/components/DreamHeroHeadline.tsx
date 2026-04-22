"use client";

import { useEffect, useState } from "react";
import { dreamHeadlineFont } from "@/lib/fonts";

const PHRASES = [
  "你昨晚梦到了什么？",
  "有没有什么有趣的梦？",
  "还记得梦里的光吗？",
  "醒来先记一段碎片也好。",
];

const TYPE_MS = 88;
const DELETE_MS = 52;
const PAUSE_AFTER_TYPE_MS = 2400;
const PAUSE_BEFORE_DELETE_MS = 380;

type Phase = "typing" | "pause" | "deleting";

export default function DreamHeroHeadline() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  const full = PHRASES[phraseIndex];

  useEffect(() => {
    if (phase !== "typing") return;
    let id: ReturnType<typeof setTimeout>;
    if (displayText.length < full.length) {
      id = setTimeout(() => {
        setDisplayText(full.slice(0, displayText.length + 1));
      }, TYPE_MS);
    } else {
      id = setTimeout(() => setPhase("pause"), PAUSE_AFTER_TYPE_MS);
    }
    return () => clearTimeout(id);
  }, [phase, displayText, full, phraseIndex]);

  useEffect(() => {
    if (phase !== "pause") return;
    const id = setTimeout(() => setPhase("deleting"), PAUSE_BEFORE_DELETE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "deleting") return;
    let id: ReturnType<typeof setTimeout>;
    if (displayText.length > 0) {
      id = setTimeout(() => setDisplayText((t) => t.slice(0, -1)), DELETE_MS);
    } else {
      id = setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
        setPhase("typing");
      }, 180);
    }
    return () => clearTimeout(id);
  }, [phase, displayText]);

  return (
    <h2
      className={`${dreamHeadlineFont.className} mb-2 flex min-h-[2.75rem] flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[1.65rem] font-light leading-snug tracking-wide sm:text-[1.85rem]`}
      aria-live="polite"
    >
      <span className="bg-gradient-to-br from-white via-white/95 to-indigo-200/80 bg-clip-text text-transparent">
        {displayText}
      </span>
      <span
        className="dream-hero-cursor inline-block h-[1.32em] w-[2px] shrink-0 self-center rounded-sm bg-indigo-400/90 shadow-[0_0_8px_rgba(129,140,248,0.6)]"
        aria-hidden
      />
    </h2>
  );
}
