import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  BRAND,
  FONT,
  DOMAIN_COLORS,
  GLOBAL_STYLES,
  GRADIENTS,
  GRAIN_TEXTURE,
  SHADOW,
  LAYOUT,
  TYPOGRAPHY,
  RADIUS,
  ACCESSIBILITY,
} from "@/lib/design-system";

const INTRO = {
  tagline: "Nurse Pre-Onboarding · Community Complex Care",
  title: "Before we meet you,\nwe'd like to know you.",
  body: [
    "Livaware works exclusively in the home. No ward. No crash team behind the door. No senior nurse three bays down. Just you, your patient, their family — and what you bring into that room.",
    "If you're coming from hospital practice, that's the background we value. The clinical skills you've built are real — this assessment explores how you'd apply them when the safety nets change.",
    "This is a conversation — time-limited and sequential — designed to show us how you think, how you hold complexity, and what kind of nurse you are when the pressure is real. Some scenarios will be unfamiliar. That's intentional. We're not testing what you've done. We want to see how you think.",
    "Our patients carry diagnoses like metastatic lung cancer, leptomeningeal carcinomatosis, tracheostomy-dependence, and end-stage organ failure. Their families are often frightened, sometimes demanding, occasionally in denial. The homes we work in range from NHS-funded flat-shares to Mayfair residences. Our clinical practice is grounded in UK law, NMC standards, and BNF pharmacology.",
    "What holds all of that together is the quality of the nurse. That's what we're trying to understand here.",
  ],
  rules: [
    { text: "Each question has a time limit. The clock starts when the question appears." },
    { text: "Questions are sequential and cannot be revisited. Set aside 25–35 minutes." },
    { text: "Responses lock on submission. Write as you'd speak — not as you'd document." },
  ],
};

const QUESTIONS = [
  {
    id: 1,
    tag: "Lone Working · Deterioration",
    domain: "Clinical Reasoning",
    timeLimit: 210,
    context: "You're on a solo day shift in a private residence in Kensington. Your patient — 71, metastatic lung cancer, PICC in situ, receiving IV tazocin (piperacillin/tazobactam) for a suspected lower respiratory tract infection — has been increasingly drowsy since you arrived at 09:00. It is now 10:40. Their SpO₂ is 89% on room air (baseline 94%), RR 22, HR 108, temp 37.1, BP 108/68. They're rousable but confused — they know their name but not the date. Their daughter is downstairs, unaware of the change.",
    prompt: "There is no ward doctor to fast-bleep. Walk us through your next 20 minutes — not the protocol, your actual decision-making. What do you do, in what order, and why?",
    hint: "Show us your clinical instinct and escalation logic. If you've only worked in hospital, think about what changes when you're alone — no crash team, no registrar on call. How do you adapt?",
    minChars: 120,
  },
  {
    id: 2,
    tag: "Tracheostomy · Competence Honesty",
    domain: "Scope & Safety",
    timeLimit: 150,
    context: "You are offered a shift covering a patient with a long-term cuffed tracheostomy, suctioning three times daily, HME in place. The family tells you in the referral call that they prefer nurses who are 'confident and don't ask too many questions'. In community care, you'd be working alone with this patient in their home.",
    prompt: "You haven't performed tracheostomy suctioning since your previous post, two years ago. How do you handle this — with the family, with the clinical lead, and internally?",
    hint: "This is about the relationship between competence, honesty, and professional accountability — not tracheostomy technique.",
    minChars: 100,
  },
  {
    id: 3,
    tag: "Palliative Care · Family Dynamics",
    domain: "Relational Intelligence",
    timeLimit: 180,
    context: "Your patient is a 68-year-old man, end-stage biliary cancer, ECOG 3, on a syringe driver with diamorphine and midazolam. He is drowsy but intermittently lucid. His wife sits at the bedside most of the day. His adult son arrived from abroad two days ago and believes his father 'just needs better nutrition' and has been bringing in protein shakes, trying to get his father to drink them.",
    prompt: "You witness the son lifting his father's head and coaxing him to drink. The patient makes a weak sound of protest. Describe exactly how you handle this moment — what you say, how you position yourself, and what you do next.",
    hint: "We're looking for presence and relational skill as much as clinical authority. What you don't say matters as much as what you do.",
    minChars: 100,
  },
  {
    id: 4,
    tag: "Syringe Driver · IV Therapy",
    domain: "Clinical Competence",
    timeLimit: 120,
    context: null,
    prompt: "Name two clinical situations where you would pause or not initiate a CSCI (continuous subcutaneous infusion), and explain your reasoning for each. Then tell us about your experience with syringe drivers — have you set one up or managed one independently? If so, what device was used, and what was the regime? Use BNF drug names and doses where you can.",
    hint: "If you haven't managed a CSCI before, say so — and tell us what you'd want to know before doing it. We're testing honesty and clinical reasoning, not expecting everyone to have the same experience.",
    minChars: 80,
  },
  {
    id: 5,
    tag: "UHNW Environment · Professional Boundaries",
    domain: "Contextual Awareness",
    timeLimit: 150,
    context: "It is your third shift with a long-term patient — a 79-year-old retired surgeon, post-stroke, significant left-sided weakness, cognitively intact and sharp. He is charming and has already asked you about your personal life twice. On this shift, his PA approaches you and says: 'Mr [X] would like to give you a gift — an envelope — to thank you for your care. He asked me to give it to you privately.'",
    prompt: "How do you respond to the PA in that moment? And how — if at all — do you document or escalate what just happened?",
    hint: "No trick here. We want to understand how you hold professional boundaries in an environment where power and gratitude are often tangled.",
    minChars: 80,
  },
  {
    id: 6,
    tag: "Self-Knowledge",
    domain: "Professional Identity",
    timeLimit: 120,
    context: null,
    prompt: "Tell us about a clinical decision you made — in any setting — that still sits with you. Not because it was wrong, but because it was hard. You don't need to resolve it. Just describe it.",
    hint: "We're not looking for a lesson or a redemption arc. We want the texture of the moment.",
    minChars: 100,
  },
  {
    id: 7,
    tag: "The Human Question",
    domain: "Who You Are",
    timeLimit: 90,
    context: null,
    prompt: "Outside of nursing — what's something you're genuinely interested in right now? Not a hobby for your CV. Something that actually has your attention.",
    hint: "This one is just for us to know you.",
    minChars: 40,
  },
];

