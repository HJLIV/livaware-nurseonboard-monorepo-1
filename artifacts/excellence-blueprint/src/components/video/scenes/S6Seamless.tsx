// Chapter 6 — Pillar III: the infinity loop with three nodes, shielding the
// patient from the machine.

import { beatAt, ease, seg } from '@/lib/anim';
import { DrawPath, Eyebrow, Rise, WordsIn, sceneEnvelope, type SceneProps } from '../atoms';

const NODES = [
  { label: 'The Team Comes First', note: 'One unified front', phrase: 'team comes first', x: 560, y: 545 },
  { label: 'Ownership of Outcomes', note: 'The patient’s advocate', phrase: 'Own every outcome', x: 960, y: 545 },
  { label: 'Flawless Transitions', note: 'Preferences carried with rigor', phrase: 'I will resolve', x: 1360, y: 545 },
];

export function S6Seamless({ tl, dur, voStart, voDur, text }: SceneProps) {
  const o = sceneEnvelope(tl, dur);
  const b = (phrase: string, off = 0) => beatAt(text, phrase, voStart, voDur, off);

  const loopTeal = seg(tl, 350, 2400, ease.inOut);
  const loopGold = seg(tl, 650, 2400, ease.inOut);
  const resolveAt = b('I will resolve this for you', -300);
  const philosophyAt = b('we are Livaware', -900);

  // infinity path centred at (960, 545)
  const inf = 'M660 545 C660 425, 850 425, 960 545 C1070 665, 1260 665, 1260 545 C1260 425, 1070 425, 960 545 C850 665, 660 665, 660 545 Z';
  const infWide = 'M560 545 C560 385, 810 385, 960 545 C1110 705, 1360 705, 1360 545 C1360 385, 1110 385, 960 545 C810 705, 560 705, 560 545 Z';

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute" style={{ left: 150, top: 112 }}>
        <Rise tl={tl} at={120} d={600}>
          <Eyebrow>Pillar III · The Seamless System</Eyebrow>
        </Rise>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 72, color: 'var(--color-ink)', marginTop: 20 }}>
          <WordsIn tl={tl} at={380} stagger={100} text="One Livaware, Always" />
        </div>
      </div>
      <div
        className="absolute"
        style={{ right: 130, top: 40, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 320, color: 'rgba(200,169,110,0.07)', lineHeight: 1, opacity: seg(tl, 300, 900) }}
      >
        III
      </div>

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" className="absolute inset-0">
        {/* interwoven infinity strokes */}
        <DrawPath p={loopTeal} d={infWide} stroke="var(--color-teal)" strokeWidth={3} opacity={0.75} />
        <DrawPath p={loopGold} d={inf} stroke="var(--color-gold)" strokeWidth={3.5} opacity={0.9} />

        {/* nodes */}
        {NODES.map((n, i) => {
          const at = b(n.phrase, -400);
          const p = seg(tl, at, 550, ease.outBack);
          return (
            <g key={n.label} opacity={seg(tl, at, 400)}>
              <circle cx={n.x} cy={n.y} r={46 * Math.min(1, p)} fill="rgba(13,21,48,0.95)" stroke={i === 1 ? 'var(--color-gold)' : 'var(--color-teal)'} strokeWidth={2.5} />
              {i === 0 && (
                <g stroke="var(--color-teal)" strokeWidth={2.4} fill="none" opacity={p}>
                  <circle cx={n.x - 10} cy={n.y - 6} r={8} />
                  <circle cx={n.x + 10} cy={n.y - 6} r={8} />
                  <path d={`M${n.x - 22} ${n.y + 18} C${n.x - 16} ${n.y + 6}, ${n.x - 4} ${n.y + 6}, ${n.x} ${n.y + 14} C${n.x + 4} ${n.y + 6}, ${n.x + 16} ${n.y + 6}, ${n.x + 22} ${n.y + 18}`} />
                </g>
              )}
              {i === 1 && (
                <g stroke="var(--color-gold)" strokeWidth={2.4} fill="none" opacity={p}>
                  <path d={`M${n.x} ${n.y - 20} L${n.x + 18} ${n.y - 12} V${n.y + 4} C${n.x + 18} ${n.y + 16}, ${n.x + 9} ${n.y + 22}, ${n.x} ${n.y + 26} C${n.x - 9} ${n.y + 22}, ${n.x - 18} ${n.y + 16}, ${n.x - 18} ${n.y + 4} V${n.y - 12} Z`} />
                  <path d={`M${n.x - 7} ${n.y + 2} L${n.x - 2} ${n.y + 8} L${n.x + 8} ${n.y - 5}`} />
                </g>
              )}
              {i === 2 && (
                <g stroke="var(--color-teal)" strokeWidth={2.4} fill="none" opacity={p}>
                  <path d={`M${n.x - 20} ${n.y + 12} C${n.x - 8} ${n.y - 14}, ${n.x + 8} ${n.y - 14}, ${n.x + 20} ${n.y + 12}`} />
                  <path d={`M${n.x - 20} ${n.y + 12} H${n.x + 20}`} />
                  <path d={`M${n.x - 12} ${n.y + 12} V${n.y + 2} M${n.x} ${n.y + 12} V${n.y - 4} M${n.x + 12} ${n.y + 12} V${n.y + 2}`} />
                </g>
              )}
              <text x={n.x} y={745} textAnchor="middle" fill="var(--color-ink)" style={{ font: '500 27px var(--font-body)' }}>
                {n.label}
              </text>
              <text x={n.x} y={781} textAnchor="middle" fill="var(--color-ink-soft)" opacity={0.85 * seg(tl, at + 250, 450)} style={{ font: '300 21px var(--font-body)' }}>
                {n.note}
              </text>
            </g>
          );
        })}
      </svg>

      {/* “I will resolve this for you.” */}
      <Rise tl={tl} at={resolveAt} d={600} dy={18} style={{ position: 'absolute', left: 0, right: 0, top: 828, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            border: '1px solid rgba(200,169,110,0.5)',
            background: 'rgba(200,169,110,0.09)',
            borderRadius: 999,
            padding: '16px 42px',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 30,
            color: 'var(--color-gold)',
          }}
        >
          “I will resolve this for you.”
        </div>
      </Rise>

      {/* core philosophy */}
      <Rise tl={tl} at={philosophyAt} d={800} dy={22} style={{ position: 'absolute', left: 0, right: 0, top: 942, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 420, fontSize: 40, color: 'var(--color-ink)' }}>
          To the patient, we are <span style={{ color: 'var(--color-teal)' }}>Livaware</span> — not individual practitioners.
        </div>
      </Rise>
    </div>
  );
}
