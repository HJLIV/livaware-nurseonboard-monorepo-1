// Chapter 7 — Handover choreography: IN/OUT lanes, four steps, coffee coda.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

const STEPS = [
  {
    n: '01',
    title: 'The Silent Review',
    phrase: 'the silent review',
    in: 'Reads MAR & SOAP notes — five quiet minutes',
    out: 'Tells the client the new nurse is here; environment check',
    chip: '5:00',
  },
  {
    n: '02',
    title: 'Private & Confidential',
    phrase: 'private verbal handover',
    in: 'Receives the verbal handover; signs the SOAP note once understood',
    out: 'Hands over away from the bedside',
    chip: null,
  },
  {
    n: '03',
    title: 'The Bedside Transition',
    phrase: 'bedside introduction',
    in: 'Introduces self and shift time',
    out: 'Formally introduces the incoming nurse',
    chip: null,
  },
  {
    n: '04',
    title: 'Verification & Closure',
    phrase: 'verification and closure',
    in: 'Joint stock check · signs new documentation',
    out: 'Uploads clear photos of SOAP note & I/O chart',
    chip: null,
  },
];

export function S7Handover({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);
  const coffeeAt = b('morning coffee', -500);
  const questionAt = b('can you make sense', -250);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 108 }}>
        <Rise tl={tl} at={120} d={600}>
          <Eyebrow>The Choreography</Eyebrow>
        </Rise>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 70, color: 'var(--color-ink)', marginTop: 18 }}>
          <WordsIn tl={tl} at={380} stagger={110} text="Handover, Perfected" />
        </div>
      </div>

      {/* lane headers — aligned over the IN/OUT columns (left rail is 420 + 26 gap) */}
      <div className="absolute" style={{ left: 596, right: 150, top: 268, display: 'flex', gap: 26 }}>
        <Rise tl={tl} at={500} d={550} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 23, letterSpacing: '0.24em', color: 'var(--color-gold)' }}>INCOMING · IN</div>
        </Rise>
        <Rise tl={tl} at={620} d={550} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 23, letterSpacing: '0.24em', color: 'var(--color-teal)' }}>OUTGOING · OUT</div>
        </Rise>
      </div>

      {/* steps */}
      <div className="absolute" style={{ left: 150, right: 150, top: 330 }}>
        {STEPS.map((s, i) => {
          const at = b(s.phrase, -500);
          const p = seg(tl, at, 600, ease.out);
          const active = tl >= at && (i === 3 || tl < b(STEPS[i + 1].phrase, -500));
          return (
            <div
              key={s.n}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 26,
                marginBottom: 18,
                opacity: p,
                transform: `translateX(${(1 - p) * -30}px)`,
              }}
            >
              {/* step index */}
              <div style={{ width: 420, display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                  style={{
                    width: 66,
                    height: 66,
                    borderRadius: 12,
                    border: `1.5px solid ${active ? 'var(--color-gold)' : 'rgba(200,169,110,0.35)'}`,
                    background: active ? 'rgba(200,169,110,0.12)' : 'rgba(13,21,48,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-serif)',
                    fontSize: 30,
                    color: 'var(--color-gold)',
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 450, fontSize: 31, color: active ? 'var(--color-ink)' : 'var(--color-ink-soft)' }}>
                    {s.title}
                    {s.chip && (
                      <span
                        style={{
                          marginLeft: 14,
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          fontSize: 19,
                          letterSpacing: '0.1em',
                          color: 'var(--color-teal)',
                          border: '1px solid rgba(127,191,184,0.5)',
                          borderRadius: 999,
                          padding: '3px 12px',
                          verticalAlign: 'middle',
                        }}
                      >
                        {s.chip} MIN
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* IN lane */}
              <div
                style={{
                  flex: 1,
                  borderLeft: '2px solid rgba(200,169,110,0.45)',
                  background: active ? 'rgba(200,169,110,0.07)' : 'rgba(13,21,48,0.55)',
                  borderRadius: '0 10px 10px 0',
                  padding: '14px 22px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 350,
                  fontSize: 22.5,
                  lineHeight: 1.35,
                  color: 'var(--color-ink-soft)',
                  opacity: seg(tl, at + 220, 450),
                }}
              >
                {s.in}
              </div>
              {/* OUT lane */}
              <div
                style={{
                  flex: 1,
                  borderLeft: '2px solid rgba(127,191,184,0.45)',
                  background: active ? 'rgba(78,126,121,0.08)' : 'rgba(13,21,48,0.55)',
                  borderRadius: '0 10px 10px 0',
                  padding: '14px 22px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 350,
                  fontSize: 22.5,
                  lineHeight: 1.35,
                  color: 'var(--color-ink-soft)',
                  opacity: seg(tl, at + 340, 450),
                }}
              >
                {s.out}
              </div>
            </div>
          );
        })}
      </div>

      {/* the silent-review question */}
      <Rise tl={tl} at={questionAt} d={650} dy={16} style={{ position: 'absolute', left: 150, top: 918, width: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width={34} height={34} viewBox="0 0 34 34">
            <DrawPath p={seg(tl, questionAt + 150, 700, ease.inOut)} d="M17 4 A9.5 9.5 0 0 1 22 21 L22 24 H12 L12 21 A9.5 9.5 0 0 1 17 4 Z M13 28 H21" stroke="var(--color-gold)" strokeWidth={2.2} />
          </svg>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 29, color: 'var(--color-gold)' }}>
            Ask yourself: can you make sense of the day — without being told?
          </div>
        </div>
      </Rise>

      {/* coffee coda */}
      <Rise tl={tl} at={coffeeAt} d={650} dy={16} style={{ position: 'absolute', right: 150, top: 918, width: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, justifyContent: 'flex-end' }}>
          <svg width={38} height={38} viewBox="0 0 38 38">
            <DrawPath p={seg(tl, coffeeAt + 150, 800, ease.inOut)} d="M7 14 H27 V26 A6 6 0 0 1 21 32 H13 A6 6 0 0 1 7 26 Z M27 17 H30 A4 4 0 0 1 30 25 H27" stroke="var(--color-teal)" strokeWidth={2.2} />
            <DrawPath p={seg(tl, coffeeAt + 700, 600, ease.inOut)} d="M13 10 C13 7 15 7 15 4 M20 10 C20 7 22 7 22 4" stroke="var(--color-teal)" strokeWidth={1.8} />
          </svg>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 24, lineHeight: 1.4, color: 'var(--color-ink-soft)', textAlign: 'right' }}>
            Even the <span style={{ color: 'var(--color-teal)', fontWeight: 500 }}>morning coffee ritual</span> travels with the same rigor as clinical data.
          </div>
        </div>
      </Rise>
    </div>
  );
}
