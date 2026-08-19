// Chapter 4 — Pillar I, the visual promise: presentation / reliability /
// discretion panels, then standard-vs-Livaware contrast strip.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Mark, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

function PanelIcon({ idx, p, clockP }: { idx: number; p: number; clockP: number }) {
  const teal = 'var(--color-teal)';
  const gold = 'var(--color-gold)';
  return (
    <svg width={86} height={86} viewBox="0 0 86 86">
      {idx === 0 && (
        <>
          {/* pressed collar / uniform */}
          <DrawPath p={p} d="M20 70 V38 C20 26 28 18 43 18 C58 18 66 26 66 38 V70" stroke={teal} strokeWidth={3} />
          <DrawPath p={Math.max(0, p * 1.5 - 0.5)} d="M33 18 L43 34 L53 18" stroke={gold} strokeWidth={2.6} />
          <DrawPath p={Math.max(0, p * 1.8 - 0.8)} d="M43 34 V54" stroke={gold} strokeWidth={2.2} />
          {/* sparkle */}
          <DrawPath p={Math.max(0, p * 2 - 1)} d="M64 24 L64 12 M58 18 L70 18" stroke={gold} strokeWidth={2} />
        </>
      )}
      {idx === 1 && (
        <>
          {/* clock, hand sweeps to exactly 12 */}
          <DrawPath p={p} d="M43 8 A35 35 0 1 1 42.9 8" stroke={teal} strokeWidth={3} />
          {[0, 90, 180, 270].map((a) => (
            <line
              key={a}
              x1={43 + 30 * Math.cos((a * Math.PI) / 180)}
              y1={43 + 30 * Math.sin((a * Math.PI) / 180)}
              x2={43 + 35 * Math.cos((a * Math.PI) / 180)}
              y2={43 + 35 * Math.sin((a * Math.PI) / 180)}
              stroke={teal}
              strokeWidth={2.5}
              opacity={p}
            />
          ))}
          {/* minute hand sweeps from 40% around to 12 exactly */}
          {(() => {
            const ang = -90 + (1 - clockP) * 140; // settles at -90° (12 o'clock)
            const rad = (ang * Math.PI) / 180;
            return <line x1={43} y1={43} x2={43 + 24 * Math.cos(rad)} y2={43 + 24 * Math.sin(rad)} stroke={gold} strokeWidth={3.4} strokeLinecap="round" opacity={p} />;
          })()}
          <line x1={43} y1={43} x2={43 + 13} y2={43 + 8} stroke={gold} strokeWidth={2.6} strokeLinecap="round" opacity={p * 0.7} />
          <circle cx={43} cy={43} r={3.4} fill={gold} opacity={p} />
        </>
      )}
      {idx === 2 && (
        <>
          {/* shield + struck-through eye */}
          <DrawPath p={p} d="M43 8 L72 20 V44 C72 62 58 74 43 79 C28 74 14 62 14 44 V20 Z" stroke={teal} strokeWidth={3} />
          <DrawPath p={Math.max(0, p * 1.5 - 0.5)} d="M27 44 C33 36 53 36 59 44 C53 52 33 52 27 44 Z" stroke={gold} strokeWidth={2.4} />
          <circle cx={43} cy={44} r={4} fill={gold} opacity={Math.max(0, p * 1.6 - 0.6)} />
          <DrawPath p={Math.max(0, p * 2 - 1)} d="M28 58 L58 30" stroke={gold} strokeWidth={3} />
        </>
      )}
    </svg>
  );
}

const PANELS = [
  {
    title: 'Immaculate Presentation',
    lines: ['A promise of the standard of care', 'Every space left as found — or better'],
    phrase: 'Immaculate presentation',
  },
  {
    title: 'Uncompromising Reliability',
    lines: ['The exact time promised', 'Never “within a window”'],
    phrase: 'Reliability means',
  },
  {
    title: 'Absolute Discretion',
    lines: ['Privacy beyond GDPR', 'Their life is privileged information'],
    phrase: 'Discretion goes beyond',
  },
];

