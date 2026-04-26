import { useEffect, useState } from "react";
import { fetchActivity } from "../../services/dashboardService";

function actionLabel(actionType) {
  const value = String(actionType || "").toLowerCase();
  if (value === "login") return "LOGIN";
  if (value === "logout") return "LOGOUT";
  return value.replace(/_/g, " ").toUpperCase();
}

function timingBadge(entry) {
  const metadata = entry?.metadata || {};
  if (metadata.isWeekend) return { label: "Weekend Activity", tone: "warn" };
  if (metadata.isAfterOfficeHours) return { label: "After Office Hours", tone: "warn" };
  return { label: "Office Hours", tone: "safe" };
}

function timingToneClass(tone) {
  if (tone === "warn") {
    return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  }
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

export default function EmployeeActivityPage() {
  const [activities, setActivities] = useState([]);
  const [sessionInsights, setSessionInsights] = useState({
    totalLogins: 0,
    totalLogouts: 0,
    afterHoursSessions: 0,
    officeHoursPolicy: "09:00-18:00"
  });

  useEffect(() => {
    fetchActivity()
      .then((data) => {
        setActivities(data.activities || []);
        setSessionInsights(
          data.sessionInsights || {
            totalLogins: 0,
            totalLogouts: 0,
            afterHoursSessions: 0,
            officeHoursPolicy: "09:00-18:00"
          }
        );
      })
      .catch(() => {
        setActivities([]);
      });
  }, []);

  return (
    <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
      <h2 className="mb-3 font-display text-xl font-semibold text-slate-900">Activity History</h2>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/30 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Logins</p>
          <p className="text-sm font-semibold text-slate-900">{sessionInsights.totalLogins}</p>
        </div>
        <div className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/30 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Logouts</p>
          <p className="text-sm font-semibold text-slate-900">{sessionInsights.totalLogouts}</p>
        </div>
        <div className="rounded-xl border border-cyber-warn/20 bg-cyber-warn/10 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-cyber-warn">After-Hours Sessions</p>
          <p className="text-sm font-semibold text-cyber-warn">{sessionInsights.afterHoursSessions}</p>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">Office Hours Policy: {sessionInsights.officeHoursPolicy}</p>
      <div className="max-h-[520px] space-y-2 overflow-auto">
        {activities.length === 0 && <p className="text-sm text-slate-400">No activity records found.</p>}
        {activities.map((entry) => (
          <div key={entry._id} className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/35 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-slate-100">
                {actionLabel(entry.actionType)}
                {entry.documentAccessed ? ` - ${entry.documentAccessed}` : ""}
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${timingToneClass(timingBadge(entry).tone)}`}
              >
                {timingBadge(entry).label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</p>
            {entry.metadata?.localTimeLabel && (
              <p className="mt-0.5 text-xs text-slate-500">Logged Time: {entry.metadata.localTimeLabel}</p>
            )}
            {entry.actionType === "logout" && Number.isFinite(entry.metadata?.sessionDurationMinutes) && (
              <p className="mt-0.5 text-xs text-slate-500">
                Session Duration: {entry.metadata.sessionDurationMinutes} minutes
              </p>
            )}
            {entry.metadata?.officeHours && (
              <p className="mt-0.5 text-xs text-slate-500">Office Hours Policy: {entry.metadata.officeHours}</p>
            )}
            {entry.metadata?.ipAddress && (entry.actionType === "login" || entry.actionType === "logout") && (
              <p className="mt-0.5 text-xs text-slate-500">Source IP: {entry.metadata.ipAddress}</p>
            )}
            {entry.metadata?.userAgent && (entry.actionType === "login" || entry.actionType === "logout") && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">Device: {entry.metadata.userAgent}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
