// Chapter 3 — The Architecture of Premium Care: three pillar cards build up,
// then the minimum-standard banner.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

const PILLARS = [
  {
    numeral: 'I',
    title: 'Professional Foundation',
    items: ['Immaculate Presentation', 'Uncompromising Reliability', 'Absolute Discretion'],
    phrase: 'professional foundation',
  },
  {
    numeral: 'II',
    title: 'Patient Interaction',
    items: ['Communication', 'Sovereign Territory', 'Anticipation', 'Beyond Expectations'],
    phrase: 'Patient interaction',
  },
  {
    numeral: 'III',
    title: 'The Seamless System',
    items: ['Team Unity', 'Ownership', 'Flawless Transitions'],
    phrase: 'seamless system',
  },
];

function PillarIcon({ idx, p }: { idx: number; p: number }) {
  const teal = 'var(--color-teal)';
  return (
    <svg width={64} height={64} viewBox="0 0 64 64">
      {idx === 0 && (
        <>
          {/* drafting compass */}
          <DrawPath p={p} d="M32 10 L18 50 M32 10 L46 50" stroke={teal} strokeWidth={3} />
          <DrawPath p={Math.max(0, p * 1.4 - 0.4)} d="M22 39 A18 18 0 0 0 42 39" stroke={teal} strokeWidth={3} />
          <circle cx={32} cy={10} r={4} fill={teal} opacity={p} />
        </>
      )}
      {idx === 1 && (
        <>
          {/* interlocking rings */}
          <DrawPath p={p} d="M26 24 A 14 14 0 1 0 26 52 A 14 14 0 1 0 26 24" stroke={teal} strokeWidth={3} />
          <DrawPath p={Math.max(0, p * 1.3 - 0.3)} d="M40 12 A 14 14 0 1 0 40 40 A 14 14 0 1 0 40 12" stroke={teal} strokeWidth={3} />
        </>
      )}
      {idx === 2 && (
        <>
          {/* infinity */}
          <DrawPath
            p={p}
            d="M18 32 C 18 24, 28 24, 32 32 C 36 40, 46 40, 46 32 C 46 24, 36 24, 32 32 C 28 40, 18 40, 18 32 Z"
            stroke={teal}
            strokeWidth={3}
          />
        </>
      )}
    </svg>
  );
}

export function S3Pillars({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);
  const bannerAt = b('not aspirational', -400);

  const cardAts = PILLARS.map((p) => b(p.phrase, -500));

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 118 }}>
        <Rise tl={tl} at={150} d={600}>
          <Eyebrow>Chapter Three</Eyebrow>
        </Rise>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 74, color: 'var(--color-ink)', marginTop: 20 }}>
          <WordsIn tl={tl} at={400} stagger={100} text="The Architecture of Premium Care" />
        </div>
      </div>

      {/* three pillar cards */}
      <div className="absolute" style={{ left: 150, right: 150, top: 340, display: 'flex', gap: 40 }}>
        {PILLARS.map((pillar, i) => {
          const at = cardAts[i];
          const cardP = seg(tl, at, 700, ease.out);
          return (
            <div
              key={pillar.numeral}
              style={{
                flex: 1,
                opacity: cardP,
                transform: `translateY(${(1 - cardP) * 46}px)`,
                border: '1.5px solid rgba(200,169,110,0.5)',
                borderRadius: 14,
                background: 'linear-gradient(180deg, rgba(13,21,48,0.9), rgba(10,17,40,0.78))',
                padding: '34px 36px 30px',
                minHeight: 420,
                boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 300,
                    fontSize: 64,
                    lineHeight: 1,
                    color: 'var(--color-gold)',
                    opacity: 0.9,
                  }}
                >
                  {pillar.numeral}
                </div>
                <PillarIcon idx={i} p={seg(tl, at + 250, 900, ease.inOut)} />
              </div>
              <div
                style={{
                  marginTop: 26,
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 450,
                  fontSize: 37,
                  color: 'var(--color-ink)',
                  lineHeight: 1.15,
                }}
              >
                {pillar.title}
              </div>
              <div style={{ marginTop: 24, height: 1.5, background: 'rgba(200,169,110,0.3)', width: seg(tl, at + 350, 700, ease.inOut) * 100 + '%' }} />
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 15 }}>
                {pillar.items.map((item, j) => {
                  const ip = seg(tl, at + 500 + j * 260, 450, ease.out);
                  return (
                    <div
                      key={item}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        opacity: ip,
                        transform: `translateX(${(1 - ip) * 18}px)`,
                        fontFamily: 'var(--font-body)',
                        fontWeight: 400,
                        fontSize: 26,
                        color: 'var(--color-ink-soft)',
                      }}
                    >
                      <span style={{ width: 22, height: 1.5, background: 'var(--color-teal)', opacity: 0.85 }} />
                      {item}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* minimum standard banner */}
      <Rise tl={tl} at={bannerAt} d={700} dy={34} style={{ position: 'absolute', left: 150, right: 150, top: 860 }}>
        <div
          style={{
            border: '1.5px solid rgba(127,191,184,0.55)',
            background: 'rgba(78,126,121,0.14)',
            borderRadius: 12,
            padding: '26px 40px',
            textAlign: 'center',
            fontFamily: 'var(--font-serif)',
            fontSize: 34,
            fontWeight: 420,
            color: 'var(--color-ink)',
            letterSpacing: '0.01em',
          }}
        >
          These are not aspirational guidelines — they are <span style={{ color: 'var(--color-teal)', fontStyle: 'italic' }}>the minimum standard</span> at Livaware.
        </div>
      </Rise>
    </div>
  );
}
