import { motion } from "framer-motion";

const STEPS = ["Analyzing content", "Detecting suspicious keywords", "Calculating risk score"];

export default function ScanAnimation({ title = "Scanning Document..." }) {
  return (
    <div className="glass-panel rounded-2xl border border-cyber-accent/25 p-4">
      <div className="mb-4 flex items-center gap-3">
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="h-3 w-3 rounded-full bg-cyber-accent"
        />
        <h4 className="font-display text-base font-semibold text-slate-900">{title}</h4>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, index) => (
          <motion.div
            key={step}
            initial={{ opacity: 0.4, x: -6 }}
            animate={{ opacity: [0.4, 1, 0.4], x: [0, 6, 0] }}
            transition={{ duration: 1.8, delay: index * 0.2, repeat: Infinity }}
            className="rounded-lg border border-cyber-accent/15 bg-cyber-panelSoft/40 px-3 py-2 text-sm text-slate-200"
          >
            {step}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

