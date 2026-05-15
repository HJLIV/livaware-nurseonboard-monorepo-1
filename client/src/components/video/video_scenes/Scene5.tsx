import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 8500),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, y: -100 }}
      transition={{ duration: 1 }}
    >
      <div className="w-[85vw] h-[75vh] flex flex-row-reverse">
        <div className="w-1/3 pl-12 flex flex-col justify-center">
          <motion.div
            className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase"
            initial={{ opacity: 0, x: 20 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          >
            Stage 04
          </motion.div>
          <motion.h2
            className="font-serif text-[4vw] leading-[1.1] text-white font-light mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          >
            Availability <br />Calendar
          </motion.h2>
          <motion.p
            className="text-[#e8e4df]/70 text-[1.2vw] leading-relaxed mb-6"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            Left-click to paint Day or Night shifts. Right-click any cell for the status menu.
          </motion.p>

          <motion.div
            className="flex items-center gap-3 text-[0.9vw] text-[#e8e4df]/80 mb-2"
            initial={{ opacity: 0, x: 20 }}
            animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          >
            <span className="inline-block w-3 h-3 rounded bg-[#C8A96E]" />
            <span>Day shift</span>
            <span className="inline-block w-3 h-3 rounded bg-[#3b82f6] ml-4" />
            <span>Night shift</span>
          </motion.div>
          <motion.div
            className="text-[0.85vw] text-[#8a8580]"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            Editable up to 6 months ahead.
          </motion.div>
        </div>

        <div className="w-2/3 relative h-full flex items-center justify-center">
          <motion.div
            className="w-full h-full bg-[#0a1128] rounded-[24px] border border-[#1e2640] p-8 grid grid-cols-7 gap-2 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs uppercase tracking-widest text-[#8a8580] mb-2">
                {d}
              </div>
            ))}

            {Array.from({ length: 28 }).map((_, i) => (
              <motion.div
                key={i}
                className="aspect-square bg-[#060b18] border border-[#1e2640] rounded-lg p-2 flex flex-col gap-1 relative overflow-hidden"
                initial={{ opacity: 0 }}
                animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="text-[#5a5550] text-sm">{i + 1}</div>
                {i > 10 && i < 15 && (
                  <motion.div
                    className="w-full h-2 rounded bg-[#C8A96E]/80"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ delay: 1 + i * 0.08 }}
                  />
                )}
                {i > 12 && i < 16 && (
                  <motion.div
                    className="w-full h-2 rounded bg-[#3b82f6]/80"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ delay: 1.5 + i * 0.08 }}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Right-click status menu */}
          <motion.div
            className="absolute left-[42%] top-[38%] w-[14vw] bg-[#0f172a] border border-[#C8A96E]/40 rounded-md shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={
              phase >= 4
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: -8, scale: 0.95 }
            }
            transition={{ duration: 0.35 }}
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-[#C8A96E] border-b border-[#1e2640]">
              Set status
            </div>
            <div className="px-3 py-2 text-sm text-[#e8e4df] hover:bg-[#1e2640] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#34d399]" /> Available
            </div>
            <div className="px-3 py-2 text-sm text-[#e8e4df] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Unavailable
            </div>
            <div className="px-3 py-2 text-sm text-[#e8e4df] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6]" /> Booked
            </div>
          </motion.div>

          <motion.div
            className="absolute bottom-[-10%] right-[-10%] bg-[#111b3a] p-6 rounded-xl border border-[#f59e0b]/30 shadow-2xl flex items-center gap-4 max-w-sm"
            initial={{ opacity: 0, y: 50 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ delay: 1.5 }}
          >
            <div className="w-10 h-10 rounded-full bg-[#f59e0b]/20 flex items-center justify-center text-[#f59e0b] shrink-0">!</div>
            <div className="text-sm text-[#e8e4df]">EWTD Safety Notice: Double shift limit detected. Rest period required.</div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
