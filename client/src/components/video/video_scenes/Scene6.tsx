import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 9500),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, filter: 'blur(10px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 1 }}
    >
      <motion.div
        className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase text-center"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
      >
        Stage 05
      </motion.div>
      <motion.h2
        className="font-serif text-[4.5vw] leading-[1.1] text-white font-light mb-12 text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      >
        Timesheets &amp; Invoicing
      </motion.h2>

      <div className="flex w-[80vw] justify-center items-start gap-12">
        <motion.div
          className="w-[30vw] bg-[#0a1128] rounded-[24px] border border-[#1e2640] p-8 relative"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
        >
          <div className="flex justify-between items-end border-b border-[#1e2640] pb-6 mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#8a8580] mb-2">Total Amount</div>
              <div className="font-serif text-4xl text-white">£450.00</div>
            </div>
            <div className="px-3 py-1 bg-[#4ade80]/10 text-[#4ade80] rounded text-sm uppercase tracking-wider font-medium">Approved</div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-[#8a8580]">Shift: 12 Oct (Day)</span>
              <span className="text-[#e8e4df]">12 hrs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8a8580]">Rate</span>
              <span className="text-[#e8e4df]">£37.50/hr</span>
            </div>
          </div>

          {/* Re-download PDF action */}
          <motion.div
            className="mt-6 flex items-center justify-between border-t border-[#1e2640] pt-4"
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          >
            <div className="text-[10px] uppercase tracking-widest text-[#8a8580]">Invoice PDF</div>
            <div className="px-3 py-2 rounded bg-[#C8A96E]/15 text-[#C8A96E] text-xs uppercase tracking-widest border border-[#C8A96E]/30 flex items-center gap-2">
              <span>↓</span> Re-download
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-[#C8A96E] flex items-center justify-center text-[#060b18] text-sm">1</div>
            <div className="text-[#e8e4df] text-lg">Submit via Portal</div>
          </div>
          <div className="w-1 h-8 bg-[#1e2640] ml-3" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-[#C8A96E] flex items-center justify-center text-[#060b18] text-sm">2</div>
            <div className="text-[#e8e4df] text-lg">Auto-PDF + Email</div>
          </div>
          <div className="w-1 h-8 bg-[#1e2640] ml-3" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-[#4ade80] flex items-center justify-center text-[#060b18] text-sm">3</div>
            <div className="text-[#4ade80] text-lg">Approved &amp; Paid</div>
          </div>
          <div className="w-1 h-8 bg-[#1e2640] ml-3" />
          <motion.div
            className="flex items-center gap-4"
            initial={{ opacity: 0, x: -10 }}
            animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
          >
            <div className="w-8 h-8 rounded-full bg-[#C8A96E]/20 border border-[#C8A96E]/40 flex items-center justify-center text-[#C8A96E] text-sm">↓</div>
            <div className="text-[#e8e4df]/80 text-lg">Re-download PDF anytime</div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
