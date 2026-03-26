import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Gauge, ShieldAlert, Sparkles, Timer, ShieldCheck, FileText, Send } from "lucide-react";
import { useAuth } from "../../services/AuthContext";
import { fetchMyNotifications, fetchMySecuritySummary } from "../../services/dashboardService";

function tone(level) {
  if (level === "High") return "text-cyber-threat";
  if (level === "Warning") return "text-cyber-warn";
  return "text-cyber-safe";
}

function scoreTone(score) {
  if (score < 50) return "bg-cyber-threat";
  if (score < 75) return "bg-cyber-warn";
  return "bg-cyber-safe";
}

export default function EmployeeProfilePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchMySecuritySummary().then(setSummary).catch(() => {});
    fetchMyNotifications()
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => setNotifications([]));
  }, []);

  const scoreWidth = useMemo(() => `${summary?.securityScore || 0}%`, [summary]);

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-cyber-accent/30 bg-gradient-to-r from-cyber-panel to-cyber-base p-6 shadow-cyber"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyber-accent">Security Center</p>
            <h2 className="mt-1 font-display text-3xl font-semibold text-slate-900">
              Welcome back, {user?.name?.split(" ")[0] || "Employee"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Your behavior profile is continuously monitored for unusual access patterns and insider-risk signals.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="rounded-full border border-cyber-accent/30 bg-cyber-accent/10 px-3 py-1">
                {user?.employeeID}
              </span>
              <span className="rounded-full border border-cyber-safe/30 bg-cyber-safe/10 px-3 py-1">
                {user?.department}
              </span>
              <span className="rounded-full border border-cyber-accent/30 bg-cyber-base/60 px-3 py-1">
                {user?.role}
              </span>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-cyber-accent/20 bg-cyber-base/55 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300">Security Score</p>
              <p className="font-display text-2xl font-semibold text-slate-900">{summary?.securityScore ?? 0}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyber-panelSoft">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: scoreWidth }}
                className={`h-full ${scoreTone(summary?.securityScore ?? 0)}`}
              />
            </div>
            <p className={`mt-3 text-sm font-semibold ${tone(summary?.threatLevel)}`}>
              Threat Level: {summary?.threatLevel || "Safe"}
            </p>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Risk Score</p>
            <Gauge className="h-4 w-4 text-cyber-accent" />
          </div>
          <p className="mt-2 font-display text-2xl text-slate-900">{summary?.riskScore ?? 0}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Blocked Attempts</p>
            <ShieldAlert className="h-4 w-4 text-cyber-warn" />
          </div>
          <p className="mt-2 font-display text-2xl text-slate-900">{summary?.stats?.blockedAttempts ?? 0}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Sensitive Accesses</p>
            <ShieldCheck className="h-4 w-4 text-cyber-safe" />
          </div>
          <p className="mt-2 font-display text-2xl text-slate-900">{summary?.stats?.sensitiveAccesses ?? 0}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Last Login</p>
            <Timer className="h-4 w-4 text-cyber-accent" />
          </div>
          <p className="mt-2 text-sm text-slate-200">
            {summary?.lastLogin ? new Date(summary.lastLogin).toLocaleString() : "No recent login"}
          </p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Secure Share Alerts</p>
            <Send className="h-4 w-4 text-cyber-warn" />
          </div>
          <p className="mt-2 font-display text-2xl text-slate-900">{summary?.stats?.highRiskSecureShare ?? 0}</p>
          <p className="text-xs text-slate-400">
            {summary?.stats?.secureShareIncidents ?? 0} incidents analyzed
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyber-accent" />
            <h3 className="font-display text-lg font-semibold text-slate-900">Security Recommendations</h3>
          </div>
          <div className="space-y-2">
            {(summary?.recommendations || []).map((item) => (
              <div key={item} className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-200">
                {item}
              </div>
            ))}
            {(summary?.recommendations || []).length === 0 && (
              <p className="text-sm text-slate-400">No recommendations available yet.</p>
            )}
          </div>

          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-200">Recently Accessed Documents</h4>
            <div className="flex flex-wrap gap-2">
              {(summary?.recentDocuments || []).slice(0, 8).map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border border-cyber-accent/25 bg-cyber-base/55 px-3 py-1 text-xs text-slate-200"
                >
                  <FileText className="h-3 w-3 text-cyber-accent" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Recent Security Notifications</h3>
          <div className="max-h-[360px] space-y-2 overflow-auto">
            {notifications.slice(0, 10).map((item) => (
              <div key={item.id} className="rounded-xl border border-cyber-accent/15 bg-cyber-base/45 px-3 py-2">
                <p className="text-sm text-slate-100">{item.message}</p>
                <p className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-sm text-slate-400">No alerts for your account.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
