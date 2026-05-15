import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      <motion.div 
        className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      >
        Portal Hub
      </motion.div>
      
      <motion.h2 
        className="font-serif text-[5vw] leading-[1.1] text-white font-light text-center mb-8"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        Everything in <br />One Place
      </motion.h2>

      <motion.p 
        className="text-[#e8e4df]/70 text-[1.5vw] text-center max-w-[40vw] mb-12"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1 }}
      >
        Keep your documents up to date, check your induction progress, and update availability anytime.
      </motion.p>

      <motion.div 
        className="px-8 py-4 border border-[#C8A96E]/30 rounded-full bg-[#C8A96E]/5 text-[#C8A96E] text-lg uppercase tracking-widest font-medium"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        Welcome to Livaware
      </motion.div>
    </motion.div>
  );
}