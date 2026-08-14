"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, PartyPopper, CalendarDays, Compass, X } from "lucide-react";

export interface TourStep {
  /** CSS selector for the element to highlight (e.g. `[data-tour="upload"]`) */
  selector: string;
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

/**
 * A two-phase first-run experience:
 *  1. a "you're good to go" welcome popup (with the batch start date), then
 *  2. an interactive spotlight tour that walks through the page's key controls.
 *
 * `onFinish` is called once, whether the user completes or skips — the caller
 * persists that so it never shows again.
 */
export function WelcomeGuide({
  steps,
  batchStartsLabel,
  onFinish,
}: {
  steps: TourStep[];
  batchStartsLabel: string;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<"welcome" | "tour">("welcome");
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const finishedRef = useRef(false);

  // Resolve the visible steps once (skip any whose target isn't on the page)
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(steps);
  useEffect(() => {
    if (phase !== "tour") return;
    setVisibleSteps(steps.filter(s => document.querySelector(s.selector)));
  }, [phase, steps]);

  const step = visibleSteps[stepIndex];

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }

  // Keep the spotlight glued to the target across smooth-scroll / resize
  useEffect(() => {
    if (phase !== "tour" || !step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) { setStepIndex(i => Math.min(i + 1, visibleSteps.length - 1)); return; }

    el.scrollIntoView({ block: "center", behavior: "smooth" });

    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [phase, step, stepIndex, visibleSteps.length]);

  // Escape closes the whole thing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Phase 1: welcome popup ──────────────────────────────────────────
  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elev/95 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-xl">
              <PartyPopper className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-fg leading-tight">You&apos;re good to go! 🎉</h3>
              <p className="text-sm text-fg-muted mt-1">Your account is all set up and ready.</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3">
            <CalendarDays className="h-5 w-5 text-sky-500 shrink-0" />
            <div className="text-sm">
              <span className="text-fg-muted">Your batch starts on </span>
              <span className="font-semibold text-fg">{batchStartsLabel}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={finish}
              className="rounded-full border border-border px-4 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => { setStepIndex(0); setPhase("tour"); }}
              className="flex items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-xs font-semibold text-bg hover:bg-fg/90 transition-colors"
            >
              <Compass className="h-3.5 w-3.5" />Show me around
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Phase 2: spotlight tour ─────────────────────────────────────────
  if (!step || !rect) return null;

  const pad = 8;
  const spotTop = rect.top - pad;
  const spotLeft = rect.left - pad;
  const spotW = rect.width + pad * 2;
  const spotH = rect.height + pad * 2;

  // Place the card below the target if there's room, else above.
  const cardW = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = spotTop + spotH + 180 < vh;
  const cardTop = below ? spotTop + spotH + 12 : Math.max(12, spotTop - 12 - 170);
  const cardLeft = Math.min(Math.max(12, spotLeft), vw - cardW - 12);

  const isLast = stepIndex === visibleSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[11000]">
      {/* Spotlight: transparent box with a giant shadow dims everything else */}
      <motion.div
        initial={false}
        animate={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className="absolute rounded-xl"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.68)", border: "2px solid var(--fg)" }}
      />

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="absolute w-[320px] rounded-2xl border border-border bg-bg-elev/95 p-4 shadow-2xl backdrop-blur-xl"
          style={{ top: cardTop, left: cardLeft }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-fg-dim font-semibold">
              Step {stepIndex + 1} of {visibleSteps.length}
            </span>
            <button onClick={finish} aria-label="Close tour"
              className="text-fg-dim hover:text-fg transition-colors -mt-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-fg">{step.title}</h4>
          <p className="mt-1 text-xs text-fg-muted leading-relaxed">{step.body}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1">
              {visibleSteps.map((_, i) => (
                <span key={i} className={i === stepIndex ? "h-1.5 w-4 rounded-full bg-fg" : "h-1.5 w-1.5 rounded-full bg-border"} />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {stepIndex > 0 && (
                <button onClick={() => setStepIndex(i => i - 1)}
                  className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors">
                  <ArrowLeft className="h-3 w-3" />Back
                </button>
              )}
              <button
                onClick={() => { if (isLast) finish(); else setStepIndex(i => i + 1); }}
                className="flex items-center gap-1 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg hover:bg-fg/90 transition-colors"
              >
                {isLast ? "Done" : "Next"}{!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
