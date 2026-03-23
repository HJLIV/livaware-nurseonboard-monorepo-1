export const BRAND = {
  bg: "#060b18",
  surface: "#0a1128",
  card: "#0d1530",
  cardHover: "#111b3a",
  text: "#e8e4df",
  textSoft: "#c0bab2",
  muted: "#8a8580",
  subtle: "#5a5550",
  accent: "#C8A96E",
  accentDim: "#a08850",
  accentGlow: "rgba(200,169,110,0.15)",
  border: "#1e2640",
  success: "#4ade80",
  successGlow: "rgba(74,222,128,0.15)",
  danger: "#f87171",
  dangerGlow: "rgba(248,113,113,0.15)",
};

export const FONT = {
  heading: "'Fraunces', serif",
  body: "'Be Vietnam Pro', sans-serif",
  mono: "'Be Vietnam Pro', sans-serif",
};

export const DOMAIN_COLORS: Record<string, string> = {
  "Clinical Reasoning": "#60a5fa",
  "Scope & Safety": "#f59e0b",
  "Relational Intelligence": "#a78bfa",
  "Clinical Competence": "#34d399",
  "Contextual Awareness": "#f472b6",
  "Self-Knowledge": "#22d3ee",
  "The Human Question": "#C8A96E",
};

export const GLOBAL_STYLES = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ::selection { background: rgba(200,169,110,0.3); color: #e8e4df; }
  textarea:focus, input:focus { outline: none; border-color: #C8A96E !important; box-shadow: 0 0 0 1px rgba(200,169,110,0.3) !important; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`;

export const GRADIENTS = {
  radial: "radial-gradient(ellipse at 30% 20%, rgba(200,169,110,0.06) 0%, transparent 70%)",
  overlay: "linear-gradient(180deg, transparent 0%, rgba(6,11,24,0.8) 100%)",
};

export const GRAIN_TEXTURE = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")";

export const SHADOW = {
  sm: "0 1px 3px rgba(0,0,0,0.3)",
  md: "0 4px 12px rgba(0,0,0,0.3)",
  lg: "0 8px 24px rgba(0,0,0,0.4)",
};

export const LAYOUT = {
  maxWidth: 720,
  padding: 24,
};

export const TYPOGRAPHY = {
  eyebrow: { fontSize: 10, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase" as const },
  h1: { fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 400, lineHeight: 1.15 },
  body: { fontSize: 15, lineHeight: 1.7 },
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
};

export const ACCESSIBILITY = {
  focusRing: `0 0 0 2px ${BRAND.bg}, 0 0 0 4px ${BRAND.accent}`,
};
