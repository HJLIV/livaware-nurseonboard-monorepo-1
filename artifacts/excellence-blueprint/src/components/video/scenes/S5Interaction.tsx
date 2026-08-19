// Chapter 5 — Pillar II in three movements: sovereign territory rings,
// the anticipatory vs reactive timelines, and therapeutic communication.

import { beatAt, clamp01, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

export function S5Interaction({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);

  // Three movements
  const mAAt = 0;
  const mBAt = b('Anticipate', -500);
  const mCAt = b('Communicate with warmth', -500);

  const inA = 1 - seg(tl, mBAt - 450, 450, ease.inOut);
  const inB = Math.min(seg(tl, mBAt - 150, 450, ease.inOut), 1 - seg(tl, mCAt - 450, 450, ease.inOut));
  const inC = seg(tl, mCAt - 150, 450, ease.inOut);

  // Movement A — rings
  const ringCore = seg(tl, mAAt + 500, 1100, ease.inOut);
  const ringOuter = seg(tl, mAAt + 900, 1300, ease.inOut);
  const nurseP = seg(tl, b('you are a guest', 0), 1800, ease.inOut);
  const askAt = b('would it work for you', -250);

  // Movement B — timelines (nodes kept inboard so labels never clip)
  const goldSteps = ['Review the notes', 'Spot the patterns', "Bring tomorrow's supplies", 'Need met — before the request'];
  const greySteps = ['Pain felt', 'Help requested', 'Nurse responds'];
  const gx = (i: number) => 150 + i * 440; // 150..1470
  const prescriptionAt = mBAt + 3400;

  // Movement C — communication
  const commChips = ['Real timeframes', 'Confirmed understanding', 'Warmth under pressure'];
  const quoteAt = b('have to do that', -350);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 112 }}>
        <Rise tl={tl} at={120} d={600}>
          <Eyebrow>Pillar II · Patient Interaction</Eyebrow>
        </Rise>
        {/* headline crossfades per movement */}
        <div style={{ position: 'relative', marginTop: 20, height: 100 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: inA, fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 72, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>
            <WordsIn tl={tl} at={380} stagger={100} text="Their Home, Their Rules" />
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: inB, fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 72, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>
            <WordsIn tl={tl} at={mBAt - 100} stagger={100} text="The Art of Predicting Needs" />
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: inC, fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 72, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>
            <WordsIn tl={tl} at={mCAt - 100} stagger={100} text="Communication, as Therapy" />
          </div>
        </div>
      </div>
      <div
        className="absolute"
        style={{ right: 130, top: 40, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 320, color: 'rgba(200,169,110,0.07)', lineHeight: 1, opacity: seg(tl, 300, 900) }}
      >
        II
      </div>

      {/* Movement A — sovereign territory */}
      <div className="absolute inset-0" style={{ opacity: inA, pointerEvents: 'none' }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" className="absolute inset-0">
          <g transform="translate(700, 640)">
            {/* outer dashed ring */}
            <circle r={300} fill="none" stroke="var(--color-teal)" strokeWidth={2} strokeDasharray="6 12" opacity={ringOuter * 0.7} />
            {/* gold core */}
            <circle r={172 * ringCore} fill="rgba(200,169,110,0.13)" stroke="var(--color-gold)" strokeWidth={2.5} opacity={0.95} />
            {/* core house glyph */}
            <g opacity={seg(tl, mAAt + 1300, 600)}>
              <DrawPath p={seg(tl, mAAt + 1300, 900, ease.inOut)} d="M-34 8 V44 H34 V8 M-48 14 L0 -28 L48 14" stroke="var(--color-gold)" strokeWidth={3} />
            </g>
            <text y={92} textAnchor="middle" fill="var(--color-gold)" opacity={seg(tl, mAAt + 1500, 500)} style={{ font: '600 25px var(--font-body)', letterSpacing: '0.12em' }}>
              THE PATIENT &amp; THE HOME
            </text>
            {['Autonomy', 'Household customs', 'Preferences'].map((label, i) => (
              <text key={label} y={128 + i * 30} textAnchor="middle" fill="var(--color-ink-soft)" opacity={seg(tl, mAAt + 1800 + i * 220, 400) * 0.9} style={{ font: '300 21px var(--font-body)' }}>
                {label}
              </text>
            ))}
            <text y={-322} textAnchor="middle" fill="var(--color-teal)" opacity={ringOuter * 0.9} style={{ font: '600 22px var(--font-body)', letterSpacing: '0.24em' }}>
              THE RESPECTFUL GUEST
            </text>
            {/* nurse dot entering along dotted approach, pausing at threshold */}
            {(() => {
              const startX = 560;
              const thresholdX = 308;
              const x = startX - (startX - thresholdX) * nurseP;
              return (
                <g opacity={seg(tl, b('you are a guest', -300), 400)}>
                  <line x1={thresholdX} y1={0} x2={startX} y2={0} stroke="var(--color-teal)" strokeWidth={1.5} strokeDasharray="3 9" opacity={0.5} />
                  <circle cx={x} cy={0} r={13} fill="var(--color-bg)" stroke="var(--color-teal)" strokeWidth={2.5} />
                  <circle cx={x} cy={-4} r={4} fill="var(--color-teal)" />
                  <path d={`M${x - 6} ${5} A6 6 0 0 1 ${x + 6} ${5}`} fill="var(--color-teal)" />
                </g>
              );
            })()}
          </g>
        </svg>
        {/* ask-permission speech card */}
        <Rise tl={tl} at={askAt} d={650} dy={22} style={{ position: 'absolute', left: 1120, top: 520, width: 610 }}>
          <div style={{ background: 'rgba(13,21,48,0.92)', border: '1.5px solid rgba(200,169,110,0.5)', borderRadius: 14, padding: '28px 34px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 380, fontSize: 31, lineHeight: 1.45, color: 'var(--color-ink)' }}>
              “Would it work for you if I set up here — or would another spot be better?”
            </div>
            <div style={{ marginTop: 14, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 19, letterSpacing: '0.26em', color: 'var(--color-gold)' }}>
              ASK — NEVER IMPOSE
            </div>
          </div>
        </Rise>
      </div>

      {/* Movement B — anticipatory vs reactive */}
      <div className="absolute inset-0" style={{ opacity: inB, pointerEvents: 'none' }}>
        <div className="absolute" style={{ left: 150, right: 150, top: 380 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 23, letterSpacing: '0.26em', color: 'var(--color-gold)' }}>
            ANTICIPATORY EXCELLENCE
          </div>
          <svg width={1620} height={150} viewBox="0 0 1620 150">
            <DrawPath p={seg(tl, mBAt + 300, 1900, ease.inOut)} d={`M10 75 H1610`} stroke="var(--color-gold)" strokeWidth={3.5} />
            {goldSteps.map((s, i) => {
              const x = gx(i);
              const p = seg(tl, mBAt + 500 + i * 800, 420, ease.outBack);
              const last = i === goldSteps.length - 1;
              return (
                <g key={s} opacity={clamp01(p * 1.2)}>
                  <circle cx={x} cy={75} r={11 * p} fill="var(--color-gold)" stroke="rgba(6,11,24,0.9)" strokeWidth={2.5} />
                  <text
                    x={last ? 1610 : x}
                    y={i % 2 === 0 ? 38 : 128}
                    textAnchor={last ? 'end' : 'middle'}
                    fill="var(--color-ink)"
                    style={{ font: '500 23px var(--font-body)' }}
                  >
                    {s}
                  </text>
                </g>
              );
            })}
          </svg>
          <div style={{ marginTop: 40, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 23, letterSpacing: '0.26em', color: 'var(--color-muted)' }}>
            REACTIVE CARE
          </div>
          <svg width={1620} height={140} viewBox="0 0 1620 140">
            <DrawPath p={seg(tl, mBAt + 1500, 1700, ease.inOut)} d={`M10 60 H${gx(2) + 140}`} stroke="rgba(138,133,128,0.8)" strokeWidth={3} />
            {greySteps.map((s, i) => {
              const x = gx(i);
              const p = seg(tl, mBAt + 1700 + i * 650, 400, ease.out);
              return (
                <g key={s} opacity={p}>
                  <circle cx={x} cy={60} r={10} fill="var(--color-muted)" stroke="rgba(6,11,24,0.9)" strokeWidth={2.5} />
                  <text x={x} y={112} textAnchor="middle" fill="var(--color-muted)" style={{ font: '400 22px var(--font-body)' }}>
                    {s}
                  </text>
                </g>
              );
            })}
            {/* red X — delay in comfort */}
            {(() => {
              const p = seg(tl, mBAt + 3600, 500, ease.out);
              const x = gx(2) + 210;
              return (
                <g opacity={p}>
                  <path d={`M${x - 14} 46 L${x + 14} 74 M${x + 14} 46 L${x - 14} 74`} stroke="var(--color-danger)" strokeWidth={4} strokeLinecap="round" />
                  <text x={x + 34} y={68} fill="var(--color-danger)" style={{ font: '500 23px var(--font-body)' }}>
                    Delay in comfort
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
        {/* the anticipatory standard, made concrete */}
        <Rise tl={tl} at={prescriptionAt} d={700} dy={24} style={{ position: 'absolute', left: 0, right: 0, top: 812, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 1240, background: 'rgba(13,21,48,0.9)', border: '1.5px solid rgba(200,169,110,0.45)', borderRadius: 14, padding: '26px 42px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 380, fontSize: 29, lineHeight: 1.45, color: 'var(--color-ink)' }}>
              “I noticed your prescription needs renewal next week — I've already coordinated with your GP, so nothing is interrupted.”
            </div>
            <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 18, letterSpacing: '0.28em', color: 'var(--color-gold)' }}>
              THE ANTICIPATORY STANDARD
            </div>
          </div>
        </Rise>
      </div>

      {/* Movement C — therapeutic communication */}
      <div className="absolute inset-0" style={{ opacity: inC, pointerEvents: 'none' }}>
        <div className="absolute" style={{ left: 150, top: 368, width: 760 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 23, letterSpacing: '0.26em', color: 'var(--color-teal)' }}>
            A THERAPEUTIC TOOL
          </div>
          <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {commChips.map((c, i) => (
              <Rise key={c} tl={tl} at={mCAt + 300 + i * 700} d={500} dy={16}>
                <div
                  style={{
                    border: '1px solid rgba(127,191,184,0.5)',
                    background: 'rgba(78,126,121,0.12)',
                    borderRadius: 999,
                    padding: '15px 30px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 14,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 26,
                    color: 'var(--color-ink)',
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--color-teal)' }} />
                  {c}
                </div>
              </Rise>
            ))}
          </div>
        </div>
        <Rise tl={tl} at={quoteAt} d={800} dy={22} style={{ position: 'absolute', left: 1000, top: 400, width: 740 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ width: 4, borderRadius: 4, background: 'var(--color-gold)', opacity: 0.85 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 380, fontSize: 40, lineHeight: 1.4, color: 'var(--color-gold)' }}>
                “They didn't have to do that — but it made such a difference.”
              </div>
              <div style={{ marginTop: 16, fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 20, letterSpacing: '0.28em', color: 'var(--color-muted)' }}>
                THE THOUGHT EVERY PATIENT SHOULD HAVE
              </div>
            </div>
          </div>
        </Rise>
      </div>
    </div>
  );
}
