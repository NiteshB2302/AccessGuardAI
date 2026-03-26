import { useEffect, useState } from "react";
import { fetchActivity } from "../../services/dashboardService";

export default function EmployeeActivityPage() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    fetchActivity()
      .then((data) => setActivities(data.activities || []))
      .catch(() => setActivities([]));
  }, []);

  return (
    <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
      <h2 className="mb-3 font-display text-xl font-semibold text-slate-900">Activity History</h2>
      <div className="max-h-[520px] space-y-2 overflow-auto">
        {activities.length === 0 && <p className="text-sm text-slate-400">No activity records found.</p>}
        {activities.map((entry) => (
          <div key={entry._id} className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/35 p-3 text-sm">
            <p className="text-slate-100">
              {entry.actionType.toUpperCase()}
              {entry.documentAccessed ? ` - ${entry.documentAccessed}` : ""}
            </p>
            <p className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