const COMPLETION = {
  title: "Thank you.",
  lines: [
    "Your responses have been received. Hemmen or a member of the Livaware clinical team will read them personally.",
    "We don't use scoring algorithms or keyword filters. We read for reasoning, honesty, and the kind of presence that can't be faked.",
    "Expect to hear from us within five working days.",
  ],
  footer: "Livaware Ltd · London · Nurse-Led · Complex & Palliative Care",
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const tagColors = DOMAIN_COLORS;

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

const ruleIcons = [IconClock, IconArrowRight, IconLock];

function GrainOverlay() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0.035,
        mixBlendMode: "overlay",
        backgroundImage: GRAIN_TEXTURE,
        backgroundRepeat: "repeat",
        backgroundSize: "128px 128px",
      }}
    />
  );
}

function AtmosphericBg() {
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,169,110,0.04) 0%, transparent 70%)",
          top: "-8%",
          right: "-8%",
          animation: "gentleDrift 25s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(93,184,138,0.025) 0%, transparent 70%)",
          bottom: "-4%",
          left: "-8%",
          animation: "gentleDrift 30s ease-in-out infinite reverse",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(106,158,190,0.025) 0%, transparent 70%)",
          top: "40%",
          left: "50%",
          transform: "translateX(-50%)",
          animation: "gentleDrift 35s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function GoldDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: 1,
        background: `linear-gradient(90deg, transparent, ${BRAND.accent}40, ${BRAND.accent}60, ${BRAND.accent}40, transparent)`,
      }}
    />
  );
}

