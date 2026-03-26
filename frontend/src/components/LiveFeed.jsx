import { motion } from "framer-motion";

function levelStyles(level) {
  if (level === "threat") return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  if (level === "warning") return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

function dotTone(level) {
  if (level === "threat") return "bg-cyber-threat";
  if (level === "warning") return "bg-cyber-warn";
  return "bg-cyber-safe";
}

function levelLabel(level) {
  if (level === "threat") return "Threat";
  if (level === "warning") return "Warning";
  return "Normal";
}

export default function LiveFeed({ feed = [], title = "Live Security Activity Feed", maxHeight = 860 }) {
  return (
    <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
        <span className="glass-pill px-2 py-0.5 text-xs text-slate-600">
          {feed.length} events
        </span>
      </div>

      <p className="mb-2 text-xs text-slate-500">Streaming security telemetry and analyst workflow events.</p>

      <div className="timeline-track cyber-scroll mt-3 space-y-2 overflow-y-auto pr-1" style={{ maxHeight }}>
        {feed.length === 0 && <p className="text-sm text-slate-400">No live events yet.</p>}
        {feed.map((event, idx) => (
          <motion.div
            key={`${event.timestamp}-${idx}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.02 }}
            whileHover={{ x: 2 }}
            className={`relative ml-6 rounded-xl border p-3 text-sm ${levelStyles(event.level)}`}
          >
            <span className={`absolute -left-7 top-5 h-3 w-3 rounded-full ${dotTone(event.level)} status-pulse`} />
            <div className="flex items-start gap-2">
              <div className="w-full">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-slate-600">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${levelStyles(event.level)}`}>
                    {levelLabel(event.level)}
                  </span>
                </div>
                <p className="text-slate-800">{event.message}</p>
                <p className="mt-1 text-[11px] text-slate-500">Live security event</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
