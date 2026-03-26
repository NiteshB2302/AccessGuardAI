import { useEffect, useMemo, useState } from "react";
import LiveFeed from "../../components/LiveFeed";
import ThreatLevelBadge from "../../dashboard/ThreatLevelBadge";
import {
  blockEmployeeAccount,
  fetchAlertBuckets,
  fetchExfiltrationIncidents,
  fetchEmployees,
  fetchLiveFeed,
  fetchRiskTable,
  resolveAlertsBulk,
  sendEmployeeAlert,
  unblockEmployeeAccount,
  updateExfiltrationIncidentStatus
} from "../../services/dashboardService";

function statusTone(status) {
  return status === "Blocked"
    ? "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat"
    : "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe";
}

function incidentTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["blocked_pending_override", "blocked_by_policy", "sent_override"].includes(normalized)) {
    return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  }
  if (["approval_requested", "investigating"].includes(normalized)) {
    return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  }
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

function normalizeIncidentStatus(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminMonitoringPage() {
  const [alerts, setAlerts] = useState([]);
  const [blockedAlerts, setBlockedAlerts] = useState([]);
  const [alertCounts, setAlertCounts] = useState({ active: 0, blocked: 0, total: 0 });
  const [riskTable, setRiskTable] = useState([]);
  const [feed, setFeed] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [exfilIncidents, setExfilIncidents] = useState([]);
  const [actionMessage, setActionMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  const loadData = async () => {
    const [alertBuckets, riskRows, liveFeed, employeeList, incidentRows] = await Promise.all([
      fetchAlertBuckets(false),
      fetchRiskTable(),
      fetchLiveFeed(),
      fetchEmployees(),
      fetchExfiltrationIncidents({ limit: 80 })
    ]);
    setAlerts(alertBuckets?.alerts || []);
    setBlockedAlerts(alertBuckets?.blockedAlerts || []);
    setAlertCounts(
      alertBuckets?.counts || {
        active: (alertBuckets?.alerts || []).length,
        blocked: (alertBuckets?.blockedAlerts || []).length,
        total: (alertBuckets?.alerts || []).length + (alertBuckets?.blockedAlerts || []).length
      }
    );
    setRiskTable(riskRows);
    setFeed(liveFeed);
    setEmployees(employeeList);
    setExfilIncidents(incidentRows);
  };

  useEffect(() => {
    loadData().catch(() => {});
    const interval = setInterval(() => {
      loadData().catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const employeeStatusMap = useMemo(
    () =>
      employees.reduce((acc, user) => {
        acc[user.employeeID] = user.accountStatus || "Active";
        return acc;
      }, {}),
    [employees]
  );

  const employeeRoleMap = useMemo(
    () =>
      employees.reduce((acc, user) => {
        acc[user.employeeID] = user.role;
        return acc;
      }, {}),
    [employees]
  );

  const mergedRiskRows = useMemo(
    () =>
      riskTable.map((row) => ({
        ...row,
        accountStatus: employeeStatusMap[row.employeeID] || row.accountStatus || "Active"
      })),
    [riskTable, employeeStatusMap]
  );

  const handleSendAlert = async (rowOrEmployeeID, contextLabel = "suspicious activity") => {
    const employeeID = typeof rowOrEmployeeID === "string" ? rowOrEmployeeID : rowOrEmployeeID.employeeID;
    const threatLevel = typeof rowOrEmployeeID === "string" ? "Warning" : rowOrEmployeeID.threatLevel;
    const riskScore = typeof rowOrEmployeeID === "string" ? 0.7 : rowOrEmployeeID.riskScore;

    const severity = threatLevel === "High" ? "high" : "warning";
    const message = `Security alert: ${contextLabel}. Risk score ${riskScore}. Please review your recent access behavior and contact security if needed.`;
    setActionMessage("");
    setLoadingAction(`alert-${employeeID}`);

    try {
      await sendEmployeeAlert(employeeID, {
        message,
        severity,
        type: "Behavior Anomaly",
        riskScore
      });
      setActionMessage(`Alert sent to ${employeeID}.`);
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to send alert.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleBlockToggle = async (rowOrEmployeeID) => {
    const employeeID = typeof rowOrEmployeeID === "string" ? rowOrEmployeeID : rowOrEmployeeID.employeeID;
    const currentStatus =
      typeof rowOrEmployeeID === "string"
        ? employeeStatusMap[employeeID] || "Active"
        : rowOrEmployeeID.accountStatus || "Active";

    setActionMessage("");
    setLoadingAction(`status-${employeeID}`);

    try {
      if (currentStatus === "Blocked") {
        await unblockEmployeeAccount(employeeID);
        setActionMessage(`${employeeID} account unblocked.`);
      } else {
        const reason =
          typeof rowOrEmployeeID === "string"
            ? "Manual admin response from alert queue."
            : `Auto response: ${rowOrEmployeeID.threatLevel} risk (${rowOrEmployeeID.riskScore}) detected in monitoring dashboard.`;
        await blockEmployeeAccount(employeeID, reason);
        setActionMessage(`${employeeID} account blocked.`);
      }
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to update account status.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleIncidentStatus = async (incident, status) => {
    setActionMessage("");
    setLoadingAction(`incident-${incident._id}-${status}`);
    try {
      await updateExfiltrationIncidentStatus(incident._id, status);
      setActionMessage(`Incident ${incident._id} marked as ${status.replace(/_/g, " ")}.`);
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to update incident status.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleResolveAlerts = async (scope, employeeID = null) => {
    setActionMessage("");
    setLoadingAction(`resolve-${scope}-${employeeID || "all"}`);
    try {
      const response = await resolveAlertsBulk(scope, employeeID);
      setActionMessage(response.message || "Alerts resolved.");
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to resolve alerts.");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
      <div className="space-y-4">
        {actionMessage && (
          <div className="rounded-xl border border-cyber-accent/35 bg-cyber-accent/10 px-3 py-2 text-sm text-cyber-accent">
            {actionMessage}
          </div>
        )}

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Insider Threat & Risk Table</h3>
          <div className="max-h-[320px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">EmployeeID</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Risk</th>
                  <th className="pb-2">Threat Level</th>
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Response Actions</th>
                </tr>
              </thead>
              <tbody>
                {mergedRiskRows.map((row) => (
                  <tr key={row.employeeID} className="border-t border-cyber-accent/10">
                    <td className="py-2 font-mono text-slate-200">{row.employeeID}</td>
                    <td className="py-2 text-slate-300">{row.role}</td>
                    <td className="py-2 text-slate-200">{row.riskScore}</td>
                    <td className="py-2">
                      <ThreatLevelBadge level={row.threatLevel} />
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(row.accountStatus)}`}>
                        {row.accountStatus}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleSendAlert(row, "elevated employee risk pattern")}
                          disabled={loadingAction === `alert-${row.employeeID}` || row.role === "Admin"}
                          className="rounded-lg border border-cyber-warn/35 bg-cyber-warn/10 px-2 py-1 text-xs text-cyber-warn disabled:opacity-60"
                        >
                          Send Alert
                        </button>
                        <button
                          onClick={() => handleBlockToggle(row)}
                          disabled={loadingAction === `status-${row.employeeID}` || row.role === "Admin"}
                          className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-60 ${
                            row.accountStatus === "Blocked"
                              ? "border-cyber-safe/35 bg-cyber-safe/10 text-cyber-safe"
                              : "border-cyber-threat/35 bg-cyber-threat/10 text-cyber-threat"
                          }`}
                        >
                          {row.accountStatus === "Blocked" ? "Unblock" : "Block"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Data Exfiltration Incident Queue</h3>
          <div className="max-h-[320px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Recipient</th>
                  <th className="pb-2">Document</th>
                  <th className="pb-2">Risk</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exfilIncidents.map((incident) => (
                  <tr
                    key={incident._id}
                    className={`border-t border-cyber-accent/10 ${
                      incident.riskScore >= 0.7 || ["blocked_by_policy", "sent_override"].includes(incident.status)
                        ? "bg-cyber-threat/10"
                        : ""
                    }`}
                  >
                    <td className="py-2 font-mono text-xs text-slate-300">{incident.employeeID}</td>
                    <td className="py-2 text-slate-100">{incident.recipientEmail}</td>
                    <td className="py-2 text-slate-300">{incident.documentName || "Message Only"}</td>
                    <td className="py-2 font-semibold text-slate-100">{incident.riskScore}</td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${incidentTone(incident.status)}`}>
                        {normalizeIncidentStatus(incident.status)}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleSendAlert(incident.employeeID, "possible data exfiltration")}
                          disabled={employeeRoleMap[incident.employeeID] === "Admin"}
                          className="rounded-lg border border-cyber-warn/35 bg-cyber-warn/10 px-2 py-1 text-xs text-cyber-warn disabled:opacity-60"
                        >
                          Alert
                        </button>
                        <button
                          onClick={() => handleBlockToggle(incident.employeeID)}
                          disabled={employeeRoleMap[incident.employeeID] === "Admin"}
                          className="rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-1 text-xs text-cyber-threat disabled:opacity-60"
                        >
                          {employeeStatusMap[incident.employeeID] === "Blocked" ? "Unblock" : "Block"}
                        </button>
                        <button
                          onClick={() => handleIncidentStatus(incident, "investigating")}
                          disabled={loadingAction === `incident-${incident._id}-investigating`}
                          className="rounded-lg border border-cyber-accent/35 bg-cyber-accent/10 px-2 py-1 text-xs text-cyber-accent disabled:opacity-60"
                        >
                          Investigate
                        </button>
                        <button
                          onClick={() => handleIncidentStatus(incident, "resolved")}
                          disabled={loadingAction === `incident-${incident._id}-resolved`}
                          className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                        >
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {exfilIncidents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                      No exfiltration incidents yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-slate-900">Active Alert Queue</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyber-accent/30 bg-cyber-base/55 px-2 py-0.5 text-xs text-slate-300">
                {alertCounts.active} active
              </span>
              <button
                onClick={() => handleResolveAlerts("active")}
                disabled={loadingAction === "resolve-active-all"}
                className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
              >
                Resolve All Active
              </button>
            </div>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Message</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 18).map((alert) => (
                  <tr key={alert._id} className="border-t border-cyber-accent/10">
                    <td className="py-2 font-mono text-xs text-slate-300">{alert.employeeID || "-"}</td>
                    <td className="py-2 text-slate-100">{alert.type}</td>
                    <td className="py-2">
                      <ThreatLevelBadge level={alert.severity === "high" ? "High" : "Warning"} />
                    </td>
                    <td className="py-2 text-slate-300">{alert.message}</td>
                    <td className="py-2">
                      {alert.employeeID ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => handleSendAlert(alert.employeeID, `related to ${alert.type}`)}
                            disabled={employeeRoleMap[alert.employeeID] === "Admin"}
                            className="rounded-lg border border-cyber-warn/35 bg-cyber-warn/10 px-2 py-1 text-xs text-cyber-warn disabled:opacity-60"
                          >
                            Alert
                          </button>
                          <button
                            onClick={() => handleBlockToggle(alert.employeeID)}
                            disabled={employeeRoleMap[alert.employeeID] === "Admin"}
                            className="rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-1 text-xs text-cyber-threat disabled:opacity-60"
                          >
                            {employeeStatusMap[alert.employeeID] === "Blocked" ? "Unblock" : "Block"}
                          </button>
                          <button
                            onClick={() => handleResolveAlerts("all", alert.employeeID)}
                            disabled={loadingAction === `resolve-all-${alert.employeeID}`}
                            className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-sm text-slate-400">
                      No active alerts in queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-warn/25 bg-cyber-warn/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-slate-900">Blocked User Alert Queue (Separated)</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyber-warn/30 bg-cyber-base/55 px-2 py-0.5 text-xs text-cyber-warn">
                {alertCounts.blocked} blocked-user alerts
              </span>
              <button
                onClick={() => handleResolveAlerts("blocked")}
                disabled={loadingAction === "resolve-blocked-all"}
                className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
              >
                Resolve Blocked Queue
              </button>
            </div>
          </div>
          <div className="max-h-[260px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Message</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {blockedAlerts.slice(0, 18).map((alert) => (
                  <tr key={alert._id} className="border-t border-cyber-accent/10 bg-cyber-warn/5">
                    <td className="py-2 font-mono text-xs text-slate-300">{alert.employeeID || "-"}</td>
                    <td className="py-2 text-slate-100">{alert.type}</td>
                    <td className="py-2">
                      <ThreatLevelBadge level={alert.severity === "high" ? "High" : "Warning"} />
                    </td>
                    <td className="py-2 text-slate-300">{alert.message}</td>
                    <td className="py-2">
                      {alert.employeeID ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => handleBlockToggle(alert.employeeID)}
                            disabled={employeeRoleMap[alert.employeeID] === "Admin"}
                            className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                          >
                            Unblock
                          </button>
                          <button
                            onClick={() => handleResolveAlerts("all", alert.employeeID)}
                            disabled={loadingAction === `resolve-all-${alert.employeeID}`}
                            className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
                {blockedAlerts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-sm text-slate-400">
                      No blocked-user alerts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <LiveFeed feed={feed} title="Live Security Activity Feed (Monitoring)" maxHeight={870} />
    </div>
  );
}
