import { useEffect, useState } from "react";
import { fetchMyNotifications } from "../../services/dashboardService";

function tone(severity) {
  if (severity === "high") return "border-cyber-threat/45 bg-cyber-threat/12 text-cyber-threat";
  if (severity === "warning") return "border-cyber-warn/45 bg-cyber-warn/12 text-cyber-warn";
  return "border-cyber-safe/45 bg-cyber-safe/12 text-cyber-safe";
}

export default function EmployeeNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [accountStatus, setAccountStatus] = useState("Active");

  useEffect(() => {
    fetchMyNotifications()
      .then((data) => {
        setNotifications(data.notifications || []);
        setAccountStatus(data.accountStatus || "Active");
      })
      .catch(() => setNotifications([]));
  }, []);

  return (
    <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
      <h2 className="mb-3 font-display text-xl font-semibold text-slate-900">Security Notifications</h2>
      <div className="mb-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs ${
            accountStatus === "Blocked"
              ? "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat"
              : "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe"
          }`}
        >
          Account Status: {accountStatus}
        </span>
      </div>
      <div className="max-h-[520px] space-y-2 overflow-auto">
        {notifications.length === 0 && <p className="text-sm text-slate-400">No security warnings detected.</p>}
        {notifications.map((item) => (
          <div key={item.id} className={`rounded-xl border p-3 text-sm ${tone(item.severity)}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-semibold">{item.category}</p>
              <span className="rounded-full border border-current px-2 py-0.5 text-[10px] uppercase">
                {item.severity}
              </span>
            </div>
            <p className="text-slate-100">{item.message}</p>
            <p className="mt-1 text-xs text-slate-400">
              {item.source} • {new Date(item.timestamp).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
