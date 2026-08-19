// Persistent living-blueprint backdrop: fine grid, corner registration marks,
// vignette, and a slow drift that keeps the frame alive between scenes.

import { memo } from 'react';

const W = 1920;
const H = 1080;
const MINOR = 32;
const MAJOR = 160;

export const Backdrop = memo(function Backdrop({ t }: { t: number }) {
  // Slow diagonal drift, loops seamlessly every MAJOR px cycle
  const drift = (t * 0.004) % MAJOR;

  const minorLines: React.ReactNode[] = [];
  for (let x = -MAJOR; x <= W + MAJOR; x += MINOR) {
    minorLines.push(<line key={`v${x}`} x1={x} y1={-MAJOR} x2={x} y2={H + MAJOR} />);
  }
  for (let y = -MAJOR; y <= H + MAJOR; y += MINOR) {
    minorLines.push(<line key={`h${y}`} x1={-MAJOR} y1={y} x2={W + MAJOR} y2={y} />);
  }
  const majorLines: React.ReactNode[] = [];
  for (let x = -MAJOR; x <= W + MAJOR; x += MAJOR) {
    majorLines.push(<line key={`V${x}`} x1={x} y1={-MAJOR} x2={x} y2={H + MAJOR} />);
  }
  for (let y = -MAJOR; y <= H + MAJOR; y += MAJOR) {
    majorLines.push(<line key={`H${y}`} x1={-MAJOR} y1={y} x2={W + MAJOR} y2={y} />);
  }

  return (
    <div className="absolute inset-0" style={{ background: 'var(--color-bg)' }}>
      {/* soft radial lift behind center */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 1400px 900px at 50% 44%, rgba(13,21,48,0.85) 0%, rgba(6,11,24,0) 62%)',
        }}
      />
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0"
        style={{ overflow: 'hidden' }}
      >
        <g transform={`translate(${drift * 0.35}, ${drift * 0.2})`}>
          <g stroke="rgba(127,191,184,0.05)" strokeWidth={1}>
            {minorLines}
          </g>
          <g stroke="rgba(200,169,110,0.065)" strokeWidth={1}>
            {majorLines}
          </g>
        </g>
        {/* corner registration marks */}
        <g stroke="rgba(200,169,110,0.5)" strokeWidth={2} fill="none">
          <path d="M60 92 V60 H92" />
          <path d={`M${W - 92} 60 H${W - 60} V92`} />
          <path d={`M60 ${H - 92} V${H - 60} H92`} />
          <path d={`M${W - 92} ${H - 60} H${W - 60} V${H - 92}`} />
        </g>
      </svg>
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 1750px 1150px at 50% 50%, rgba(0,0,0,0) 55%, rgba(2,4,10,0.55) 100%)',
        }}
      />
    </div>
  );
});
