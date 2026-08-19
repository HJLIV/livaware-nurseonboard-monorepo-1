// Chapter 8 — Measured excellence, the shield-home emblem, and the
// foundation/signature close.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

const CHIPS = [
  { label: 'Reviewed', note: 'in every performance evaluation' },
  { label: 'Recognised', note: 'when the standard is lived' },
  { label: 'Rewarded', note: 'because excellence compounds' },
];

export function S8Signature({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur, 500, 600);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);

  const shieldAt = b('never navigate complex systems', -700);
  const closeAt = b('clinical excellence is your foundation', -350);
  const sigAt = b('premium service is your signature', -150);

  const measurePhase = 1 - seg(tl, shieldAt - 450, 450, ease.inOut);
  const shieldPhase = Math.min(seg(tl, shieldAt - 150, 450, ease.inOut), 1 - seg(tl, closeAt - 450, 450, ease.inOut));
  const closePhase = seg(tl, closeAt - 150, 450, ease.inOut);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      {/* Phase A — habit we measure */}
      <div className="absolute inset-0" style={{ opacity: measurePhase }}>
        <div className="absolute" style={{ left: 150, top: 150 }}>
          <Rise tl={tl} at={120} d={600}>
            <Eyebrow>Chapter Eight</Eyebrow>
          </Rise>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 74, color: 'var(--color-ink)', marginTop: 20 }}>
            <WordsIn tl={tl} at={380} stagger={100} text="Excellence Is a Habit We Measure" />
          </div>
        </div>
        <div className="absolute" style={{ left: 150, right: 150, top: 420, display: 'flex', gap: 40 }}>
          {CHIPS.map((c, i) => {
            const at = 900 + i * 1050;
            const p = seg(tl, at, 600, ease.out);
            return (
              <div
                key={c.label}
                style={{
                  flex: 1,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 34}px)`,
                  border: '1.5px solid rgba(200,169,110,0.45)',
                  borderRadius: 14,
                  background: 'rgba(13,21,48,0.85)',
                  padding: '32px 36px',
                }}
              >
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 450, fontSize: 40, color: 'var(--color-gold)' }}>{c.label}</div>
                <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 24, color: 'var(--color-ink-soft)' }}>{c.note}</div>
                <div style={{ marginTop: 24, height: 4, borderRadius: 4, background: 'rgba(30,38,64,1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${seg(tl, at + 350, 1100, ease.inOut) * 100}%`, background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))' }} />
                </div>
              </div>
            );
          })}
        </div>
        <Rise tl={tl} at={b('as positive as it can', -900)} d={700} style={{ position: 'absolute', left: 0, right: 0, top: 800, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 30, color: 'var(--color-ink-soft)' }}>
            All of it in service of one aim — <span style={{ color: 'var(--color-ink)', fontWeight: 400 }}>making a difficult journey as positive as possible.</span>
          </div>
        </Rise>
      </div>

      {/* Phase B — shield-home emblem */}
      <div className="absolute inset-0" style={{ opacity: shieldPhase }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" className="absolute inset-0">
          <g transform="translate(660, 540)">
            <DrawPath
              p={seg(tl, shieldAt, 1400, ease.inOut)}
              d="M0 -190 L150 -128 V-10 C150 96 78 168 0 196 C-78 168 -150 96 -150 -10 V-128 Z"
              stroke="var(--color-teal)"
              strokeWidth={4}
              fill="rgba(78,126,121,0.07)"
            />
            <DrawPath p={seg(tl, shieldAt + 700, 1100, ease.inOut)} d="M-58 10 L0 -44 L58 10 M-40 2 V64 H40 V2" stroke="var(--color-gold)" strokeWidth={3.5} />
            <circle r={228} fill="none" stroke="var(--color-gold)" strokeWidth={1} opacity={seg(tl, shieldAt + 1500, 700) * 0.35} />
          </g>
        </svg>
        <div className="absolute" style={{ left: 1010, top: 400, width: 760 }}>
          {['Never navigating complex systems alone.', 'Solutions — never excuses.'].map((line, i) => (
            <Rise key={line} tl={tl} at={shieldAt + 400 + i * 1400} d={650} dy={20}>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 420,
                  fontSize: 46,
                  lineHeight: 1.3,
                  color: i === 0 ? 'var(--color-ink)' : 'var(--color-gold)',
                  marginBottom: 34,
                }}
              >
                {line}
              </div>
            </Rise>
          ))}
        </div>
      </div>

      {/* Phase C — the close */}
      <div className="absolute inset-0" style={{ opacity: closePhase }}>
        <div className="absolute" style={{ left: 0, right: 0, top: 368, textAlign: 'center' }}>
          <Rise tl={tl} at={closeAt} d={700} dy={26}>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 66, color: 'var(--color-ink)' }}>
              Clinical excellence is your <span style={{ color: 'var(--color-teal)' }}>foundation</span>.
            </div>
          </Rise>
          <Rise tl={tl} at={sigAt} d={700} dy={26}>
            <div style={{ marginTop: 30, fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 66, color: 'var(--color-ink)' }}>
              Premium service is your <span style={{ fontStyle: 'italic', color: 'var(--color-gold)' }}>signature</span>.
            </div>
          </Rise>
          {/* signature flourish */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <svg width={520} height={90} viewBox="0 0 520 90">
              <DrawPath
                p={seg(tl, sigAt + 800, 1300, ease.inOut)}
                d="M20 60 C90 20, 150 76, 210 52 C260 32, 250 18, 228 30 C206 42, 240 66, 300 54 C360 42, 420 34, 500 46"
                stroke="var(--color-gold)"
                strokeWidth={3}
              />
            </svg>
          </div>
          <Rise tl={tl} at={b('You are the architect', -200)} d={650} style={{ marginTop: 26 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 25, letterSpacing: '0.3em', color: 'var(--color-ink-soft)', textTransform: 'uppercase' }}>
              You are the architect of the Livaware experience
            </div>
          </Rise>
        </div>
      </div>
    </div>
  );
}
