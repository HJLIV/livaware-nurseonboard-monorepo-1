import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
    videoReady?: boolean;
    videoFinished?: boolean;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const [elapsedInScene, setElapsedInScene] = useState(0);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.videoReady = true;
      window.videoFinished = false;
      window.startRecording?.();
    }

    const durationValues = Object.values(durations);
    let cancelled = false;
    const sceneStarts: number[] = [];
    let acc = 0;
    for (const d of durationValues) {
      sceneStarts.push(acc);
      acc += d;
    }
    const totalDuration = acc;

    startedAt.current = Date.now();

    const tick = () => {
      if (cancelled) return;
      const t = Date.now() - startedAt.current;
      if (t >= totalDuration) {
        setCurrentScene(durationValues.length - 1);
        setElapsedInScene(durationValues[durationValues.length - 1]);
        if (typeof window !== "undefined") {
          window.videoFinished = true;
          window.stopRecording?.();
        }
        return;
      }
      let idx = 0;
      for (let i = durationValues.length - 1; i >= 0; i--) {
        if (t >= sceneStarts[i]) {
          idx = i;
          break;
        }
      }
      setCurrentScene(idx);
      setElapsedInScene(t - sceneStarts[idx]);
      raf = requestAnimationFrame(tick);
    };

    let raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [durations]);

  return { currentScene, elapsedInScene };
}
