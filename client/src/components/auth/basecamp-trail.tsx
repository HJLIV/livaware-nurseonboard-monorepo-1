/**
 * BasecampTrail — the Basecamp brand scene for the login screen.
 *
 * One continuous JOURNEY rendered as faux-3D animated SVG:
 *
 *   Act I — Around the mountain. The trail starts in the valley and wraps
 *   AROUND the peak like a real switchback route: bright where it crosses
 *   the front face, sliding behind the silhouette on the far side (only
 *   the shoulder it rounds past the edge stays visible, dimmed by
 *   distance), then re-emerging higher. Stops en route: Application →
 *   Documents (far side) → Compliance → Agreements (far side) →
 *   BASECAMP, a lit camp below the summit with tents, a flickering fire
 *   and the flag.
 *
 *   Act II — Beyond. After a breather at camp, the traveller crests the
 *   summit and the journey CONTINUES into the sky: a dotted route through
 *   floating waypoints — Training, Comprehension, Skills Arcade,
 *   Invoicing, Reflections — each igniting as the traveller passes.
 *
 * Depth cues that sell the 3D: far-side legs are dimmer/thinner and
 * occluded by the mountain body; one traveller is rendered twice (a
 * bright dot above the scene that hides on far-side legs, and a dim dot
 * layered UNDER the mountain that the silhouette occludes naturally);
 * contour rings wrap the cone; parallax ridges, drifting clouds and
 * valley mist layer the distance. The whole 26s loop is one shared
 * timeline, so stop pulses and feature ignitions fire exactly as the
 * traveller arrives.
 *
 * The composition keeps the peak right-of-centre: the login hero column
 * (eyebrow, heading, blurb, explainer video) owns the mid-left of the
 * panel, so labels live in the top sky band, the right rail and the
 * below-video strip.
 *
 * Pure SVG + CSS keyframes (all prefixed `btl-`): no dependencies, crisp
 * at any scale, honours prefers-reduced-motion (static, fully-lit scene).
 *
 *   <BasecampTrail />                    full scene (desktop brand panel)
 *   <BasecampTrail variant="mobile" />   compact strip (above the form)
 */

/** The ascent — onboarding stages along the wrap, ending AT Basecamp. */
export const WAYPOINTS: Array<{
  x: number;
  y: number;
  label: string;
  lx: number;
  ly: number;
  /** Accent waypoints render in gold (the destination). */
  accent?: boolean;
  /** Far-side stops render dimmed + end-anchored (depth cue). */
  back?: boolean;
}> = [
  { x: 480, y: 790, label: "Application", lx: 483, ly: 802 },
  { x: 622, y: 700, label: "Documents", lx: 610, ly: 666, back: true },
  { x: 505, y: 545, label: "Compliance", lx: 508, ly: 549 },
  { x: 615, y: 468, label: "Agreements", lx: 602, ly: 436, back: true },
  { x: 475, y: 350, label: "Basecamp", lx: 585, ly: 308, accent: true },
];

/** Act II — the journey beyond Basecamp, walked stop by stop. */
export const FEATURE_STARS: Array<{
  x: number;
  y: number;
  label: string;
  /** Label above (-1) or below (+1) the waypoint. */
  side: -1 | 1;
}> = [
  { x: 200, y: 250, label: "Training", side: 1 },
  { x: 300, y: 205, label: "Comprehension", side: -1 },
  { x: 400, y: 240, label: "Skills Arcade", side: 1 },
  { x: 495, y: 195, label: "Invoicing", side: -1 },
  { x: 585, y: 235, label: "Reflections", side: 1 },
];

/**
 * The full journey as ONE path (drives the traveller's offset-path).
 * Valley → front face → out past the right shoulder (Documents) → behind
 * the mountain → pokes past the LEFT shoulder → front face (Compliance) →
 * out right again (Agreements) → behind → left shoulder → camp → crest →
 * sky route through the five feature stops.
 *
 * The ascent is a centripetal Catmull-Rom spline (tangent-continuous at
 * every stop and shoulder, so the wrap has no kinks), generated together
 * with the SEG window fractions below by /tmp-style script so the bright
 * legs hand over to the dim legs EXACTLY on the silhouette edges.
 */
