// Chapter 1 — Title: blueprint floor plan draws on, medical cross at its
// heart, then the Aristotle epigraph.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

export function S1Title({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);

  // floor plan draw begins immediately during the lead-in
  const plan = seg(tl, 120, 2400, ease.inOut);
  const cross = seg(tl, 1500, 1200, ease.inOut);
  const crossGlow = seg(tl, 2600, 900, ease.out);
  const quoteAt = b('We are what we repeatedly do', -300);
  const closeAt = b('This is the blueprint', -150);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      {/* centered floor plan, right of the title block */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" className="absolute inset-0">
        <g transform="translate(1178, 210)" opacity={0.95}>
          {/* outer residence outline */}
          <DrawPath
            p={plan}
            d="M40 60 H560 V200 H620 V480 H420 V560 H120 V440 H40 Z"
            stroke="var(--color-teal)"
            strokeWidth={3}
            opacity={0.75}
          />
          {/* interior walls */}
          <DrawPath p={seg(tl, 600, 2000, ease.inOut)} d="M40 250 H240 M240 60 V250" stroke="var(--color-teal)" strokeWidth={2} opacity={0.45} />
          <DrawPath p={seg(tl, 900, 2000, ease.inOut)} d="M420 200 V480 M240 440 H420" stroke="var(--color-teal)" strokeWidth={2} opacity={0.45} />
          <DrawPath p={seg(tl, 1200, 1600, ease.inOut)} d="M120 440 H40 M560 200 H420" stroke="var(--color-teal)" strokeWidth={2} opacity={0.45} />
          {/* door arcs */}
          <DrawPath p={seg(tl, 1600, 1200, ease.out)} d="M240 130 A70 70 0 0 1 310 60" stroke="var(--color-gold)" strokeWidth={2} opacity={0.6} />
          <DrawPath p={seg(tl, 1900, 1200, ease.out)} d="M330 440 A64 64 0 0 0 266 376" stroke="var(--color-gold)" strokeWidth={2} opacity={0.6} />
          {/* corner dots */}
          {[
            [40, 60], [560, 60], [620, 200], [620, 480], [420, 560], [120, 560],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y === 560 && x === 420 ? 560 : y} r={5} fill="var(--color-gold)" opacity={seg(tl, 2100 + i * 90, 350, ease.out) * 0.9} />
          ))}
          {/* medical cross at the heart */}
          <g transform="translate(330, 300)">
            <circle r={86} fill="none" stroke="var(--color-gold)" strokeWidth={1.5} opacity={crossGlow * 0.5} />
            <circle r={86 + 14 * crossGlow} fill="none" stroke="var(--color-gold)" strokeWidth={1} opacity={crossGlow * 0.22} />
            <DrawPath
              p={cross}
              d="M-22 -62 H22 V-22 H62 V22 H22 V62 H-22 V22 H-62 V-22 H-22 Z"
              stroke="var(--color-gold)"
              strokeWidth={3.5}
              fill={`rgba(200,169,110,${0.14 * crossGlow})`}
            />
          </g>
          {/* leader line + label */}
          <DrawPath p={seg(tl, 2800, 700, ease.inOut)} d="M330 386 V470 H210" stroke="var(--color-teal)" strokeWidth={1.5} opacity={0.65} />
          <text x={205} y={476} textAnchor="end" fill="var(--color-teal)" opacity={seg(tl, 3400, 500) * 0.85} style={{ font: '500 19px var(--font-body)', letterSpacing: '0.18em' }}>
            CARE AT THE HEART
          </text>
        </g>
      </svg>

      {/* title block */}
      <div className="absolute" style={{ left: 150, top: 268, width: 900 }}>
        <Rise tl={tl} at={350} d={700}>
          <Eyebrow>The Livaware Field Guide</Eyebrow>
        </Rise>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 420,
            fontSize: 108,
            lineHeight: 1.04,
            color: 'var(--color-ink)',
            marginTop: 34,
            letterSpacing: '-0.01em',
          }}
        >
          <WordsIn tl={tl} at={900} stagger={130} d={620} text="The Anatomy" />
          <br />
          <WordsIn tl={tl} at={1250} stagger={130} d={620} text="of Excellence" />
        </div>
        <Rise tl={tl} at={b('world-class', -200)} d={650}>
          <div
            style={{
              marginTop: 38,
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 33,
              color: 'var(--color-ink-soft)',
              letterSpacing: '0.02em',
            }}
          >
            A field guide to world-class in-residence care
          </div>
        </Rise>
      </div>

      {/* Aristotle epigraph */}
      <Rise tl={tl} at={quoteAt} d={800} dy={20} style={{ position: 'absolute', left: 150, top: 790, width: 1100 }}>
        <div style={{ display: 'flex', gap: 26 }}>
          <div style={{ width: 4, borderRadius: 4, background: 'var(--color-gold)', opacity: 0.85 }} />
          <div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontWeight: 380,
                fontSize: 36,
                lineHeight: 1.42,
                color: 'var(--color-gold)',
              }}
            >
              “We are what we repeatedly do. Excellence, therefore,
              <br />
              is not an act, but a habit.”
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 21,
                letterSpacing: '0.3em',
                color: 'var(--color-muted)',
              }}
            >
              — ARISTOTLE
            </div>
          </div>
        </div>
      </Rise>

      {/* closing beat: subtle gold rule under subtitle */}
      <div className="absolute" style={{ left: 150, top: 742 }}>
        <div
          style={{
            width: 560 * seg(tl, closeAt, 900, ease.inOut),
            height: 2,
            background: 'linear-gradient(90deg, var(--color-gold), rgba(200,169,110,0))',
            opacity: 0.8,
          }}
        />
      </div>
    </div>
  );
}
