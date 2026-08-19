// Deterministic animation helpers — every visual is a pure function of the
// master-clock time `t` (ms), so the film can be rendered frame-by-frame.

import { useEffect, useRef, useState } from 'react';

import beatsData from '@/narration/beats.json';

/** Exact per-character speech times (ms into the chunk), keyed by narration text. */
const charTimesByText = new Map<string, number[]>(
  (beatsData as Array<{ text: string; charMs: number[] }>).map((d) => [d.text, d.charMs]),
);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const ease = {
  linear: (x: number) => x,
  in: (x: number) => x * x * x,
  out: (x: number) => 1 - Math.pow(1 - x, 3),
  inOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuint: (x: number) => 1 - Math.pow(1 - x, 5),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

/** Eased progress (0..1) of a window starting at `start` lasting `dur` (ms). */
export function seg(t: number, start: number, dur: number, e: (x: number) => number = ease.out): number {
  if (dur <= 0) return t >= start ? 1 : 0;
  return e(clamp01((t - start) / dur));
}

/** In → hold → out envelope. Returns 0..1. */
export function env(t: number, start: number, dur: number, fadeIn: number, fadeOut: number): number {
  const local = t - start;
  if (local <= 0 || local >= dur) return local === 0 ? 0 : local >= dur ? 0 : 0;
  const a = fadeIn > 0 ? clamp01(local / fadeIn) : 1;
  const b = fadeOut > 0 ? clamp01((dur - local) / fadeOut) : 1;
  return Math.min(a, b);
}

/**
 * The moment (ms on the master clock) a phrase is spoken. Uses the exact
 * ElevenLabs character alignment when available for this narration text,
 * falling back to a proportional character-offset estimate. Bias with
 * `offsetMs` when needed.
 */
export function beatAt(
  text: string,
  phrase: string,
  voStart: number,
  voDur: number,
  offsetMs = 0,
): number {
  const idx = text.indexOf(phrase);
  if (idx < 0) return voStart + offsetMs;
  const charMs = charTimesByText.get(text);
  if (charMs && idx < charMs.length) return voStart + charMs[idx] + offsetMs;
  return voStart + (idx / text.length) * voDur + offsetMs;
}

export interface RenderFlags {
  isRender: boolean;
  freezeMs: number | null;
}

export function readRenderFlags(): RenderFlags {
  if (typeof window === 'undefined') return { isRender: false, freezeMs: null };
  const q = new URLSearchParams(window.location.search);
  const isRender = q.get('render') === '1';
  const tParam = q.get('t');
  return { isRender, freezeMs: tParam != null ? Math.max(0, parseFloat(tParam)) : null };
}

declare global {
  interface Window {
    __setFrame?: (ms: number) => void;
    __renderReady?: boolean;
    __EB_TOTAL_MS?: number;
  }
}

export interface MasterClock {
  t: number;
  playing: boolean;
  isRender: boolean;
  restart: () => void;
}

/**
 * Master clock. Live mode: advances via rAF and loops. Render mode
 * (?render=1): frozen; frames are driven externally through
 * `window.__setFrame(ms)` (or a fixed `?t=` for single-frame inspection).
 */
export function useMasterClock(totalMs: number): MasterClock {
  const flagsRef = useRef<RenderFlags>(readRenderFlags());
  const { isRender, freezeMs } = flagsRef.current;
  const [t, setT] = useState<number>(isRender ? (freezeMs ?? 0) : 0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    window.__EB_TOTAL_MS = totalMs;
    if (isRender) {
      window.__setFrame = (ms: number) => setT(Math.max(0, Math.min(ms, totalMs)));
      const markReady = () => {
        window.__renderReady = true;
      };
      if (document.fonts?.ready) {
        document.fonts.ready.then(markReady);
      } else {
        markReady();
      }
      return () => {
        delete window.__setFrame;
      };
    }
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startRef.current) % totalMs;
      setT(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [totalMs, isRender]);

  const restart = () => {
    startRef.current = performance.now();
    setT(0);
  };

  return { t, playing: !isRender, isRender, restart };
}
