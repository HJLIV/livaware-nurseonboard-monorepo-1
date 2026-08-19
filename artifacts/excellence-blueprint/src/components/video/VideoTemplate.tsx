// The Anatomy of Excellence — a ~3 minute animated field guide.
//
// Every visual is a pure function of the master clock, so the film can be
// rendered deterministically frame-by-frame (?render=1 + window.__setFrame)
// and previewed live in the browser with synchronized narration.

import { useState } from 'react';

import { useVideoPlayer } from '@/lib/video';
import { useMasterClock } from '@/lib/anim';
import timings from '@/narration/timings.json';

import { AudioRig } from './AudioRig';
import { Stage } from './Stage';

// Real per-scene durations (ms) — keeps the platform export/recording hooks
// declaring the correct total length.
const SCENE_DURATIONS: Record<string, number> = Object.fromEntries(
  timings.scenes.map((s) => [s.key, s.durMs]),
);

export default function VideoTemplate() {
  useVideoPlayer({ durations: SCENE_DURATIONS });
  const { t, isRender, restart } = useMasterClock(timings.totalMs);
  const [soundOn, setSoundOn] = useState(false);

  return (
    <div className="w-full h-screen overflow-hidden relative" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Stage t={t} />
      {!isRender && (
        <>
          <AudioRig t={t} soundOn={soundOn} />
          <div
            style={{
              position: 'fixed',
              right: 22,
              bottom: 22,
              display: 'flex',
              gap: 10,
              zIndex: 50,
            }}
          >
            <button
              onClick={() => {
                restart();
                if (!soundOn) setSoundOn(true);
              }}
              style={buttonStyle}
            >
              ⟲ Restart
            </button>
            <button onClick={() => setSoundOn((s) => !s)} style={{ ...buttonStyle, ...(soundOn ? {} : { borderColor: 'var(--color-gold)', color: 'var(--color-gold)' }) }}>
              {soundOn ? '🔊 Sound on' : '🔇 Tap for sound'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.06em',
  color: 'var(--color-ink-soft)',
  background: 'rgba(13,21,48,0.85)',
  border: '1px solid rgba(30,38,64,1)',
  borderRadius: 999,
  padding: '9px 18px',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
};