const CONTRASTS = [
  { std: 'Visible identifiers when travelling', liv: 'Anonymous in transit — always' },
  { std: 'Apologises after the deadline slips', liv: 'A proactive call before it ever does' },
];

export function S4Foundation({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);
  const contrastAt = b('no visible identifiers', -600);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 112 }}>
        <Rise tl={tl} at={120} d={600}>
          <Eyebrow>Pillar I · Professional Foundation</Eyebrow>
        </Rise>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 72, color: 'var(--color-ink)', marginTop: 20 }}>
          <WordsIn tl={tl} at={380} stagger={100} text="The Visual Promise" />
        </div>
      </div>
      {/* faded roman numeral watermark */}
      <div
        className="absolute"
        style={{
          right: 130,
          top: 40,
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 320,
          color: 'rgba(200,169,110,0.07)',
          lineHeight: 1,
          opacity: seg(tl, 300, 900),
        }}
      >
        I
      </div>

      {/* three panels */}
      <div className="absolute" style={{ left: 150, right: 150, top: 320, display: 'flex', gap: 40 }}>
        {PANELS.map((panel, i) => {
          const at = b(panel.phrase, -450);
          const p = seg(tl, at, 650, ease.out);
          const active = tl >= at && (i === 2 || tl < b(PANELS[i + 1]?.phrase ?? 'zzz', -450));
          return (
            <div
              key={panel.title}
              style={{
                flex: 1,
                opacity: p,
                transform: `translateY(${(1 - p) * 40}px)`,
                border: `1.5px solid ${active ? 'rgba(200,169,110,0.62)' : 'rgba(30,38,64,0.9)'}`,
                borderRadius: 14,
                background: 'rgba(13,21,48,0.82)',
                padding: '30px 34px',
                minHeight: 330,
                transition: 'border-color 0.4s',
              }}
            >
              <PanelIcon idx={i} p={seg(tl, at + 150, 1000, ease.inOut)} clockP={seg(tl, at + 500, 1200, ease.inOut)} />
              <div style={{ marginTop: 24, fontFamily: 'var(--font-serif)', fontWeight: 450, fontSize: 34, lineHeight: 1.2, color: 'var(--color-ink)' }}>
                {panel.title}
              </div>
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {panel.lines.map((line, j) => (
                  <div
                    key={line}
                    style={{
                      opacity: seg(tl, at + 550 + j * 300, 450),
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: 24.5,
                      lineHeight: 1.4,
                      color: 'var(--color-ink-soft)',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* contrast strip: standard care vs Livaware */}
      <Rise tl={tl} at={contrastAt} d={650} dy={30} style={{ position: 'absolute', left: 150, right: 150, top: 748 }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 12, overflow: 'hidden', border: '1.5px solid rgba(30,38,64,1)' }}>
          <div style={{ flex: 1, background: 'rgba(10,17,40,0.9)', padding: '22px 34px' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 20, letterSpacing: '0.24em', color: 'var(--color-muted)' }}>STANDARD CARE</div>
            {CONTRASTS.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: i === 0 ? 22 : 16, opacity: seg(tl, contrastAt + 400 + i * 1500, 500) }}>
                <Mark ok={false} p={seg(tl, contrastAt + 500 + i * 1500, 500)} size={26} />
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 24, color: 'var(--color-muted)' }}>{c.std}</span>
              </div>
            ))}
          </div>
          <div style={{ width: 1.5, background: 'rgba(200,169,110,0.4)' }} />
          <div style={{ flex: 1, background: 'rgba(200,169,110,0.08)', padding: '22px 34px' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 20, letterSpacing: '0.24em', color: 'var(--color-gold)' }}>LIVAWARE EXCELLENCE</div>
            {CONTRASTS.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: i === 0 ? 22 : 16, opacity: seg(tl, contrastAt + 700 + i * 1500, 500) }}>
                <Mark ok p={seg(tl, contrastAt + 800 + i * 1500, 500)} size={26} />
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 24, color: 'var(--color-ink)' }}>{c.liv}</span>
              </div>
            ))}
          </div>
        </div>
      </Rise>
    </div>
  );
}
