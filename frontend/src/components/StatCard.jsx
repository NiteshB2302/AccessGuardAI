import { motion } from "framer-motion";
import { Activity, BellRing, Files, ShieldAlert, ShieldCheck, UserCog, Users } from "lucide-react";

function cardIconForTitle(title) {
  const value = String(title || "").toLowerCase();
  if (value.includes("overall risk")) return ShieldAlert;
  if (value.includes("employee") && value.includes("suspicious")) return ShieldAlert;
  if (value.includes("total employees")) return Users;
  if (value.includes("active alerts")) return BellRing;
  if (value.includes("document")) return Files;
  if (value.includes("system threat")) return Activity;
  if (value.includes("exfil")) return UserCog;
  return ShieldCheck;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function resolveProgress(progress, value, indicator) {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    return clampPercent(progress);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric <= 0) {
    return 0;
  }

  return indicator === "threat" ? 95 : indicator === "warning" ? 65 : 38;
}

export default function StatCard({ title, value, indicator = "safe", subtitle, progress }) {
  const safeTitle = title || "Security Metric";
  const tone =
    indicator === "threat"
      ? "text-cyber-threat border-cyber-threat/40 bg-cyber-threat/10"
      : indicator === "warning"
        ? "text-cyber-warn border-cyber-warn/35 bg-cyber-warn/10"
        : "text-cyber-safe border-cyber-safe/35 bg-cyber-safe/10";

  const Icon = cardIconForTitle(safeTitle);
  const progressWidth = resolveProgress(progress, value, indicator);
  const gradientTone =
    indicator === "threat"
      ? "from-cyber-threat/25 via-cyber-threat/10 to-white/20"
      : indicator === "warning"
        ? "from-cyber-warn/30 via-cyber-warn/10 to-white/20"
        : "from-cyber-safe/25 via-cyber-safe/10 to-white/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="glass-panel rounded-2xl border border-cyber-accent/20 p-4 shadow-cyber"
    >
      <div className={`mb-3 flex items-start justify-between gap-2 rounded-xl border border-cyber-accent/20 bg-gradient-to-r px-3 py-2 ${gradientTone}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Overview Metric</p>
          <p className="truncate text-sm font-semibold text-slate-900">{safeTitle}</p>
        </div>
        <div className="rounded-xl border border-cyber-accent/25 bg-white/90 p-2 shadow-panel">
          <Icon className="h-4 w-4 text-cyber-accent" />
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-display text-3xl font-semibold text-slate-900">{value}</p>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
          {indicator === "threat" ? "High" : indicator === "warning" ? "Warning" : "Safe"}
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-cyber-panelSoft/70">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressWidth}%` }}
          className={`surface-shimmer h-full rounded-full ${
            indicator === "threat"
              ? "bg-cyber-threat"
              : indicator === "warning"
                ? "bg-cyber-warn"
                : "bg-cyber-safe"
          }`}
        />
      </div>
      {subtitle && <p className="mt-2 text-xs text-slate-400">{subtitle}</p>}
    </motion.div>
  );
}
