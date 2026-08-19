// Chapter 2 — The Excellence Delta: flat teal baseline vs rising gold curve.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

const CHIPS = ['Preserving dignity', 'Building trust', 'Elevating the journey'];

export function S2Delta({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);

  const axes = seg(tl, 200, 900, ease.inOut);
  const baselineAt = b('baseline expectation', -600);
  const baseline = seg(tl, baselineAt, 1300, ease.inOut);
  const curveAt = b('Above it rises', 0);
  const curve = seg(tl, curveAt, 2600, ease.inOut);
  const ticksAt = b('ten non-negotiable', 200);
  const chipsAt = b('preserving dignity', -350);

  // Chart geometry
  const x0 = 210;
  const y0 = 850; // baseline y
  const w = 1050;
  const curveTopY = 330;

  // gold curve: gentle exponential rise from baseline start to top right
  const curvePath = `M${x0} ${y0} C ${x0 + w * 0.38} ${y0 - 10}, ${x0 + w * 0.6} ${y0 - 190}, ${x0 + w * 0.78} ${y0 - 330} S ${x0 + w * 0.95} ${curveTopY + 40}, ${x0 + w} ${curveTopY}`;

  // 10 principle ticks along the curve (approximate positions along t param)
  const tickPts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const ft = 0.18 + (i / 9) * 0.82;
    // cheap param approximation of the cubic shape
    const px = x0 + w * ft;
    const rise = Math.pow(Math.max(0, (ft - 0.18) / 0.82), 1.9);
    const py = y0 - rise * (y0 - curveTopY) * 0.985;
    tickPts.push([px, py]);
  }

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 130 }}>
        <Rise tl={tl} at={150} d={600}>
          <Eyebrow>Chapter Two</Eyebrow>
        </Rise>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 74, color: 'var(--color-ink)', marginTop: 20 }}>
          <WordsIn tl={tl} at={420} stagger={110} text="The Excellence Delta" />
        </div>
      </div>

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" className="absolute inset-0">
        {/* axes */}
        <DrawPath p={axes} d={`M${x0} 300 V${y0} H${x0 + w + 60}`} stroke="rgba(232,228,223,0.35)" strokeWidth={2} />
        {/* baseline (teal, flat) */}
        <DrawPath p={baseline} d={`M${x0} ${y0 - 60} H${x0 + w + 20}`} stroke="var(--color-teal)" strokeWidth={4} />
        <text x={x0 + 6} y={y0 - 80} fill="var(--color-teal)" opacity={seg(tl, baselineAt + 700, 500) * 0.95} style={{ font: '600 24px var(--font-body)', letterSpacing: '0.14em' }}>
          CLINICAL COMPETENCE
        </text>
        <text x={x0 + 6} y={y0 + 40} fill="var(--color-muted)" opacity={seg(tl, baselineAt + 950, 500) * 0.9} style={{ font: '300 21px var(--font-body)' }}>
          the baseline expectation in healthcare
        </text>

        {/* hatched delta fill between curve and baseline */}
        <defs>
          <pattern id="hatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(200,169,110,0.28)" strokeWidth="1.5" />
          </pattern>
          <clipPath id="deltaClip">
            <rect x={x0} y={curveTopY - 10} width={(w + 10) * curve} height={y0 - 60 - (curveTopY - 10)} />
          </clipPath>
        </defs>
        <path
          d={`${curvePath} L ${x0 + w} ${y0 - 60} L ${x0} ${y0 - 60} Z`}
          fill="url(#hatch)"
          clipPath="url(#deltaClip)"
          opacity={0.85 * seg(tl, curveAt + 400, 800)}
        />

        {/* gold curve */}
        <DrawPath p={curve} d={curvePath} stroke="var(--color-gold)" strokeWidth={5} />
        {/* label along curve */}
        <text x={x0 + w * 0.47} y={y0 - 265} fill="var(--color-gold)" opacity={seg(tl, curveAt + 1500, 600) * 0.95} transform={`rotate(-24, ${x0 + w * 0.47}, ${y0 - 265})`} style={{ font: '600 25px var(--font-body)', letterSpacing: '0.13em' }}>
          THE LIVAWARE SERVICE PRINCIPLES
        </text>

        {/* 10 ticks */}
        {tickPts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={7} fill="var(--color-gold)" stroke="rgba(6,11,24,0.9)" strokeWidth={2} opacity={seg(tl, ticksAt + i * 110, 320, ease.outBack)} />
        ))}
        <text x={x0 + w * 0.52} y={y0 - 120} fill="var(--color-ink-soft)" opacity={seg(tl, ticksAt + 1250, 550) * 0.95} style={{ font: '400 23px var(--font-body)' }}>
          10 non-negotiable principles
        </text>

        {/* delta bracket at right edge */}
        <DrawPath p={seg(tl, curveAt + 2100, 700, ease.inOut)} d={`M${x0 + w + 42} ${curveTopY} V${y0 - 60}`} stroke="var(--color-gold)" strokeWidth={2} opacity={0.8} />
        <text x={x0 + w + 58} y={(curveTopY + y0 - 60) / 2 - 12} fill="var(--color-gold)" opacity={seg(tl, curveAt + 2400, 500)} style={{ font: '500 44px var(--font-serif)' }}>
          Δ
        </text>
      </svg>

      {/* right rail: the delta definition chips */}
      <div className="absolute" style={{ right: 150, top: 372, width: 400 }}>
        <Rise tl={tl} at={b('turn adequate care', -200)} d={650}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 27, lineHeight: 1.5, color: 'var(--color-ink-soft)' }}>
            Adequate care ends at the clinical intervention. <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>The Delta transforms the experience.</span>
          </div>
        </Rise>
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {CHIPS.map((c, i) => (
            <Rise key={c} tl={tl} at={chipsAt + i * 900} d={550} dy={18}>
              <div
                style={{
                  border: '1px solid rgba(200,169,110,0.45)',
                  background: 'rgba(13,21,48,0.72)',
                  borderRadius: 10,
                  padding: '16px 22px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: 25,
                  color: 'var(--color-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--color-gold)' }} />
                {c}
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </div>
  );
}
