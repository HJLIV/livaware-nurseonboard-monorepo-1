import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 1 }}
    >
      <motion.div 
        className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase text-center"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
      >
        Stage 02
      </motion.div>
      <motion.h2 
        className="font-serif text-[4vw] leading-[1.1] text-white font-light mb-12 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      >
        Policies & Declarations
      </motion.h2>

      <div className="flex gap-8 w-[70vw]">
        <motion.div 
          className="flex-1 bg-[#0a1128] rounded-[24px] border border-[#1e2640] p-8"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        >
          <div className="w-12 h-12 rounded bg-[#C8A96E]/20 mb-6 flex items-center justify-center text-[#C8A96E] text-2xl">📋</div>
          <h3 className="text-xl text-white font-medium mb-4">Competency Declarations</h3>
          <p className="text-[#8a8580] leading-relaxed mb-6">Attest to your clinical competencies and scope of practice. Read carefully and confirm your skills.</p>
          <div className="w-full h-2 bg-[#060b18] rounded-full overflow-hidden">
            <motion.div className="h-full bg-[#C8A96E]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2, delay: 2.5 }} />
          </div>
        </motion.div>

        <motion.div 
          className="flex-1 bg-[#0a1128] rounded-[24px] border border-[#1e2640] p-8"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ delay: 0.2 }}
        >
          <div className="w-12 h-12 rounded bg-[#4ade80]/20 mb-6 flex items-center justify-center text-[#4ade80] text-2xl">✓</div>
          <h3 className="text-xl text-white font-medium mb-4">Policy Updates</h3>
          <p className="text-[#8a8580] leading-relaxed mb-6">When a policy version bumps, you'll be prompted to re-acknowledge. Stay compliant with zero friction.</p>
          <div className="flex items-center gap-4 text-[#4ade80] text-sm uppercase tracking-wider font-medium">
            <span>Safeguarding v2.1</span>
            <span>— Acknowledged</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}