const FULL_D = [
  "M 285 832",
  "C 285 832 421.1 805 480 790",
  "C 529.7 777.4 597 772.5 616 750",
  "C 627.3 736.6 631.8 711.6 622 700",
  "C 602.9 677.3 487.7 701.6 430 690",
  "C 379.9 679.9 294.8 661.3 294 641",
  "C 293 615.3 470.4 576 505 545",
  "C 520.9 530.8 516.5 514.7 530 503",
  "C 548.6 487 616 476.7 615 468",
  "C 613.8 458.1 535.9 456 496 450",
  "C 455.6 444 378.4 448.2 374 432",
  "C 369.4 415.4 475 350 475 350",
  "C 468 320 458 290 450 262",
  "C 390 310 280 290 200 250",
  "C 230 220 260 208 300 205",
  "C 335 212 370 228 400 240",
  "C 430 228 460 208 495 195",
  "C 525 205 555 220 585 235",
].join(" ");

/** Sky route only (painted dotted; ignites as the traveller flies it). */
const BEYOND_D = [
  "M 475 350",
  "C 468 320 458 290 450 262",
  "C 390 310 280 290 200 250",
  "C 230 220 260 208 300 205",
  "C 335 212 370 228 400 240",
  "C 430 228 460 208 495 195",
  "C 525 205 555 220 585 235",
].join(" ");

/**
 * Segment windows as % of total path length (pathLength=100). Front legs
 * paint bright; far-side legs paint dim; the dasharray "0 a len rest"
 * trick paints just that window of the shared path, so the traveller and
 * the painted trail can never drift apart.
 */
const SEG = { f1: [0, 15.1], b1: [15.1, 34], f2: [34, 45.1], b2: [45.1, 62.2], f3: [62.2, 65.85] } as const;
const win = ([a, b]: readonly [number, number]) => (a === 0 ? `${b} ${100 - b}` : `0 ${a} ${b - a} ${100 - b}`);

/** Shared 26s timeline (%). Trek is linear over distance, dwell at camp. */
const ARRIVE_CAMP = 62; // traveller reaches Basecamp (dwells 5% ≈ 1.3s)
const STOP_PULSE_T = [8.25, 16.45, 40.35, 46.3]; // Application, Documents, Compliance, Agreements
const FEATURE_T = [80.8, 85.2, 89.35, 93.45, 97.3]; // ignition as the traveller passes

const CSS = `
@keyframes btl-trek{0%{offset-distance:0%}${ARRIVE_CAMP}%{offset-distance:65.85%}${ARRIVE_CAMP + 5}%{offset-distance:65.85%}97.3%{offset-distance:100%}100%{offset-distance:100%}}
@keyframes btl-vis{0%,13.4%{opacity:1}15%,31.2%{opacity:0}32.9%,41.6%{opacity:1}43.3%,57.7%{opacity:0}59.4%,100%{opacity:1}}
@keyframes btl-pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@keyframes btl-fade{0%{opacity:0;transform:translateY(5px)}100%{opacity:1;transform:translateY(0)}}
@keyframes btl-wave{0%,100%{transform:skewY(0deg)}50%{transform:skewY(-6deg)}}
@keyframes btl-flick{0%,100%{opacity:.8;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
@keyframes btl-glow{0%,100%{opacity:.22;transform:scale(1)}50%{opacity:.5;transform:scale(1.25)}}
@keyframes btl-twinkle{0%,100%{opacity:.15}50%{opacity:.85}}
@keyframes btl-drift{0%{transform:translateX(0)}50%{transform:translateX(16px)}100%{transform:translateX(0)}}
@keyframes btl-drift-far{0%{transform:translateX(0)}50%{transform:translateX(-9px)}100%{transform:translateX(0)}}
@keyframes btl-mist{0%,100%{transform:translateX(0);opacity:.1}50%{transform:translateX(22px);opacity:.2}}
@keyframes btl-arrive{0%,${ARRIVE_CAMP - 1.5}%{transform:scale(.3);opacity:0}${ARRIVE_CAMP}%{opacity:.6}${ARRIVE_CAMP + 5}%{transform:scale(3);opacity:0}100%{transform:scale(3);opacity:0}}
@keyframes btl-link26{0%,${ARRIVE_CAMP + 5}%{stroke-dashoffset:1}97.3%,100%{stroke-dashoffset:0}}
${STOP_PULSE_T.map(
  (t, i) =>
    `@keyframes btl-halo${i}{0%,${t - 1.5}%{transform:scale(.3);opacity:0}${t}%{opacity:.5}${t + 4.5}%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}`,
).join("\n")}
${FEATURE_T.map(
  (t, i) =>
    `@keyframes btl-fstar${i}{0%,${t - 1.5}%{transform:scale(0);opacity:0}${t}%{transform:scale(1.6);opacity:1}${Math.min(t + 2.5, 99.5)}%{transform:scale(1)}100%{transform:scale(1);opacity:1}}`,
).join("\n")}
${FEATURE_T.map(
  (t, i) => `@keyframes btl-flab${i}{0%,${t}%{opacity:0}${Math.min(t + 2, 99.5)}%{opacity:.95}100%{opacity:.95}}`,
).join("\n")}
@media (prefers-reduced-motion:reduce){
  .btl-pop,.btl-fade,.btl-wave,.btl-flick,.btl-glow,.btl-twinkle,.btl-drift,
  .btl-drift-far,.btl-mist,.btl-trek,.btl-vis,.btl-halo,.btl-fstar,
  .btl-flab,.btl-link26,.btl-draw{animation:none!important}
  text.btl-fade{opacity:1!important;transform:none!important}
  .btl-fstar{opacity:1!important;transform:none!important}
  .btl-flab{opacity:.95!important}
  .btl-link26,.btl-draw{stroke-dashoffset:0!important}
  .btl-halo,.btl-back{opacity:0!important}
}
`;

