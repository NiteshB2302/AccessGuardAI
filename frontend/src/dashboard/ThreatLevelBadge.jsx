export default function ThreatLevelBadge({ level }) {
  const tone =
    level === "High" || level === "high"
      ? "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat"
      : level === "Warning" || level === "warning"
        ? "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn"
        : "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{level}</span>;
}

