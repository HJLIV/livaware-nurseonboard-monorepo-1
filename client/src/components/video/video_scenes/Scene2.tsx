import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 7000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 1 }}
    >
      <div className="w-[80vw] flex justify-between items-center">
        <div className="w-[35vw]">
          <motion.div 
            className="text-[#C8A96E] font-medium tracking-[0.2em] text-[1vw] mb-4 uppercase"
            initial={{ opacity: 0, y: -20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          >
            Stage 01
          </motion.div>
          <motion.h2 
            className="font-serif text-[4vw] leading-[1.1] text-white font-light mb-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          >
            Compliance &<br/>Documents
          </motion.h2>
          <motion.p 
            className="text-[#e8e4df]/70 text-[1.2vw] leading-relaxed"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            Upload your ID, NMC pin, DBS, references, and health forms securely. Our AI reviews submissions instantly to keep you moving fast.
          </motion.p>
        </div>

        <div className="w-[40vw] flex flex-col gap-4">
          {[
            { title: "NMC Registration", status: "Verified", icon: "✓", color: "text-[#4ade80]", bg: "bg-[#4ade80]/10", border: "border-[#4ade80]/20" },
            { title: "Right to Work (Passport)", status: "Pending Review", icon: "⟳", color: "text-[#C8A96E]", bg: "bg-[#C8A96E]/10", border: "border-[#C8A96E]/20" },
            { title: "Enhanced DBS", status: "Flagged", icon: "!", color: "text-[#f87171]", bg: "bg-[#f87171]/10", border: "border-[#f87171]/20" }
          ].map((item, i) => (
            <motion.div 
              key={i}
              className={`w-full p-6 rounded-xl border bg-[#0a1128] flex items-center justify-between shadow-lg ${item.border}`}
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= 2 + i ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              transition={{ type: "spring", delay: i * 0.2 }}
            >
              <span className="text-white text-xl font-medium">{item.title}</span>
              <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${item.bg} ${item.color}`}>
                <span>{item.icon}</span>
                <span className="font-medium text-sm tracking-wide uppercase">{item.status}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}