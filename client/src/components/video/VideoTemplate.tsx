import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';

const SCENE_DURATIONS = {
  welcome: 12000,
  compliance: 16000,
  declarations: 14000,
  arcade: 20000,
  availability: 18000,
  invoicing: 18000,
  wrapup: 12000,
};

type Caption = { at: number; text: string };

const SCENE_CAPTIONS: Caption[][] = [
  [
    { at: 0, text: 'Welcome to Basecamp.' },
    { at: 4000, text: 'Sign in with your magic link or Microsoft 365 single sign-on.' },
    { at: 8500, text: 'Your portal opens to your personal onboarding hub.' },
  ],
  [
    { at: 0, text: 'Stage one: Compliance.' },
    { at: 3500, text: 'Upload your NMC PIN, DBS, passport and certificates.' },
    { at: 8000, text: 'Our AI screens documents in seconds and flags anything missing.' },
    { at: 12500, text: 'Verified files are filed straight to SharePoint.' },
  ],
  [
    { at: 0, text: 'Stage two: Competency declarations.' },
    { at: 4000, text: 'Confirm the clinical skills you can safely practise.' },
    { at: 8500, text: 'Two professional referees are emailed automatically.' },
  ],
  [
    { at: 0, text: 'Stage three: the Clinical Skills Arcade.' },
    { at: 4000, text: 'Work through interactive scenarios and earn a score.' },
    { at: 9000, text: 'If you slip below the pass mark, a trainer reviews your answers,' },
    { at: 13500, text: 'leaves remediation notes, and unlocks a focused retake.' },
  ],
  [
    { at: 0, text: 'Stage four: Availability.' },
    { at: 3500, text: 'Left-click to paint Day or Night shifts across the calendar.' },
    { at: 8000, text: 'Right-click any cell for the status menu — available, unavailable, booked.' },
    { at: 13000, text: 'EWTD safety notices warn you about double shifts and rest periods.' },
  ],
  [
    { at: 0, text: 'Stage five: Timesheets and invoicing.' },
    { at: 3500, text: 'Submit hours and expenses straight from the portal.' },
    { at: 7500, text: 'A PDF is generated and emailed to invoices@livaware.co.uk.' },
    { at: 12000, text: 'Re-download any approved invoice from your portal at any time.' },
  ],
  [
    { at: 0, text: 'That is Basecamp, end to end.' },
    { at: 4500, text: 'Compliance, competency, arcade, availability and invoicing — all in one portal.' },
    { at: 9000, text: 'Welcome aboard.' },
  ],
];

function captionFor(scene: number, elapsed: number): string {
  const list = SCENE_CAPTIONS[scene] ?? [];
  let current = '';
  for (const c of list) {
    if (elapsed >= c.at) current = c.text;
    else break;
  }
  return current;
}

export default function VideoTemplate() {
  const { currentScene, elapsedInScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  const caption = captionFor(currentScene, elapsedInScene);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#060b18] font-sans text-[#e8e4df]">
      {/* Persistent background layer */}
      <div className="absolute inset-0">
        <video
          src={`${import.meta.env.BASE_URL}videos/bg-loop.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-[#060b18]/60 mix-blend-multiply" />
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")" }}
        />
      </div>

      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="welcome" />}
        {currentScene === 1 && <Scene2 key="compliance" />}
        {currentScene === 2 && <Scene3 key="declarations" />}
        {currentScene === 3 && <Scene4 key="arcade" />}
        {currentScene === 4 && <Scene5 key="availability" />}
        {currentScene === 5 && <Scene6 key="invoicing" />}
        {currentScene === 6 && <Scene7 key="wrapup" />}
      </AnimatePresence>

      {/* Narration captions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center pb-8">
        <AnimatePresence mode="wait">
          {caption && (
            <motion.div
              key={`${currentScene}-${caption}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="max-w-[80%] rounded-md bg-[#060b18]/80 px-6 py-3 text-center font-sans text-[1.05vw] tracking-wide text-[#f3efe8] backdrop-blur-sm ring-1 ring-[#C8A96E]/30"
            >
              {caption}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
