import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 10000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 1 }}
    >
      <div className="absolute left-[10vw] top-[30vh] w-[40vw]">
        <motion.div 
          className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1.2vw] mb-4 uppercase"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.8 }}
        >
          Welcome
        </motion.div>
        
        <motion.h1 
          className="font-serif text-[5vw] leading-[1.1] text-white font-light"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Your Livaware <br />Journey Begins
        </motion.h1>

        <motion.p 
          className="text-[#e8e4df]/70 text-[1.5vw] mt-6 max-w-[30vw] leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8 }}
        >
          A single, friendly portal for your entire onboarding, compliance, and clinical development.
        </motion.p>
      </div>

      <motion.div 
        className="absolute right-[15vw] top-[25vh] w-[25vw] h-[50vh] bg-[#0a1128] rounded-[24px] border border-[#1e2640] shadow-2xl p-8 flex flex-col items-center justify-center overflow-hidden"
        initial={{ opacity: 0, x: 50, rotateY: -20 }}
        animate={phase >= 4 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 50, rotateY: -20 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        style={{ perspective: 1000 }}
      >
        <div className="w-16 h-16 rounded-full bg-[#C8A96E]/20 flex items-center justify-center mb-6">
          <svg className="w-7 h-7 text-[#C8A96E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
        </div>
        <h3 className="font-serif text-2xl text-white mb-2">Check your email</h3>
        <p className="text-center text-[#8a8580] text-sm mb-8">
          Click your secure magic link and enter the 6-digit code. No passwords required.
        </p>
        <div className="w-full flex gap-2 justify-center">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="w-10 h-12 rounded bg-[#060b18] border border-[#1e2640] flex items-center justify-center text-[#C8A96E] font-mono text-xl">
              {phase >= 5 ? Math.floor(Math.random()*10) : ''}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}