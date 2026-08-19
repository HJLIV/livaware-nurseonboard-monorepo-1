// Shared time-driven building blocks for the film. All animation is a pure
// function of the milliseconds passed in — no springs, no wall-clock state.

import type { CSSProperties, ReactNode } from 'react';

import { clamp01, ease, lerp, seg } from '@/lib/anim';

export interface SceneProps {
  /** ms since this scene started */
  tl: number;
  /** scene duration in ms */
  dur: number;
  /** ms (scene-local) when narration starts */
  voStart: number;
  /** narration duration in ms */
  voDur: number;
  /** narration text (for beat scheduling) */
  text: string;
}

/** Fade+rise wrapper. Appears at `at`, over `d` ms. */
export function Rise({
  tl,
  at,
  d = 600,
  dy = 26,
  style,
  className,
  children,
}: {
  tl: number;
  at: number;
  d?: number;
  dy?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const p = seg(tl, at, d, ease.out);
  return (
    <div
      className={className}
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * dy}px)`,
        willChange: 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Word-by-word reveal for headlines. */
export function WordsIn({
  tl,
  at,
  text,
  stagger = 90,
  d = 520,
  dy = 30,
  className,
  style,
}: {
  tl: number;
  at: number;
  text: string;
  stagger?: number;
  d?: number;
  dy?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const words = text.split(' ');
  return (
    <span className={className} style={style}>
      {words.map((w, i) => {
        const p = seg(tl, at + i * stagger, d, ease.out);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * dy}px)`,
              marginRight: '0.28em',
              willChange: 'opacity, transform',
            }}
          >
            {w}
          </span>
        );
      })}
    </span>
  );
}

/** Gold letter-spaced eyebrow label. */
export function Eyebrow({
  children,
  size = 24,
  color = 'var(--color-gold)',
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: size,
        letterSpacing: '0.34em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** SVG path that draws on. Pass progress 0..1; requires pathLength=1 on the path via props spread. */
export function DrawPath({
  p,
  d,
  stroke = 'var(--color-teal)',
  strokeWidth = 2.5,
  fill = 'none',
  opacity = 1,
  dash,
  linecap = 'round',
}: {
  p: number;
  d: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  /** render as dashed line once drawn (e.g. '4 8') — uses a mask trick, so only for fully-drawn (p>=1) dashed looks */
  dash?: string;
  linecap?: 'round' | 'butt' | 'square';
}) {
  const pc = clamp01(p);
  if (dash && pc >= 1) {
    return (
      <path
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
        opacity={opacity}
        strokeDasharray={dash}
        strokeLinecap={linecap}
      />
    );
  }
  return (
    <path
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill={fill}
      opacity={opacity * (pc > 0 ? 1 : 0)}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - pc}
      strokeLinecap={linecap}
    />
  );
}

/** Simple opacity fade. */
export function Fade({
  tl,
  at,
  d = 500,
  out,
  outD = 400,
  style,
  className,
  children,
}: {
  tl: number;
  at: number;
  d?: number;
  /** optional time to fade back out */
  out?: number;
  outD?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  let o = seg(tl, at, d, ease.out);
  if (out != null) o = Math.min(o, 1 - seg(tl, out, outD, ease.inOut));
  return (
    <div className={className} style={{ opacity: o, ...style }}>
      {children}
    </div>
  );
}

/** Counter that fills like a meter (used sparingly). */
export function meterWidth(tl: number, at: number, d: number, max: number): number {
  return lerp(0, max, seg(tl, at, d, ease.inOut));
}

/** Blinking-free caret-style underline that draws left→right. */
export function Underline({
  tl,
  at,
  width,
  d = 700,
  color = 'var(--color-gold)',
  height = 3,
  style,
}: {
  tl: number;
  at: number;
  width: number;
  d?: number;
  color?: string;
  height?: number;
  style?: CSSProperties;
}) {
  const p = seg(tl, at, d, ease.inOut);
  return (
    <div
      style={{
        width: width * p,
        height,
        background: color,
        borderRadius: height,
        ...style,
      }}
    />
  );
}

/** Standard scene envelope: content fades in at start, out at the very end. */
export function sceneEnvelope(tl: number, dur: number, fadeIn = 500, fadeOut = 420): number {
  const a = clamp01(tl / fadeIn);
  const b = clamp01((dur - tl) / fadeOut);
  return Math.min(a, b);
}

/** Gold check / red cross marks for contrast tables. */
export function Mark({ ok, size = 30, p = 1 }: { ok: boolean; size?: number; p?: number }) {
  const c = ok ? 'var(--color-teal)' : 'var(--color-danger)';
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" style={{ flexShrink: 0 }}>
      {ok ? (
        <DrawPath p={p} d="M6 16 L13 23 L24 8" stroke={c} strokeWidth={3.2} />
      ) : (
        <>
          <DrawPath p={p} d="M8 8 L22 22" stroke={c} strokeWidth={3.2} />
          <DrawPath p={Math.max(0, p * 2 - 1)} d="M22 8 L8 22" stroke={c} strokeWidth={3.2} />
        </>
      )}
    </svg>
  );
}
