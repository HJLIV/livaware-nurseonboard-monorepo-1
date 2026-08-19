// Outro — white Livaware wordmark over the dimming blueprint.

import { ease, seg } from '@/lib/anim';
import { sceneEnvelope, type SceneProps } from '../atoms';

export function S9Outro({ tl, dur }: SceneProps) {
  const o = sceneEnvelope(tl, dur, 600, 900);
  const logoP = seg(tl, 300, 1200, ease.out);
  const tagP = seg(tl, 1100, 900, ease.out);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      {/* deepen the background */}
      <div className="absolute inset-0" style={{ background: 'rgba(3,6,14,0.55)', opacity: seg(tl, 0, 900) }} />
      <div className="absolute inset-0" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`${import.meta.env.BASE_URL}brand/livaware-white.png`}
          alt="Livaware"
          style={{
            width: 620,
            opacity: logoP,
            transform: `scale(${0.94 + 0.06 * logoP})`,
            filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.45))',
          }}
        />
        <div
          style={{
            marginTop: 42,
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 23,
            letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color: 'var(--color-gold)',
            opacity: tagP * 0.95,
            transform: `translateY(${(1 - tagP) * 14}px)`,
          }}
        >
          The Standard of Care · In Residence
        </div>
      </div>
    </div>
  );
}