function Wordmark({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <img
        data-testid="wordmark"
        src="/images/livaware-logo.png"
        alt="Livaware"
        style={{
          height: size === "small" ? 22 : 84,
          width: "auto",
          filter: "brightness(1.05)",
        }}
      />
    </div>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  const color = tagColors[domain] || BRAND.muted;
  return (
    <span
      data-testid={`badge-domain-${domain.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        display: "inline-block",
        padding: "5px 12px",
        borderRadius: 3,
        background: `${color}14`,
        border: `1px solid ${color}30`,
        color: color,
        fontFamily: FONT.mono,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      {domain}
    </span>
  );
}

function ProgressRail({ total, current }: { total: number; current: number }) {
  return (
    <div data-testid="progress-rail" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total} aria-label={`Question ${current + 1} of ${total}`} style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 3,
            width: i === current ? 32 : 14,
            borderRadius: 2,
            background:
              i < current
                ? BRAND.success
                : i === current
                ? `linear-gradient(90deg, ${BRAND.accent}, ${BRAND.accentDim})`
                : `${BRAND.border}80`,
            transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            boxShadow: i === current ? `0 0 8px ${BRAND.accentGlow}` : "none",
          }}
        />
      ))}
    </div>
  );
}

interface NurseInfo {
  name: string;
  email: string;
  phone: string;
}

function InfoCollectionScreen({ onSubmit }: { onSubmit: (info: NurseInfo) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter your full name";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({ name: name.trim(), email: email.trim(), phone: phone.trim() });
    } else {
      const firstKey = !name.trim() ? "nurse-name" : "nurse-email";
      document.getElementById(firstKey)?.focus();
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BRAND.bg,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px 60px",
        position: "relative",
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <AtmosphericBg />
      <GrainOverlay />

      <main
        style={{
          maxWidth: 480,
          width: "100%",
          position: "relative",
          zIndex: 1,
          animation: "fadeUp 0.7s ease-out both",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <Wordmark />
        </div>

        <div
          style={{
            fontFamily: FONT.mono,
            color: BRAND.accentDim,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 16,
            animation: "fadeUp 0.7s ease-out 0.08s both",
          }}
        >
          Before we begin
        </div>

        <h1
          style={{
            fontFamily: FONT.heading,
            color: BRAND.text,
            fontSize: "clamp(24px, 4.5vw, 36px)",
            fontWeight: 400,
            lineHeight: 1.25,
            marginBottom: 10,
            letterSpacing: "-0.01em",
            animation: "fadeUp 0.7s ease-out 0.12s both",
          }}
        >
          Tell us who you are.
        </h1>

        <p
          style={{
            fontFamily: FONT.body,
            color: BRAND.muted,
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 24,
            animation: "fadeUp 0.7s ease-out 0.16s both",
          }}
        >
          Your details stay confidential.
        </p>

        <div style={{ animation: "fadeUp 0.7s ease-out 0.2s both" }}>
          <GoldDivider />
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div
            style={{
              paddingTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 22,
              animation: "fadeUp 0.7s ease-out 0.24s both",
            }}
          >
            {[
              { label: "Full Name", required: true, value: name, onChange: setName, placeholder: "e.g. Sarah Thompson", type: "text", testId: "input-name", fieldId: "nurse-name", error: errors.name, autoComplete: "name" },
              { label: "Email Address", required: true, value: email, onChange: setEmail, placeholder: "e.g. sarah@example.com", type: "email", testId: "input-email", fieldId: "nurse-email", error: errors.email, autoComplete: "email" },
              { label: "Phone", required: false, value: phone, onChange: setPhone, placeholder: "e.g. 07700 123456", type: "tel", testId: "input-phone", fieldId: "nurse-phone", error: undefined, autoComplete: "tel" },
            ].map((field) => (
              <div key={field.testId}>
                <label
                  htmlFor={field.fieldId}
                  style={{
                    fontFamily: FONT.mono,
                    color: BRAND.muted,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  {field.label} {field.required ? <span style={{ color: BRAND.accent }} aria-hidden="true">*</span> : <span style={{ color: BRAND.subtle, fontSize: 9, letterSpacing: "0.1em" }}>(optional)</span>}
                </label>
                <input
                  id={field.fieldId}
                  data-testid={field.testId}
                  className="assessment-input"
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  aria-invalid={!!field.error}
                  aria-describedby={field.error ? `${field.fieldId}-error` : undefined}
                  aria-required={field.required}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    minHeight: 48,
                    background: BRAND.card,
                    border: `1px solid ${field.error ? BRAND.danger : BRAND.border}`,
                    borderRadius: 6,
                    color: BRAND.text,
                    fontSize: 14,
                    fontFamily: FONT.body,
                    fontWeight: 400,
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    boxShadow: field.error ? `0 0 0 1px ${BRAND.dangerGlow}` : "none",
                  }}
                />
                {field.error && (
                  <p id={`${field.fieldId}-error`} role="alert" style={{ color: BRAND.danger, fontSize: 12, marginTop: 8, fontFamily: FONT.mono, fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {field.error}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ animation: "fadeUp 0.7s ease-out 0.32s both", marginTop: 28 }}>
            <button
              data-testid="button-continue"
              className="btn-outline"
              type="submit"
              style={{
                padding: "0 48px",
                minHeight: 48,
                background: "transparent",
                border: `1px solid ${BRAND.accent}`,
                color: BRAND.accent,
                fontSize: 11,
                fontFamily: FONT.mono,
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 4,
              }}
            >
              Continue
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8, verticalAlign: "middle" }} aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * duration;
    setProgress(ratio);
  };

  return (
    <div
      data-testid="audio-player"
      style={{
        background: `linear-gradient(135deg, ${BRAND.card} 0%, ${BRAND.surface} 100%)`,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        padding: "18px 22px",
        marginBottom: 28,
        animation: "fadeUp 0.6s ease-out 0.42s both",
        boxShadow: playing ? `0 0 24px ${BRAND.accentGlow}` : `0 2px 12px rgba(0,0,0,0.15)`,
        transition: "box-shadow 0.4s ease",
      }}
    >
      <audio
        ref={audioRef}
        src="/intro-narration.mp3"
        onLoadedMetadata={(e) => { setDuration((e.target as HTMLAudioElement).duration); setLoaded(true); }}
        onTimeUpdate={(e) => {
          const audio = e.target as HTMLAudioElement;
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          data-testid="button-audio-play"
          onClick={toggle}
          aria-label={playing ? "Pause narration" : "Play narration"}
          type="button"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: `1.5px solid ${playing ? BRAND.accent : BRAND.border}`,
            background: playing ? `${BRAND.accentGlow}` : BRAND.bg,
            color: playing ? BRAND.accent : BRAND.muted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all 0.2s ease",
            boxShadow: playing ? `0 0 12px ${BRAND.accentGlow}` : "none",
          }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="4" width="4" height="16" rx="1" />
              <rect x="15" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginLeft: 2 }}>
              <path d="M5 4l15 8-15 8V4z" />
            </svg>
          )}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: FONT.body, fontSize: 12, color: BRAND.text, fontWeight: 500 }}>
              Listen to an introduction
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, color: BRAND.muted, fontVariantNumeric: "tabular-nums" }}>
              {loaded ? formatTime(progress * duration) + " / " + formatTime(duration) : "–:––"}
            </span>
          </div>
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Audio progress"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 4,
              background: BRAND.border,
              borderRadius: 4,
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress * 100}%`,
                background: BRAND.accent,
                borderRadius: 4,
                transition: playing ? "none" : "width 0.1s",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BRAND.bg,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px 24px 100px",
        position: "relative",
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <AtmosphericBg />
      <GrainOverlay />

      <main
        style={{
          maxWidth: 620,
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ marginBottom: 56, animation: "fadeUp 0.7s ease-out both" }}>
          <Wordmark />
        </div>

        <div
          style={{
            fontFamily: FONT.mono,
            color: BRAND.accentDim,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 24,
            animation: "fadeUp 0.7s ease-out 0.06s both",
          }}
        >
          {INTRO.tagline}
        </div>

        <h1
          style={{
            fontFamily: FONT.heading,
            color: BRAND.text,
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 400,
            lineHeight: 1.2,
            marginBottom: 48,
            letterSpacing: "-0.01em",
            whiteSpace: "pre-line",
            animation: "fadeUp 0.7s ease-out 0.1s both",
          }}
        >
          {INTRO.title}
        </h1>

        <div style={{ animation: "fadeUp 0.7s ease-out 0.14s both" }}>
          <GoldDivider />
        </div>

        <div style={{ paddingTop: 40, marginBottom: 40 }}>
          {INTRO.body.map((para, i) => (
            <p
              key={i}
              style={{
                fontFamily: FONT.body,
                color: i === 0 ? BRAND.text : BRAND.textSoft,
                fontSize: i === 0 ? 15 : 14,
                lineHeight: 1.85,
                marginBottom: 22,
                maxWidth: 580,
                animation: `fadeUp 0.6s ease-out ${0.18 + i * 0.06}s both`,
              }}
            >
              {para}
            </p>
          ))}
        </div>

        <AudioPlayer />

        <div
          style={{
            background: `linear-gradient(145deg, ${BRAND.card} 0%, ${BRAND.surface} 100%)`,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: "24px 28px",
            marginBottom: 44,
            animation: "fadeUp 0.6s ease-out 0.48s both",
            boxShadow: `0 2px 16px rgba(0,0,0,0.15)`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {INTRO.rules.map((r, i) => {
              const Icon = ruleIcons[i];
              return (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ marginTop: 2, minWidth: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon />
                  </span>
                  <span
                    style={{
                      color: BRAND.muted,
                      fontSize: 12,
                      lineHeight: 1.7,
                      fontFamily: FONT.mono,
                      fontWeight: 400,
                    }}
                  >
                    {r.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ animation: "fadeUp 0.6s ease-out 0.54s both" }}>
          <button
            data-testid="button-begin"
            className="btn-primary"
            onClick={onStart}
            style={{
              padding: "0 52px",
              minHeight: 48,
              background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.accentDim})`,
              border: "none",
              color: BRAND.bg,
              fontSize: 12,
              fontFamily: FONT.mono,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            Begin Assessment
          </button>
        </div>

        <p
          style={{
            marginTop: 20,
            fontFamily: FONT.mono,
            color: BRAND.subtle,
            fontSize: 11,
            fontWeight: 400,
            animation: "fadeUp 0.6s ease-out 0.6s both",
          }}
        >
          7 questions · approximately 25–35 minutes
        </p>
      </main>
    </div>
  );
}

interface QuestionType {
  id: number;
  tag: string;
  domain: string;
  timeLimit: number;
  context: string | null;
  prompt: string;
  hint: string;
  minChars: number;
}

function QuestionScreen({
  question,
  index,
  total,
  onSubmit,
}: {
  question: QuestionType;
  index: number;
  total: number;
  onSubmit: (text: string, timeLeft: number) => void;
}) {
  const [text, setText] = useState("");
  const [timeLeft, setTimeLeft] = useState(question.timeLimit);
  const [submitted, setSubmitted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [warning, setWarning] = useState(false);
  const [timerAnnouncement, setTimerAnnouncement] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const min = question.minChars;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      setSpeechSupported(true);
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-GB";

      let finalTranscript = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
            setText((prev) => {
              const spacer = prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
              return prev + spacer + transcript.trim();
            });
          } else {
            interim = transcript;
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "aborted" && event.error !== "no-speech") {
          console.warn("Speech recognition error:", event.error);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, [question.id]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current || submitted || timeLeft === 0) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }, [isListening, submitted, timeLeft]);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    textareaRef.current?.focus();
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          setTimerAnnouncement("Time is up");
          return 0;
        }
        if (t <= 40) setWarning(true);
        const next = t - 1;
        if (next === 60) setTimerAnnouncement("One minute remaining");
        else if (next === 30) setTimerAnnouncement("30 seconds remaining");
        else if (next === 10) setTimerAnnouncement("10 seconds remaining");
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [question.id]);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    const trimmed = text.trim();
    if (trimmed.length < min && timeLeft > 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
    setIsListening(false);
    setSubmitted(true);
    setTimeout(() => onSubmit(trimmed || "(No response — time expired)", timeLeft), 700);
  }, [submitted, text, min, onSubmit, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && !submitted) {
      handleSubmit();
    }
  }, [timeLeft, submitted, handleSubmit]);

  const chars = text.trim().length;
  const ready = chars >= min;
  const timePct = timeLeft / question.timeLimit;
  const timerColor = warning ? BRAND.danger : timePct > 0.5 ? BRAND.success : BRAND.accent;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BRAND.bg,
        display: "flex",
        flexDirection: "column",
        padding: "36px 24px 60px",
        fontFamily: FONT.body,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        position: "relative",
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <AtmosphericBg />
      <GrainOverlay />

      <div style={{ maxWidth: 700, margin: "0 auto", width: "100%", marginBottom: 28, position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Wordmark size="small" />
          <ProgressRail total={total} current={index} />
        </div>

        <div
          aria-hidden="true"
          style={{
            height: 2,
            background: `${BRAND.border}60`,
            borderRadius: 1,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            data-testid="timer-bar"
            style={{
              height: "100%",
              width: `${timePct * 100}%`,
              background: `linear-gradient(90deg, ${timerColor}, ${timerColor}CC)`,
              borderRadius: 1,
              transition: "width 1s linear, background 0.3s ease",
              boxShadow: warning ? `0 0 10px ${BRAND.dangerGlow}` : `0 0 6px ${timerColor}25`,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <DomainBadge domain={question.domain} />
            <span
              style={{
                fontFamily: FONT.mono,
                color: BRAND.subtle,
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {question.tag}
            </span>
          </div>
          <span
            data-testid="text-timer"
            aria-hidden="true"
            style={{
              fontFamily: FONT.mono,
              fontSize: 14,
              fontWeight: 500,
              color: warning ? BRAND.danger : BRAND.muted,
              letterSpacing: "0.06em",
              fontVariantNumeric: "tabular-nums",
              animation: warning ? "timerPulse 1s ease-in-out infinite" : "none",
            }}
          >
            {formatTime(timeLeft)}
          </span>
          {timerAnnouncement && (
            <span role="status" aria-live="assertive" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
              {timerAnnouncement}
            </span>
          )}
        </div>
      </div>

      <main style={{ maxWidth: 700, margin: "0 auto", width: "100%", flex: 1, position: "relative", zIndex: 1 }}>
        {question.context && (
          <div
            style={{
              background: `linear-gradient(145deg, ${BRAND.surface} 0%, ${BRAND.card}80 100%)`,
              border: `1px solid ${BRAND.border}`,
              borderLeft: `3px solid ${BRAND.accentDim}`,
              borderRadius: "0 8px 8px 0",
              padding: "22px 24px",
              marginBottom: 24,
              boxShadow: `0 2px 12px rgba(0,0,0,0.12)`,
            }}
          >
            <p
              style={{
                fontFamily: FONT.mono,
                color: BRAND.accentDim,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Clinical Context
            </p>
            <p
              style={{
                fontFamily: FONT.body,
                color: `${BRAND.text}DD`,
                fontSize: 13.5,
                lineHeight: 1.8,
                maxWidth: 640,
              }}
            >
              {question.context}
            </p>
          </div>
        )}

        <div
          style={{
            background: `linear-gradient(145deg, ${BRAND.card} 0%, ${BRAND.cardHover} 100%)`,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: "28px 28px 24px",
            marginBottom: 16,
            boxShadow: `0 4px 20px rgba(0,0,0,0.18)`,
            animation: "glowPulse 8s ease-in-out infinite",
          }}
        >
          <p
            data-testid="text-question-number"
            style={{
              fontFamily: FONT.mono,
              color: BRAND.subtle,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Question {index + 1} of {total}
          </p>
          <p
            data-testid="text-question-prompt"
            style={{
              fontFamily: FONT.body,
              color: BRAND.text,
              fontSize: 15,
              lineHeight: 1.8,
              fontWeight: 400,
              maxWidth: 620,
            }}
          >
            {question.prompt}
          </p>
        </div>

        <button
          data-testid="button-hint"
          onClick={() => setShowHint(!showHint)}
          style={{
            background: "none",
            border: "none",
            color: BRAND.accentDim,
            fontFamily: FONT.mono,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            padding: "8px 0",
            minHeight: 44,
            marginBottom: showHint ? 4 : 12,
            transition: "color 0.2s ease",
            borderBottom: `1px dotted ${BRAND.accentDim}40`,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showHint ? "rotate(45deg)" : "none", transition: "transform 0.2s ease" }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {showHint ? "Hide guidance" : "What are you looking for?"}
        </button>

        {showHint && (
          <div
            className="hint-reveal"
            style={{
              padding: "14px 18px",
              borderLeft: `2px solid ${BRAND.accentDim}50`,
              marginBottom: 16,
              background: BRAND.accentGlow,
              borderRadius: "0 6px 6px 0",
            }}
          >
            <p
              data-testid="text-hint"
              style={{
                color: BRAND.muted,
                fontFamily: FONT.mono,
                fontSize: 12,
                lineHeight: 1.75,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              {question.hint}
            </p>
          </div>
        )}

        <div style={{ position: "relative" }}>
          <label htmlFor="response-textarea" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
            Your response to question {index + 1}
          </label>
          <textarea
            id="response-textarea"
            data-testid="input-response"
            className="assessment-textarea"
            ref={textareaRef}
            value={text}
            onChange={(e) => !submitted && setText(e.target.value)}
            disabled={submitted || timeLeft === 0}
            aria-label={`Your response to question ${index + 1}`}
            placeholder={isListening ? "Listening — speak your response..." : "Type or tap the mic to speak your response..."}
            style={{
              width: "100%",
              minHeight: 180,
              background: submitted ? BRAND.surface : BRAND.card,
              border: `1px solid ${isListening ? BRAND.accent : submitted ? BRAND.success : ready ? `${BRAND.accent}50` : BRAND.border}`,
              borderRadius: 8,
              padding: "20px 22px 20px 22px",
              color: BRAND.text,
              fontSize: 14,
              lineHeight: 1.8,
              fontFamily: FONT.body,
              fontWeight: 400,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
              opacity: submitted ? 0.5 : 1,
              boxShadow: isListening
                ? `0 0 0 2px ${BRAND.accentGlow}, 0 0 20px ${BRAND.accentGlow}`
                : submitted
                ? `0 0 12px ${BRAND.successGlow}`
                : "none",
            }}
          />
          {speechSupported && !submitted && timeLeft > 0 && (
            <button
              data-testid="button-voice"
              onClick={toggleListening}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              type="button"
              style={{
                position: "absolute",
                bottom: 14,
                right: 14,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: isListening ? `2px solid ${BRAND.accent}` : `1px solid ${BRAND.border}`,
                background: isListening ? BRAND.accentGlow : BRAND.surface,
                color: isListening ? BRAND.accent : BRAND.muted,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow: isListening ? `0 0 16px ${BRAND.accentGlow}` : "none",
                animation: isListening ? "subtlePulse 1.5s ease-in-out infinite" : "none",
              }}
            >
              {isListening ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill={BRAND.accent} stroke="none" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}
        </div>
        {isListening && (
          <div
            data-testid="text-listening-indicator"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontFamily: FONT.mono,
              fontSize: 11,
              color: BRAND.accent,
              fontWeight: 400,
              letterSpacing: "0.08em",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: BRAND.accent, animation: "subtlePulse 1s ease-in-out infinite" }} aria-hidden="true" />
            Listening — speak clearly
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span
            data-testid="text-char-count"
            aria-live="polite"
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 400,
              color: ready ? BRAND.success : BRAND.subtle,
              transition: "color 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {ready ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                Ready — {chars} characters
              </>
            ) : (
              `${min - chars} more characters needed`
            )}
          </span>
          <button
            data-testid="button-submit-answer"
            className={ready && !submitted ? "btn-primary" : ""}
            onClick={handleSubmit}
            disabled={!ready || submitted}
            aria-disabled={!ready || submitted}
            style={{
              padding: "0 28px",
              minHeight: 44,
              background: ready && !submitted
                ? `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.accentDim})`
                : `${BRAND.border}80`,
              border: "none",
              borderRadius: 4,
              color: ready && !submitted ? BRAND.bg : BRAND.muted,
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: ready && !submitted ? "pointer" : "not-allowed",
              transition: "all 0.25s ease",
              opacity: !ready && !submitted ? 0.45 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {submitted ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                Submitted
              </>
            ) : (
              <>
                Submit
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

function CompletionScreen() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BRAND.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: FONT.body,
        position: "relative",
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <AtmosphericBg />
      <GrainOverlay />

      <main
        style={{
          maxWidth: 520,
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            border: `1.5px solid ${BRAND.success}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 40px",
            boxShadow: `0 0 20px ${BRAND.successGlow}, 0 0 40px ${BRAND.successGlow}`,
            animation: "fadeUp 0.6s ease-out both",
          }}
          aria-hidden="true"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>

        <div
          style={{
            fontFamily: FONT.mono,
            color: BRAND.accentDim,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 20,
            animation: "fadeUp 0.6s ease-out 0.08s both",
          }}
        >
          All responses received
        </div>

        <h1
          data-testid="text-completion-title"
          style={{
            fontFamily: FONT.heading,
            color: BRAND.text,
            fontSize: 40,
            fontWeight: 400,
            marginBottom: 40,
            letterSpacing: "-0.01em",
            animation: "fadeUp 0.6s ease-out 0.12s both",
          }}
        >
          {COMPLETION.title}
        </h1>

        {COMPLETION.lines.map((line, i) => (
          <p
            key={i}
            style={{
              fontFamily: FONT.body,
              color: BRAND.textSoft,
              fontSize: 14,
              lineHeight: 1.85,
              marginBottom: 20,
              maxWidth: 460,
              marginLeft: "auto",
              marginRight: "auto",
              animation: `fadeUp 0.5s ease-out ${0.16 + i * 0.06}s both`,
            }}
          >
            {line}
          </p>
        ))}

        <div
          style={{
            marginTop: 52,
            animation: "fadeUp 0.5s ease-out 0.4s both",
          }}
        >
          <GoldDivider />
          <div style={{ paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <Wordmark />
            <p
              style={{
                fontFamily: FONT.mono,
                color: BRAND.subtle,
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: "0.12em",
              }}
            >
              {COMPLETION.footer}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

type AnswerRecord = {
  questionId: number;
  tag: string;
  domain: string;
  prompt: string;
  response: string;
  timeSpent: number;
  timeLimit: number;
};

export default function AssessmentPage() {
  const [screen, setScreen] = useState<"info" | "intro" | "question" | "complete">("info");
  const [nurseInfo, setNurseInfo] = useState<NurseInfo>({ name: "", email: "", phone: "" });
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [portalToken, setPortalToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setPortalToken(token);
      fetch(`/api/portal/${token}`)
        .then((r) => {
          if (!r.ok) {
            console.warn("Portal token invalid or expired, falling back to manual entry");
            return null;
          }
          return r.json();
        })
        .then((data) => {
          if (data?.nurse) {
            setNurseInfo({
              name: data.nurse.fullName || "",
              email: data.nurse.email || "",
              phone: "",
            });
            setScreen("intro");
          }
        })
        .catch((err) => {
          console.error("Failed to fetch portal token:", err);
        });
    }
  }, []);

  const handleInfoSubmit = (info: NurseInfo) => {
    setNurseInfo(info);
    setScreen("intro");
  };

  const [submitError, setSubmitError] = useState(false);
  const [pendingAnswers, setPendingAnswers] = useState<AnswerRecord[] | null>(null);

  const submitAssessment = async (allAnswers: AnswerRecord[]) => {
    setSubmitting(true);
    setSubmitError(false);
    try {
      await apiRequest("POST", "/api/assessments", {
        nurseName: nurseInfo.name,
        nurseEmail: nurseInfo.email,
        nursePhone: nurseInfo.phone || null,
        responses: allAnswers,
        ...(portalToken ? { portalToken } : {}),
      });
      setSubmitting(false);
      setScreen("complete");
    } catch (err) {
      console.error("Failed to submit assessment:", err);
      setSubmitting(false);
      setSubmitError(true);
      setPendingAnswers(allAnswers);
    }
  };

  const handleAnswer = async (text: string, timeLeft: number) => {
    const q = QUESTIONS[currentQ];
    const record: AnswerRecord = {
      questionId: q.id,
      tag: q.tag,
      domain: q.domain,
      prompt: q.prompt,
      response: text,
      timeSpent: timeLeft,
      timeLimit: q.timeLimit,
    };
    const updated = [...answers, record];
    setAnswers(updated);

    if (currentQ + 1 < QUESTIONS.length) {
      setCurrentQ(currentQ + 1);
    } else {
      await submitAssessment(updated);
    }
  };

  if (screen === "info") return <InfoCollectionScreen onSubmit={handleInfoSubmit} />;
  if (screen === "intro") return <IntroScreen onStart={() => setScreen("question")} />;
  if (screen === "complete") return <CompletionScreen />;

  if (submitting || submitError) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: BRAND.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT.body,
          position: "relative",
        }}
      >
        <style>{GLOBAL_STYLES}</style>
        <AtmosphericBg />
        <GrainOverlay />
        <main style={{ textAlign: "center", maxWidth: 420, position: "relative", zIndex: 1 }}>
          {submitting ? (
            <>
              <div
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 44,
                  border: `2px solid ${BRAND.border}`,
                  borderTopColor: BRAND.accent,
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 24px",
                }}
              />
              <p role="status" style={{ color: BRAND.muted, fontFamily: FONT.mono, fontSize: 12, fontWeight: 400 }}>
                Submitting your responses...
              </p>
            </>
          ) : (
            <>
              <div
                aria-hidden="true"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  border: `1.5px solid ${BRAND.danger}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 28px",
                  boxShadow: `0 0 20px ${BRAND.dangerGlow}`,
                  animation: "fadeUp 0.4s ease-out both",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 role="alert" style={{ fontFamily: FONT.heading, color: BRAND.text, fontSize: 24, fontWeight: 400, marginBottom: 14 }}>
                Submission failed
              </h2>
              <p style={{ fontFamily: FONT.body, color: BRAND.muted, fontSize: 14, lineHeight: 1.75, marginBottom: 32 }}>
                Something went wrong. Your answers are still here — tap below to try again.
              </p>
              <button
                data-testid="button-retry-submit"
                className="btn-outline"
                onClick={() => pendingAnswers && submitAssessment(pendingAnswers)}
                style={{
                  padding: "0 40px",
                  minHeight: 48,
                  background: "transparent",
                  border: `1px solid ${BRAND.accent}`,
                  color: BRAND.accent,
                  fontSize: 11,
                  fontFamily: FONT.mono,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Retry Submission
              </button>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <QuestionScreen
      key={currentQ}
      question={QUESTIONS[currentQ]}
      index={currentQ}
      total={QUESTIONS.length}
      onSubmit={handleAnswer}
    />
  );
}
