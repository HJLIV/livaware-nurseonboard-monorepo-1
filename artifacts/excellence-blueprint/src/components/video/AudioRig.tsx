// Live-preview audio: narration chunks scheduled on the master clock plus a
// quiet looping music bed. Skipped entirely in render mode — the final MP4
// gets its audio muxed offline with ffmpeg.

import { useEffect, useRef } from 'react';

import timings from '@/narration/timings.json';

const MUSIC_VOLUME = 0.14;

export function AudioRig({ t, soundOn }: { t: number; soundOn: boolean }) {
  const voRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // build elements once
  useEffect(() => {
    const map = voRefs.current;
    for (const s of timings.scenes) {
      if (!s.audio) continue;
      const el = new Audio(s.audio);
      el.preload = 'auto';
      map.set(s.key, el);
    }
    const music = new Audio(timings.music);
    music.preload = 'auto';
    music.loop = true;
    music.volume = MUSIC_VOLUME;
    musicRef.current = music;
    return () => {
      map.forEach((el) => el.pause());
      map.clear();
      music.pause();
      musicRef.current = null;
    };
  }, []);

  // schedule narration against the clock
  useEffect(() => {
    for (const s of timings.scenes) {
      if (!s.audio) continue;
      const el = voRefs.current.get(s.key);
      if (!el) continue;
      const within = t >= s.voStartMs && t < s.voStartMs + s.voDurMs;
      if (within && soundOn) {
        const target = (t - s.voStartMs) / 1000;
        if (el.paused) {
          el.currentTime = target;
          void el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - target) > 0.35) {
          el.currentTime = target;
        }
      } else if (!el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }
    const music = musicRef.current;
    if (music) {
      if (soundOn && music.paused) void music.play().catch(() => {});
      if (!soundOn && !music.paused) music.pause();
    }
  }, [t, soundOn]);

  return null;
}
