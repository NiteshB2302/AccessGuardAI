import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import StatCard from "../../components/StatCard";
import LiveFeed from "../../components/LiveFeed";
import ThreatLevelBadge from "../../dashboard/ThreatLevelBadge";
import { fetchAlerts, fetchLiveFeed, fetchOverview, fetchRiskTable } from "../../services/dashboardService";

function indicatorForThreat(level) {
  if (level === "Red") return "threat";
  if (level === "Yellow") return "warning";
  return "safe";
}

function indicatorForRiskScore(score) {
  const value = Number(score || 0);
  if (value >= 0.7) return "threat";
  if (value >= 0.4) return "warning";
  return "safe";
}

function toProgress(value, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  const cap = Math.max(Number(max || 1), 1);
  return Math.max(0, Math.min(100, (number / cap) * 100));
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState({});
  const [feed, setFeed] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [riskTable, setRiskTable] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [ov, liveFeed, alertList, riskRows] = await Promise.all([
        fetchOverview(),
        fetchLiveFeed(),
        fetchAlerts(),
        fetchRiskTable()
      ]);
      setOverview(ov);
      setFeed(liveFeed);
      setAlerts(alertList);
      setRiskTable(riskRows);
    };
    load().catch(() => {});
  }, []);

  const systemOverallRiskScore = Number(overview.systemOverallRiskScore || 0);
  const systemRiskIndicator = indicatorForRiskScore(systemOverallRiskScore);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 rounded-3xl border border-cyber-accent/30 bg-gradient-to-r from-cyber-panel to-cyber-base p-5 shadow-cyber"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyber-accent">Security Operations</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900 md:text-3xl">
              Enterprise Threat Command Overview
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Real-time monitoring across insider risk, role misuse, malicious files, email threats, and data exfiltration.
            </p>
          </div>
          <div className="rounded-2xl border border-cyber-accent/25 bg-cyber-base/55 p-4 text-sm text-slate-200">
            <div className="flex items-center gap-2">
              {overview.systemThreatLevel === "Red" ? (
                <AlertTriangle className="h-4 w-4 text-cyber-threat" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-cyber-safe" />
              )}
              <p>
                System Threat:{" "}
                <span className="font-semibold text-slate-900">{overview.systemThreatLevel || "Green"}</span>
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-200">
              Overall Risk Score: <span className="font-semibold text-slate-900">{systemOverallRiskScore.toFixed(2)}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Blocked users are excluded from system risk and re-included after unblock.
            </p>
          </div>
        </div>
      </motion.section>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900">System Security Overview Cards</h3>
            <p className="text-xs text-slate-500">Live KPI cards for workforce and threat posture.</p>
          </div>
          <span className="glass-pill px-2 py-0.5 text-xs text-cyber-accent">Live Metrics</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Total Employees"
            value={overview.totalEmployees || 0}
            indicator="safe"
            progress={toProgress(overview.totalEmployees || 0, 20)}
          />
          <StatCard
            title="Active Alerts"
            value={overview.activeAlerts || 0}
            indicator={(overview.activeAlerts || 0) > 5 ? "threat" : "warning"}
            progress={toProgress(overview.activeAlerts || 0, 10)}
            subtitle={`Blocked-user queue: ${overview.blockedUserAlertQueue || 0} (excluded from dashboard counts)`}
          />
          <StatCard
            title="Suspicious Employees"
            value={overview.suspiciousEmployees || 0}
            indicator={(overview.suspiciousEmployees || 0) > 0 ? "warning" : "safe"}
            progress={toProgress(overview.suspiciousEmployees || 0, 10)}
          />
          <StatCard
            title="Malicious Documents"
            value={overview.maliciousDocuments || 0}
            indicator={(overview.maliciousDocuments || 0) > 0 ? "threat" : "safe"}
            progress={toProgress(overview.maliciousDocuments || 0, 10)}
          />
          <StatCard
            title="Spam Emails Detected"
            value={overview.spamEmailsDetected || 0}
            indicator={(overview.spamEmailsDetected || 0) > 0 ? "warning" : "safe"}
            progress={toProgress(overview.spamEmailsDetected || 0, 20)}
          />
          <StatCard
            title="Data Exfil Attempts"
            value={overview.dataExfiltrationAttempts || 0}
            indicator={(overview.dataExfiltrationAttempts || 0) > 0 ? "threat" : "safe"}
            progress={toProgress(overview.dataExfiltrationAttempts || 0, 10)}
          />
          <StatCard
            title="System Overall Risk Score"
            value={systemOverallRiskScore.toFixed(2)}
            indicator={systemRiskIndicator}
            progress={Math.max(0, Math.min(100, systemOverallRiskScore * 100))}
            subtitle={`Active in risk pool: ${overview.activeRiskEmployees || 0} | Blocked excluded: ${
              overview.blockedRiskEmployees || 0
            }`}
          />
          <StatCard
            title="System Threat Level"
            value={overview.systemThreatLevel || "Green"}
            indicator={indicatorForThreat(overview.systemThreatLevel)}
            progress={Math.max(0, Math.min(100, systemOverallRiskScore * 100))}
            subtitle="Green / Yellow / Red"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
        <LiveFeed feed={feed} title="Live Security Feed (Overview)" maxHeight={360} />

        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-slate-900">Highest Risk Employees</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyber-warn/30 bg-cyber-warn/10 px-2 py-0.5 text-xs text-cyber-warn">
              <Sparkles className="h-3.5 w-3.5" />
              Prioritized
            </span>
          </div>
          <div className="space-y-2">
            {riskTable.slice(0, 8).map((row) => (
              <div
                key={row.employeeID}
                className="flex items-center justify-between rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/30 px-3 py-2 transition hover:border-cyber-accent/35"
              >
                <div>
                  <p className="font-mono text-sm text-slate-100">{row.employeeID}</p>
                  <p className="text-xs text-slate-400">
                    {row.role} | {row.department}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-200">Risk {row.riskScore}</p>
                  <ThreatLevelBadge level={row.threatLevel} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-slate-900">Recent Alerts</h3>
            <span className="rounded-full border border-cyber-accent/30 bg-cyber-base/55 px-2 py-0.5 text-xs text-slate-300">
              {alerts.length} total
            </span>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 12).map((alert) => (
                  <tr key={alert._id} className="border-t border-cyber-accent/10">
                    <td className="py-2 text-slate-100">{alert.type}</td>
                    <td className="py-2">
                      <ThreatLevelBadge level={alert.severity === "high" ? "High" : "Warning"} />
                    </td>
                    <td className="py-2 text-slate-300">{alert.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
