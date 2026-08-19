// 1920×1080 stage: persistent backdrop + HUD + active scene, scaled to fit
// the viewport. Scene selection and every animation derive from master time.

import { useEffect, useState } from 'react';

import timings from '@/narration/timings.json';
import script from '@/narration/excellence-blueprint-script.json';
import { Backdrop } from './Backdrop';
import type { SceneProps } from './atoms';
import { S1Title } from './scenes/S1Title';
import { S2Delta } from './scenes/S2Delta';
import { S3Pillars } from './scenes/S3Pillars';
import { S4Foundation } from './scenes/S4Foundation';
import { S5Interaction } from './scenes/S5Interaction';
import { S6Seamless } from './scenes/S6Seamless';
import { S7Handover } from './scenes/S7Handover';
import { S8Signature } from './scenes/S8Signature';
import { S9Outro } from './scenes/S9Outro';

const SCENE_COMPONENTS: Record<string, (p: SceneProps) => React.ReactNode> = {
  title: S1Title,
  delta: S2Delta,
  pillars: S3Pillars,
  foundation: S4Foundation,
  interaction: S5Interaction,
  seamless: S6Seamless,
  handover: S7Handover,
  signature: S8Signature,
  outro: S9Outro,
};

const TEXTS: Record<string, string> = Object.fromEntries(
  script.scenes.map((s: { key: string; text: string }) => [s.key, s.text]),
);

const CHAPTER_LABELS: Record<string, string> = {
  title: '01 / 08',
  delta: '02 / 08',
  pillars: '03 / 08',
  foundation: '04 / 08',
  interaction: '05 / 08',
  seamless: '06 / 08',
  handover: '07 / 08',
  signature: '08 / 08',
  outro: '',
};

export function activeSceneAt(t: number) {
  const scenes = timings.scenes;
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (t >= scenes[i].startMs) return scenes[i];
  }
  return scenes[0];
}

function useViewportScale() {
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined' ? 1 : Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
  );
  useEffect(() => {
    const onResize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export function Stage({ t }: { t: number }) {
  const scale = useViewportScale();
  const scene = activeSceneAt(t);
  const tl = t - scene.startMs;
  const Comp = SCENE_COMPONENTS[scene.key];
  const chapter = CHAPTER_LABELS[scene.key] ?? '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          position: 'relative',
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <Backdrop t={t} />

        {/* HUD */}
        <div
          style={{
            position: 'absolute',
            top: 58,
            left: 120,
            right: 120,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 5,
            opacity: scene.key === 'outro' ? Math.max(0, 1 - tl / 600) : 1,
          }}
        >
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 20, letterSpacing: '0.5em', color: 'rgba(232,228,223,0.55)' }}>
            LIVAWARE
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 18, letterSpacing: '0.3em', color: 'rgba(200,169,110,0.7)' }}>
            {chapter && `FIELD GUIDE · ${chapter}`}
          </div>
        </div>

        {/* progress hairline */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(30,38,64,0.6)', zIndex: 6 }}>
          <div
            style={{
              height: '100%',
              width: `${(t / timings.totalMs) * 100}%`,
              background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))',
            }}
          />
        </div>

        <Comp tl={tl} dur={scene.durMs} voStart={scene.voStartMs - scene.startMs} voDur={scene.voDurMs} text={TEXTS[scene.key] ?? ''} />
      </div>
    </div>
  );
}
