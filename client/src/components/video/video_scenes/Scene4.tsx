import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4500),
      setTimeout(() => setPhase(4), 9500),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, rotateY: 90 }}
      transition={{ duration: 1 }}
    >
      <div className="w-[85vw] h-[75vh] flex">
        <div className="w-1/2 pr-12 flex flex-col justify-center">
          <motion.div
            className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            Stage 03
          </motion.div>
          <motion.h2
            className="font-serif text-[4.5vw] leading-[1.1] text-white font-light mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          >
            Clinical Skills<br />Arcade
          </motion.h2>
          <motion.p
            className="text-[#e8e4df]/70 text-[1.2vw] leading-relaxed mb-8"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            Interactive scenarios test your decision-making. Score below the pass mark and a trainer steps in with remediation notes and a focused retake.
          </motion.p>
        </div>

        <div className="w-1/2 relative h-full flex items-center justify-center">
          <motion.div
            className="absolute w-[80%] aspect-video bg-[#0a1128] rounded-[16px] border border-[#1e2640] shadow-2xl overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 100, rotateZ: 5 }}
            animate={phase >= 2 ? { opacity: 1, y: 0, rotateZ: -2 } : { opacity: 0, y: 100, rotateZ: 5 }}
            transition={{ type: 'spring', stiffness: 80, damping: 15 }}
          >
            <div className="h-12 bg-[#060b18] border-b border-[#1e2640] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
            </div>
            <div className="flex-1 p-8 flex flex-col justify-center">
              <div className="w-16 h-16 rounded bg-[#60a5fa]/20 flex items-center justify-center mb-6">
                <span className="text-[#60a5fa] text-2xl">●</span>
              </div>
              <h3 className="text-xl text-white font-medium mb-2">Scenario: Deteriorating Patient</h3>
              <p className="text-[#8a8580] text-sm mb-6">A 68-year-old post-op patient shows signs of sepsis…</p>

              <motion.div
                className="w-full h-12 rounded bg-[#C8A96E] flex items-center justify-center text-[#060b18] font-medium"
                initial={{ scale: 0.9 }}
                animate={phase >= 3 ? { scale: [1, 1.05, 1] } : { scale: 0.9 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                Launch Module
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            className="absolute right-0 bottom-[10%] w-[50%] p-6 bg-[#111b3a] rounded-[16px] border border-[#34d399]/30 shadow-2xl flex flex-col items-center"
            initial={{ opacity: 0, x: 50, rotateZ: -10 }}
            animate={phase >= 3 ? { opacity: 1, x: 0, rotateZ: 5 } : { opacity: 0, x: 50, rotateZ: -10 }}
            transition={{ type: 'spring', stiffness: 100 }}
          >
            <div className="text-[3vw] font-serif text-[#34d399] mb-1">94%</div>
            <div className="text-xs uppercase tracking-widest text-[#e8e4df]">Pass Rate</div>
          </motion.div>

          {/* Trainer remediation card */}
          <motion.div
            className="absolute left-[-4%] top-[6%] w-[55%] p-5 bg-[#111b3a] rounded-[16px] border border-[#C8A96E]/40 shadow-2xl"
            initial={{ opacity: 0, x: -60, rotateZ: -6 }}
            animate={
              phase >= 4
                ? { opacity: 1, x: 0, rotateZ: -3 }
                : { opacity: 0, x: -60, rotateZ: -6 }
            }
            transition={{ type: 'spring', stiffness: 90, damping: 14 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#C8A96E]/20 flex items-center justify-center text-[#C8A96E] text-sm">
                T
              </div>
              <div className="text-[#C8A96E] uppercase tracking-widest text-[10px]">
                Trainer remediation
              </div>
            </div>
            <div className="text-[#e8e4df] text-sm leading-snug mb-3">
              "Re-review NEWS2 escalation thresholds before retake."
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-[#8a8580]">Retake unlocked</div>
              <div className="px-2 py-1 rounded bg-[#34d399]/10 text-[#34d399] text-[10px] uppercase tracking-widest">
                Ready
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
