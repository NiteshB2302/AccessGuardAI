import { useEffect, useMemo, useState } from "react";
import LiveFeed from "../../components/LiveFeed";
import ThreatLevelBadge from "../../dashboard/ThreatLevelBadge";
import {
  approveDocumentDownloadRequest,
  blockEmployeeAccount,
  fetchDocumentDownloadRequests,
  fetchAlertBuckets,
  fetchExfiltrationIncidents,
  fetchEmployees,
  fetchLiveFeed,
  fetchRiskTable,
  fetchSessionAuditLogs,
  rejectDocumentDownloadRequest,
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
  if (["approved_to_send", "sent", "resolved"].includes(normalized)) {
    return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
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

function normalizeEmployeeID(value) {
  return String(value || "").trim().toUpperCase();
}

function sessionTone(entry) {
  if (entry?.isWeekend) return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  if (entry?.isAfterOfficeHours) return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

function sessionLabel(entry) {
  if (entry?.isWeekend) return "Weekend";
  if (entry?.isAfterOfficeHours) return "After Hours";
  return "Office Hours";
}

function actionBadgeTone(actionType) {
  return actionType === "logout"
    ? "border-cyber-accent/35 bg-cyber-accent/10 text-cyber-accent"
    : "border-cyber-safe/35 bg-cyber-safe/10 text-cyber-safe";
}

export default function AdminMonitoringPage() {
  const [alerts, setAlerts] = useState([]);
  const [blockedAlerts, setBlockedAlerts] = useState([]);
  const [alertCounts, setAlertCounts] = useState({ active: 0, blocked: 0, total: 0 });
  const [riskTable, setRiskTable] = useState([]);
  const [feed, setFeed] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [exfilIncidents, setExfilIncidents] = useState([]);
  const [downloadRequests, setDownloadRequests] = useState([]);
  const [sessionLogs, setSessionLogs] = useState([]);
  const [sessionSummary, setSessionSummary] = useState({
    total: 0,
    logins: 0,
    logouts: 0,
    afterHours: 0,
    weekends: 0
  });
  const [sessionPolicy, setSessionPolicy] = useState("09:00-18:00");
  const [sessionFilters, setSessionFilters] = useState({
    actionType: "all",
    afterHours: "all",
    department: "all",
    employeeID: "",
    from: "",
    to: ""
  });
  const [actionMessage, setActionMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  const buildSessionParams = () => {
    const params = {
      limit: 250
    };

    if (sessionFilters.actionType !== "all") params.actionType = sessionFilters.actionType;
    if (sessionFilters.afterHours !== "all") params.afterHours = sessionFilters.afterHours;
    if (sessionFilters.department !== "all") params.department = sessionFilters.department;
    if (sessionFilters.employeeID.trim()) params.employeeID = sessionFilters.employeeID.trim().toUpperCase();
    if (sessionFilters.from) params.from = sessionFilters.from;
    if (sessionFilters.to) params.to = sessionFilters.to;

    return params;
  };

  const loadData = async () => {
    const [alertBuckets, riskRows, liveFeed, employeeList, incidentRows, requestRows, sessionData] = await Promise.all([
      fetchAlertBuckets(false),
      fetchRiskTable(),
      fetchLiveFeed(),
      fetchEmployees(),
      fetchExfiltrationIncidents({ limit: 80 }),
      fetchDocumentDownloadRequests({ limit: 100 }),
      fetchSessionAuditLogs(buildSessionParams())
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
    setDownloadRequests(requestRows);
    setSessionLogs(sessionData?.rows || []);
    setSessionSummary(
      sessionData?.summary || {
        total: 0,
        logins: 0,
        logouts: 0,
        afterHours: 0,
        weekends: 0
      }
    );
    setSessionPolicy(sessionData?.officeHoursPolicy || "09:00-18:00");
  };

  useEffect(() => {
    loadData().catch(() => {});
    const interval = setInterval(() => {
      loadData().catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, [sessionFilters]);

  const employeeStatusMap = useMemo(
    () =>
      employees.reduce((acc, user) => {
        acc[normalizeEmployeeID(user.employeeID)] = user.accountStatus || "Active";
        return acc;
      }, {}),
    [employees]
  );

  const employeeRoleMap = useMemo(
    () =>
      employees.reduce((acc, user) => {
        acc[normalizeEmployeeID(user.employeeID)] = user.role;
        return acc;
      }, {}),
    [employees]
  );

  const mergedRiskRows = useMemo(
    () =>
      riskTable.map((row) => {
        const normalizedEmployeeID = normalizeEmployeeID(row.employeeID);
        return {
          ...row,
          accountStatus: employeeStatusMap[normalizedEmployeeID] || row.accountStatus || "Active"
        };
      }),
    [riskTable, employeeStatusMap]
  );

  const actionableDownloadRequests = useMemo(
    () => downloadRequests.filter((request) => ["pending_admin", "otp_sent", "expired"].includes(request.status)),
    [downloadRequests]
  );

  const departmentOptions = useMemo(() => {
    const departments = [...new Set(employees.map((item) => String(item.department || "").trim()).filter(Boolean))].sort();
    return ["all", ...departments];
  }, [employees]);

  const handleSendAlert = async (rowOrEmployeeID, contextLabel = "suspicious activity") => {
    const employeeID = normalizeEmployeeID(
      typeof rowOrEmployeeID === "string" ? rowOrEmployeeID : rowOrEmployeeID.employeeID
    );
    if (!employeeID) {
      setActionMessage("Unable to send alert: missing employee reference in incident.");
      return;
    }

    const employeeRole = employeeRoleMap[employeeID];
    if (!employeeRole) {
      setActionMessage(`Cannot send alert: ${employeeID} no longer exists in employee directory.`);
      return;
    }
    if (employeeRole === "Admin") {
      setActionMessage("Admin accounts cannot receive this alert action.");
      return;
    }

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
    const employeeID = normalizeEmployeeID(
      typeof rowOrEmployeeID === "string" ? rowOrEmployeeID : rowOrEmployeeID.employeeID
    );
    if (!employeeID) {
      setActionMessage("Unable to update account status: missing employee reference in incident.");
      return;
    }

    const employeeRole = employeeRoleMap[employeeID];
    if (!employeeRole) {
      setActionMessage(`Cannot update account status: ${employeeID} does not exist anymore.`);
      return;
    }
    if (employeeRole === "Admin") {
      setActionMessage("Admin accounts cannot be blocked from this queue.");
      return;
    }

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

  const handleApproveDownloadRequest = async (request) => {
    setActionMessage("");
    setLoadingAction(`download-approve-${request.id}`);
    try {
      const response = await approveDocumentDownloadRequest(request.id);
      const otp = response?.otpPreview ? ` OTP: ${response.otpPreview}` : "";
      setActionMessage(`Approval sent for ${request.employeeID}.${otp}`);
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to approve download request.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleRejectDownloadRequest = async (request) => {
    setActionMessage("");
    setLoadingAction(`download-reject-${request.id}`);
    try {
      await rejectDocumentDownloadRequest(request.id, "Request rejected by admin security policy.");
      setActionMessage(`Rejected request ${request.requestID} for ${request.employeeID}.`);
      await loadData();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || "Unable to reject download request.");
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

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-warn/25 bg-cyber-warn/5 p-4">
          <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Restricted Download Approval Queue</h3>
          <div className="max-h-[280px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Request</th>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Document</th>
                  <th className="pb-2">Risk</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {actionableDownloadRequests.map((request) => (
                  <tr
                    key={request.id}
                    className={`border-t border-cyber-accent/10 ${
                      Number(request.riskScore || 0) >= 0.7 ? "bg-cyber-threat/10" : "bg-cyber-warn/5"
                    }`}
                  >
                    <td className="py-2 font-mono text-xs text-slate-300">{request.requestID}</td>
                    <td className="py-2 text-slate-100">
                      <p className="font-mono text-xs">{request.employeeID}</p>
                      <p className="text-[11px] text-slate-400">{request.role}</p>
                    </td>
                    <td className="py-2 text-slate-200">
                      <p>{request.documentName}</p>
                      <p className="text-[11px] text-slate-400">{request.sensitivityLevel}</p>
                    </td>
                    <td className="py-2 font-semibold text-slate-100">{Number(request.riskScore || 0).toFixed(2)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          request.status === "pending_admin"
                            ? "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn"
                            : request.status === "otp_sent"
                              ? "border-cyber-accent/45 bg-cyber-accent/10 text-cyber-accent"
                              : request.status === "approved"
                                ? "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe"
                                : "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat"
                        }`}
                      >
                        {request.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleApproveDownloadRequest(request)}
                          disabled={
                            !["pending_admin", "otp_sent", "expired"].includes(request.status) ||
                            loadingAction === `download-approve-${request.id}`
                          }
                          className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                        >
                          Approve + OTP
                        </button>
                        <button
                          onClick={() => handleRejectDownloadRequest(request)}
                          disabled={
                            !["pending_admin", "otp_sent", "expired"].includes(request.status) ||
                            loadingAction === `download-reject-${request.id}`
                          }
                          className="rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-1 text-xs text-cyber-threat disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {actionableDownloadRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                      No restricted download requests.
                    </td>
                  </tr>
                )}
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
                  (() => {
                    const incidentEmployeeID = normalizeEmployeeID(incident.employeeID);
                    const employeeRole = employeeRoleMap[incidentEmployeeID];
                    const employeeExists = Boolean(employeeRole);
                    const isAdminEmployee = employeeRole === "Admin";
                    return (
                      <tr
                        key={incident._id}
                        className={`border-t border-cyber-accent/10 ${
                          incident.riskScore >= 0.7 || ["blocked_by_policy", "sent_override"].includes(incident.status)
                            ? "bg-cyber-threat/10"
                            : ""
                        }`}
                      >
                        <td className="py-2 font-mono text-xs text-slate-300">
                          {incidentEmployeeID || "-"}
                          {!employeeExists && (
                            <p className="text-[10px] text-cyber-warn">Archived employee</p>
                          )}
                        </td>
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
                              onClick={() => handleSendAlert(incidentEmployeeID, "possible data exfiltration")}
                              disabled={!employeeExists || isAdminEmployee}
                              className="rounded-lg border border-cyber-warn/35 bg-cyber-warn/10 px-2 py-1 text-xs text-cyber-warn disabled:opacity-60"
                            >
                              Alert
                            </button>
                            <button
                              onClick={() => handleBlockToggle(incidentEmployeeID)}
                              disabled={!employeeExists || isAdminEmployee}
                              className="rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-1 text-xs text-cyber-threat disabled:opacity-60"
                            >
                              {employeeStatusMap[incidentEmployeeID] === "Blocked" ? "Unblock" : "Block"}
                            </button>
                            <button
                              onClick={() => handleIncidentStatus(incident, "approved_to_send")}
                              disabled={loadingAction === `incident-${incident._id}-approved_to_send`}
                              className="rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1 text-xs text-cyber-safe disabled:opacity-60"
                            >
                              Approve Send
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
                    );
                  })()
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

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-slate-900">Session Audit Logs</h3>
            <span className="rounded-full border border-cyber-accent/30 bg-cyber-base/55 px-2 py-0.5 text-xs text-slate-300">
              Office Hours: {sessionPolicy}
            </span>
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={sessionFilters.actionType}
              onChange={(event) => setSessionFilters((prev) => ({ ...prev, actionType: event.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
            </select>

            <select
              value={sessionFilters.afterHours}
              onChange={(event) => setSessionFilters((prev) => ({ ...prev, afterHours: event.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Timing</option>
              <option value="true">After Hours Only</option>
              <option value="false">Office Hours Only</option>
            </select>

            <select
              value={sessionFilters.department}
              onChange={(event) => setSessionFilters((prev) => ({ ...prev, department: event.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Departments</option>
              {departmentOptions
                .filter((department) => department !== "all")
                .map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
            </select>

            <input
              value={sessionFilters.employeeID}
              onChange={(event) => setSessionFilters((prev) => ({ ...prev, employeeID: event.target.value }))}
              placeholder="Employee ID"
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
            />

            <button
              onClick={() =>
                setSessionFilters({
                  actionType: "all",
                  afterHours: "all",
                  department: "all",
                  employeeID: "",
                  from: "",
                  to: ""
                })
              }
              className="rounded-xl border border-cyber-safe/35 bg-cyber-safe/10 px-2 py-1.5 text-xs text-cyber-safe"
            >
              Reset Filters
            </button>
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-300">
              From
              <input
                type="date"
                value={sessionFilters.from}
                onChange={(event) => setSessionFilters((prev) => ({ ...prev, from: event.target.value }))}
                className="mt-1 block w-full rounded-lg border border-cyber-accent/15 bg-cyber-base/65 px-2 py-1 text-xs text-slate-200"
              />
            </label>
            <label className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-300">
              To
              <input
                type="date"
                value={sessionFilters.to}
                onChange={(event) => setSessionFilters((prev) => ({ ...prev, to: event.target.value }))}
                className="mt-1 block w-full rounded-lg border border-cyber-accent/15 bg-cyber-base/65 px-2 py-1 text-xs text-slate-200"
              />
            </label>
            <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-2 py-1.5 text-xs text-slate-300">
              <p>Total Sessions</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{sessionSummary.total}</p>
            </div>
            <div className="rounded-xl border border-cyber-warn/25 bg-cyber-warn/10 px-2 py-1.5 text-xs text-cyber-warn">
              <p>After-Hours / Weekend</p>
              <p className="mt-1 text-sm font-semibold">
                {sessionSummary.afterHours} / {sessionSummary.weekends}
              </p>
            </div>
          </div>

          <div className="max-h-[340px] overflow-auto">
            <table className="cyber-table w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Timing</th>
                  <th className="pb-2">Department</th>
                  <th className="pb-2">Session</th>
                </tr>
              </thead>
              <tbody>
                {sessionLogs.map((entry) => (
                  <tr key={entry.id} className="border-t border-cyber-accent/10">
                    <td className="py-2 text-xs text-slate-300">
                      {new Date(entry.timestamp).toLocaleString()}
                      {entry.localTimeLabel && <p className="text-[10px] text-slate-500">{entry.localTimeLabel}</p>}
                    </td>
                    <td className="py-2">
                      <p className="font-mono text-xs text-slate-200">{entry.employeeID}</p>
                      <p className="text-xs text-slate-400">
                        {entry.employeeName} | {entry.role}
                      </p>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${actionBadgeTone(entry.actionType)}`}>
                        {String(entry.actionType || "").toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${sessionTone(entry)}`}>
                        {sessionLabel(entry)}
                      </span>
                    </td>
                    <td className="py-2 text-slate-300">{entry.department}</td>
                    <td className="py-2 text-xs text-slate-300">
                      {entry.actionType === "logout" && Number.isFinite(entry.sessionDurationMinutes)
                        ? `${entry.sessionDurationMinutes} min`
                        : "-"}
                    </td>
                  </tr>
                ))}
                {sessionLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                      No session logs match selected filters.
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