export function BasecampTrail({
  variant = "panel",
  className = "",
}: {
  variant?: "panel" | "mobile";
  /** Layout/positioning classes from the caller (e.g. absolute inset-0). */
  className?: string;
}) {
  if (variant === "mobile") {
    return (
      <svg
        viewBox="0 0 640 240"
        className={`h-full w-full ${className}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="The journey to Basecamp: application, documents and compliance climb around a summit camp, and the route continues beyond through Basecamp's features"
      >
        <style>{CSS}</style>
        {/* sky */}
        {[
          [70, 40], [150, 24], [250, 34], [330, 18], [420, 30], [570, 20],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.3" fill="#F0ECE4" opacity="0.4"
            className="btl-twinkle" style={{ animation: `btl-twinkle ${2 + i * 0.5}s ease-in-out ${i * 0.4}s infinite` }} />
        ))}
        {/* the journey beyond — dotted route through three sky stops */}
        <path d="M 478 42 C 495 38 505 44 515 48 L 555 36 L 598 46" fill="none" stroke="#C8A96E" strokeWidth="1" opacity="0.45"
          strokeDasharray="1.5 4" strokeLinecap="round" />
        {[[515, 48], [555, 36], [598, 46]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.4" fill="#C8A96E" className="btl-fstar"
            style={{ transformOrigin: `${x}px ${y}px`, animation: `btl-fstar${i} 14s linear infinite` }} />
        ))}
        {/* mountain */}
        <path d="M 150 236 L 470 46 L 640 236 Z" fill="#141448" />
        <path d="M 440 72 L 470 46 L 500 72 C 488 65 478 69 470 62 C 462 68 450 64 440 72 Z" fill="#F0ECE4" opacity="0.9" />
        {/* trail (front) with a far-side dip behind the peak */}
        <path d="M 200 224 L 440 130 L 260 84 L 470 46" fill="none" stroke="#F0ECE4" strokeOpacity="0.22" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
        <path d="M 200 224 L 440 130 L 260 84 L 470 46" fill="none" stroke="#C8A96E" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round"
          pathLength={1} className="btl-draw" style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "btl-draw-m 2.4s ease-out .3s forwards" }} />
        <style>{`@keyframes btl-draw-m{to{stroke-dashoffset:0}}`}</style>
        {/* waypoints */}
        {([
          { x: 200, y: 224, label: "Application", lx: 212, ly: 228 },
          { x: 440, y: 130, label: "Documents", lx: 452, ly: 134 },
          { x: 260, y: 84, label: "Compliance", lx: 272, ly: 88 },
        ]).map((w, i) => (
          <g key={w.label}>
            <circle cx={w.x} cy={w.y} r="3" fill="#C8A96E" className="btl-pop"
              style={{ transformOrigin: `${w.x}px ${w.y}px`, animation: `btl-pop .5s cubic-bezier(.34,1.56,.64,1) ${0.7 + i * 0.28}s both` }} />
            <text x={w.lx} y={w.ly} fontSize="11" fill="#F0ECE4" opacity="0" letterSpacing="0.08em" className="btl-fade"
              style={{ animation: `btl-fade .6s ease-out ${0.9 + i * 0.28}s forwards`, fontFamily: "inherit" }}>
              {w.label}
            </text>
          </g>
        ))}
        {/* summit: flag + Basecamp wordmark */}
        <line x1="470" y1="46" x2="470" y2="28" stroke="#F0ECE4" strokeWidth="1.5" />
        <path d="M 470 28 L 486 32.5 L 470 37 Z" fill="#C8A96E" className="btl-wave"
          style={{ transformOrigin: "470px 28px", animation: "btl-wave 2.4s ease-in-out infinite" }} />
        <text x="482" y="58" fontSize="12" fontWeight="600" fill="#C8A96E" letterSpacing="0.14em"
          style={{ fontFamily: "inherit", textTransform: "uppercase" }}>BASECAMP</text>
        {/* traveller + trailhead tent (own keyframes: dwell at the flag) */}
        <style>{`@keyframes btl-trek-m{0%{offset-distance:0%}58%{offset-distance:83.5%}66%{offset-distance:83.5%}96%{offset-distance:100%}100%{offset-distance:100%}}`}</style>
        <circle r="3" fill="#E9D9AF" className="btl-trek"
          style={{ offsetPath: `path("M 200 224 L 440 130 L 260 84 L 470 46 C 495 38 505 44 515 48 L 555 36 L 598 46")`, offsetRotate: "0deg", animation: "btl-trek-m 14s linear infinite" }} />
        <path d="M 168 230 l 12 -16 l 12 16 Z" fill="#C8A96E" opacity="0.9" />
        <path d="M 177 230 l 3 -4.5 l 3 4.5 Z" fill="#020121" />
      </svg>
    );
  }

  // ---------------------------------------------------------------- panel
  return (
    <svg
      viewBox="0 0 640 1000"
      className={`h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="The journey to Basecamp: onboarding stages wrap around a mountain to the summit camp, then the route continues beyond through Training, Comprehension, Skills Arcade, Invoicing and Reflections"
    >
      <style>{CSS}</style>
      <defs>
        <linearGradient id="btl-mount" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1d1d58" />
          <stop offset="0.55" stopColor="#141448" />
          <stop offset="1" stopColor="#0e0e3d" />
        </linearGradient>
      </defs>

      {/* ------------------------------------------------------------ sky */}
      {([
        [95, 250], [150, 240], [410, 165], [345, 160], [540, 160],
        [625, 300], [70, 330], [200, 325],
      ] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#F0ECE4"
          className="btl-twinkle" style={{ animation: `btl-twinkle ${2 + (i % 4) * 0.7}s ease-in-out ${i * 0.45}s infinite` }} />
      ))}
      <circle cx="598" cy="178" r="16" fill="#F0ECE4" opacity="0.85" />
      <circle cx="605" cy="173" r="14" fill="#0d0d38" />

      {/* -------------------------- far-side legs + far traveller (occluded) */}
      {/* (butt caps: the "0 a len rest" window trick must not paint cap dots) */}
      <path d={FULL_D} fill="none" stroke="#C8A96E" strokeOpacity="0.35" strokeWidth="1.3"
        pathLength={100} strokeDasharray={win(SEG.b1)} />
      <path d={FULL_D} fill="none" stroke="#C8A96E" strokeOpacity="0.35" strokeWidth="1.3"
        pathLength={100} strokeDasharray={win(SEG.b2)} />
      <circle r="3" fill="#C8A96E" opacity="0.55" className="btl-trek btl-back"
        style={{ offsetPath: `path("${FULL_D}")`, offsetRotate: "0deg", animation: "btl-trek 26s linear infinite" }} />

      {/* ------------------------------------------- parallax ridges behind */}
      <g className="btl-drift-far" style={{ animation: "btl-drift-far 44s ease-in-out infinite" }}>
        <path d="M 0 700 L 110 600 L 230 668 L 340 575 L 470 655 L 640 560 L 640 1000 L 0 1000 Z" fill="#101045" opacity="0.85" />
      </g>

      {/* --------------------------------------------------- the mountain */}
      <path d="M 140 1000 C 280 740 370 500 450 278 C 525 480 600 700 700 1000 Z" fill="url(#btl-mount)" />
      {/* contour rings wrapping the cone (depth) */}
      {([
        [460, 448, 62, 10], [620, 442, 130, 17], [780, 436, 200, 23],
      ] as const).map(([cy, cx, rx, ry], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#F0ECE4" strokeOpacity="0.09"
          strokeWidth="1" strokeDasharray="3 6" />
      ))}
      {/* snowcap */}
      <path d="M 421 320 C 432 302 442 288 450 278 C 459 290 470 304 480 322 C 469 314 462 320 454 312 C 446 320 434 314 421 320 Z"
        fill="#F0ECE4" opacity="0.92" />
      {/* ghost of the hidden route through the body */}
      <path d={FULL_D} fill="none" stroke="#F0ECE4" strokeOpacity="0.07" strokeWidth="1.2" strokeDasharray="1 5" />

      {/* -------------------------------------- clouds crossing IN FRONT */}
      <g className="btl-drift" style={{ animation: "btl-drift 30s ease-in-out infinite" }}>
        <ellipse cx="545" cy="610" rx="60" ry="9" fill="#F0ECE4" opacity="0.07" />
        <ellipse cx="592" cy="600" rx="38" ry="7" fill="#F0ECE4" opacity="0.06" />
      </g>
      <g className="btl-drift" style={{ animation: "btl-drift 38s ease-in-out 8s infinite" }}>
        <ellipse cx="505" cy="500" rx="48" ry="8" fill="#F0ECE4" opacity="0.05" />
      </g>

      {/* -------------------------------------------- front legs (bright) */}
      {([SEG.f1, SEG.f2, SEG.f3] as const).map((s, i) => (
        <path key={i} d={FULL_D} fill="none" stroke="#C8A96E" strokeWidth="2.2"
          pathLength={100} strokeDasharray={win(s)} />
      ))}

      {/* ------------------------------------------------- valley mist */}
      <ellipse cx="400" cy="845" rx="260" ry="22" fill="#F0ECE4" className="btl-mist"
        style={{ animation: "btl-mist 18s ease-in-out infinite" }} />

      {/* --------------------------- the journey beyond (dotted sky route) */}
      <path d={BEYOND_D} fill="none" stroke="#C8A96E" strokeOpacity="0.18" strokeWidth="1.4"
        strokeDasharray="0.5 4" strokeLinecap="round" pathLength={100} />
      <path d={BEYOND_D} fill="none" stroke="#C8A96E" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round"
        pathLength={1} strokeDasharray={1} className="btl-link26"
        style={{ animation: "btl-link26 26s linear infinite" }} />
      {FEATURE_STARS.map((s, i) => (
        <g key={s.label}>
          {/* floating ledge */}
          <ellipse cx={s.x} cy={s.y + 9} rx="15" ry="3.5" fill="#1e1e5a" stroke="#C8A96E" strokeOpacity="0.35"
            strokeWidth="0.7" className="btl-flab" style={{ animation: `btl-flab${i} 26s linear infinite` }} />
          <g className="btl-fstar"
            style={{ transformOrigin: `${s.x}px ${s.y}px`, animation: `btl-fstar${i} 26s linear infinite` }}>
            <circle cx={s.x} cy={s.y} r="7" fill="#C8A96E" opacity="0.18" />
            <circle cx={s.x} cy={s.y} r="3.2" fill="#C8A96E" />
          </g>
          <text x={s.x} y={s.side === 1 ? s.y + 26 : s.y - 16} fontSize="12.5" fill="#F0ECE4" letterSpacing="0.1em"
            textAnchor="middle" className="btl-flab"
            style={{ animation: `btl-flab${i} 26s linear infinite`, fontFamily: "inherit" }}>
            {s.label}
          </text>
        </g>
      ))}

      {/* --------------------------------- ascent stops: dots, labels, pulses */}
      {WAYPOINTS.map((w, i) => (
        <g key={w.label}>
          {!w.accent && (
            <circle cx={w.x} cy={w.y} r="8" fill="#C8A96E" opacity="0" className="btl-halo"
              style={{ transformOrigin: `${w.x}px ${w.y}px`, animation: `btl-halo${i} 26s linear infinite` }} />
          )}
          <circle cx={w.x} cy={w.y} r={w.accent ? 5 : w.back ? 2.6 : 3.5} fill="#C8A96E"
            opacity={w.back ? 0.75 : 1} className="btl-pop"
            style={{ transformOrigin: `${w.x}px ${w.y}px`, animation: `btl-pop .5s cubic-bezier(.34,1.56,.64,1) ${0.8 + i * 0.32}s both` }} />
          <text
            x={w.accent || w.back ? w.lx : w.lx + 12}
            y={w.ly + 4}
            fontSize={w.accent ? 15 : w.back ? 12 : 13}
            fontWeight={w.accent ? 600 : 400}
            fill={w.accent ? "#C8A96E" : w.back ? "#A9A9C8" : "#F0ECE4"}
            opacity={w.accent ? 1 : 0}
            textAnchor={w.accent || w.back ? "end" : "start"}
            letterSpacing="0.1em"
            className={w.accent ? undefined : "btl-fade"}
            style={{
              fontFamily: "inherit",
              textTransform: w.accent ? "uppercase" : "none",
              animation: w.accent ? undefined : `btl-fade .6s ease-out ${1 + i * 0.32}s forwards`,
            }}
          >
            {w.label}
          </text>
        </g>
      ))}

      {/* ------------------------- Basecamp: ledge, tents, fire, flag, burst */}
      <line x1="452" y1="354" x2="518" y2="354" stroke="#F0ECE4" strokeOpacity="0.25" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="475" cy="350" r="10" fill="#C8A96E" opacity="0" className="btl-halo"
        style={{ transformOrigin: "475px 350px", animation: "btl-arrive 26s linear infinite" }} />
      <circle cx="492" cy="348" r="6" fill="#C8A96E" className="btl-glow"
        style={{ transformOrigin: "492px 348px", animation: "btl-glow 1.6s ease-in-out infinite" }} />
      <path d="M 456 352 l 9 -13 l 9 13 Z" fill="#C8A96E" opacity="0.9" />
      <path d="M 463 352 l 2.4 -3.6 l 2.4 3.6 Z" fill="#020121" />
      <path d="M 500 353 l 8 -11 l 8 11 Z" fill="#F0ECE4" opacity="0.55" />
      <path d="M 489 351 l 3 -5.5 l 3 5.5 Z" fill="#C8A96E" className="btl-flick"
        style={{ transformOrigin: "492px 348px", animation: "btl-flick 1.2s ease-in-out infinite" }} />
      <line x1="475" y1="350" x2="475" y2="322" stroke="#F0ECE4" strokeWidth="2" />
      <path d="M 475 322 L 497 328.5 L 475 335 Z" fill="#C8A96E" className="btl-wave"
        style={{ transformOrigin: "475px 322px", animation: "btl-wave 2.4s ease-in-out infinite" }} />

      {/* ------------------------------- the traveller (bright, front legs) */}
      <g className="btl-vis" style={{ animation: "btl-vis 26s linear infinite" }}>
        <circle r="9" fill="#C8A96E" opacity="0.25" className="btl-trek"
          style={{ offsetPath: `path("${FULL_D}")`, offsetRotate: "0deg", animation: "btl-trek 26s linear infinite" }} />
        <circle r="4.5" fill="#E9D9AF" className="btl-trek"
          style={{ offsetPath: `path("${FULL_D}")`, offsetRotate: "0deg", animation: "btl-trek 26s linear infinite" }} />
      </g>

      {/* --------------------------------- trailhead camp: tent + pine */}
      <path d="M 243 828 l 12 -16 l 12 16 Z" fill="#C8A96E" opacity="0.9" />
      <path d="M 252 828 l 3 -4.5 l 3 4.5 Z" fill="#020121" />
      <path d="M 216 824 l 8 -12 l 8 12 Z M 218.5 815 l 5.5 -8 l 5.5 8 Z" fill="#1a1a4e" />
    </svg>
  );
}
