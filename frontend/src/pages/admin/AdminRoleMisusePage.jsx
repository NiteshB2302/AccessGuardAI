import { useMemo, useState } from "react";
import ScanAnimation from "../../animations/ScanAnimation";
import { scanRoleMisuse, scanRoleMisuseFromCurrentData } from "../../services/dashboardService";

function levelTone(level) {
  const normalized = (level || "").toString().toLowerCase();
  if (normalized.includes("high") || normalized.includes("threat")) {
    return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  }
  if (normalized.includes("medium") || normalized.includes("warning") || normalized.includes("suspicious")) {
    return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  }
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

function isSuspiciousRow(row) {
  return String(row?.Status || "").toLowerCase() === "suspicious" || Number(row?.["Risk Score"] || 0) >= 0.62;
}

function isAfterHoursRow(row) {
  return Boolean(row?.IsAfterOfficeHours || row?.IsWeekend || String(row?.WorkTiming || "").toLowerCase() === "after_hours");
}

function timingTone(row) {
  if (row?.IsWeekend || String(row?.WorkTiming || "").toLowerCase() === "weekend") {
    return "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn";
  }
  if (isAfterHoursRow(row)) {
    return "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat";
  }
  return "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe";
}

function timingLabel(row) {
  if (row?.IsWeekend || String(row?.WorkTiming || "").toLowerCase() === "weekend") return "Weekend";
  if (isAfterHoursRow(row)) return "After Hours";
  return "Office Hours";
}

export default function AdminRoleMisusePage() {
  const [scanState, setScanState] = useState({ loading: false, error: "" });
  const [roleFile, setRoleFile] = useState(null);
  const [result, setResult] = useState(null);

  const handleRoleMisuseScan = async () => {
    if (!roleFile) return;
    setScanState({ loading: true, error: "" });
    try {
      const response = await scanRoleMisuse(roleFile);
      setResult(response);
      setRoleFile(null);
      setScanState({ loading: false, error: "" });
    } catch (error) {
      setScanState({
        loading: false,
        error: error?.response?.data?.message || "Role misuse analysis failed."
      });
    }
  };

  const handleRoleMisuseCurrentData = async () => {
    setScanState({ loading: true, error: "" });
    try {
      const response = await scanRoleMisuseFromCurrentData();
      setResult(response);
      setScanState({ loading: false, error: "" });
    } catch (error) {
      setScanState({
        loading: false,
        error: error?.response?.data?.message || "Current app role misuse analysis failed."
      });
    }
  };

  const roleOutputRows = result?.output || [];
  const suspiciousRoleRows = useMemo(() => roleOutputRows.filter(isSuspiciousRow).slice(0, 8), [roleOutputRows]);
  const afterHoursRows = useMemo(() => roleOutputRows.filter(isAfterHoursRow).slice(0, 8), [roleOutputRows]);
  const watchlistRows = useMemo(() => {
    const seen = new Set();
    return roleOutputRows
      .filter((row) => isSuspiciousRow(row) || isAfterHoursRow(row))
      .sort((a, b) => Number(b["Risk Score"] || 0) - Number(a["Risk Score"] || 0))
      .filter((row) => {
        const key = `${row.EmployeeID}-${row.AccessedResource}-${row.Timestamp || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }, [roleOutputRows]);
  const afterHoursCount = useMemo(
    () =>
      Number.isFinite(Number(result?.afterHoursRecords))
        ? Number(result.afterHoursRecords)
        : roleOutputRows.filter(isAfterHoursRow).length,
    [result, roleOutputRows]
  );
  const roleRowsForTable = useMemo(
    () =>
      [...roleOutputRows]
        .sort((a, b) => Number(b["Risk Score"] || 0) - Number(a["Risk Score"] || 0))
        .sort((a, b) => Number(isAfterHoursRow(b)) - Number(isAfterHoursRow(a)))
        .sort((a, b) => Number(isSuspiciousRow(b)) - Number(isSuspiciousRow(a))),
    [roleOutputRows]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Role Misuse Detection</h3>
          <p className="mt-1 text-xs text-slate-400">
            Upload CSV/Excel access logs or run analysis directly from current app data.
          </p>

          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setRoleFile(e.target.files?.[0] || null)}
            className="mt-3 block w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 p-2 text-xs"
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              onClick={handleRoleMisuseScan}
              className="w-full rounded-xl bg-cyber-warn px-3 py-2 text-sm font-semibold text-cyber-base"
            >
              Detect From File
            </button>
            <button
              onClick={handleRoleMisuseCurrentData}
              className="w-full rounded-xl border border-cyber-accent/35 bg-cyber-accent/10 px-3 py-2 text-sm font-semibold text-cyber-accent"
            >
              Use Current App Data
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Expected CSV Columns</h4>
          <div className="mt-2 rounded-xl border border-cyber-accent/20 bg-cyber-base/50 p-3 text-xs text-slate-200">
            <p>EmployeeID, Role, AccessedResource, Timestamp</p>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Example: EMP005, Intern, ConfidentialDocs, 2026-03-20T10:12:00Z
          </p>
        </div>
      </div>

      {scanState.loading && <ScanAnimation title="Detecting Role Misuse..." />}

      {!!scanState.error && !scanState.loading && (
        <div className="glass-panel rounded-2xl border border-cyber-threat/30 bg-cyber-threat/10 p-4 text-sm text-cyber-threat">
          {scanState.error}
        </div>
      )}

      {!scanState.loading && !scanState.error && (
        <div className="glass-panel rounded-2xl border border-cyber-accent/25 p-4 text-sm">
          <p className="mb-2 font-semibold text-slate-900">Role Misuse Result</p>

          {!result && <p className="text-slate-400">No role misuse result yet.</p>}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/45 p-2">
                <p className="text-xs text-slate-400">Dataset Source</p>
                <p className="text-xs text-slate-200">
                  {result.datasetSource || "uploaded_csv_or_excel"}
                  {result.datasetRecordsUsed ? ` (${result.datasetRecordsUsed} records)` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/50 p-2">
                  <p className="text-xs text-slate-400">Total Records</p>
                  <p className="text-sm text-slate-100">{result.totalRecords}</p>
                </div>
                <div className="rounded-xl border border-cyber-warn/20 bg-cyber-warn/10 p-2">
                  <p className="text-xs text-slate-400">Suspicious</p>
                  <p className="text-sm text-cyber-warn">{result.suspiciousRecords}</p>
                </div>
                <div className="rounded-xl border border-cyber-threat/20 bg-cyber-threat/10 p-2">
                  <p className="text-xs text-slate-400">After-Hours Activity</p>
                  <p className="text-sm text-cyber-threat">{afterHoursCount}</p>
                </div>
              </div>

              {watchlistRows.length > 0 && (
                <div className="rounded-xl border border-cyber-accent/30 bg-cyber-accent/10 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyber-accent">
                    Priority Watchlist (Suspicious + After Hours)
                  </p>
                  <div className="mt-2 space-y-1">
                    {watchlistRows.map((row, idx) => (
                      <p key={`watchlist-${row.EmployeeID}-${idx}`} className="text-xs text-slate-100">
                        {row.EmployeeID} | {row.Role} | {row.AccessedResource} | {timingLabel(row)} | risk{" "}
                        {row["Risk Score"]}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {suspiciousRoleRows.length > 0 && (
                <div className="rounded-xl border border-cyber-threat/30 bg-cyber-threat/10 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyber-threat">
                    Suspicious Activity Highlights
                  </p>
                  <div className="mt-2 space-y-1">
                    {suspiciousRoleRows.map((row, idx) => (
                      <p key={`highlight-${row.EmployeeID}-${idx}`} className="text-xs text-slate-100">
                        {row.EmployeeID} accessed {row.AccessedResource} (risk {row["Risk Score"]}) {row.Timestamp ? `at ${new Date(row.Timestamp).toLocaleString()}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {afterHoursRows.length > 0 && (
                <div className="rounded-xl border border-cyber-warn/30 bg-cyber-warn/10 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyber-warn">
                    After-Hours / Weekend Signals
                  </p>
                  <div className="mt-2 space-y-1">
                    {afterHoursRows.map((row, idx) => (
                      <p key={`after-hours-${row.EmployeeID}-${idx}`} className="text-xs text-slate-100">
                        {row.EmployeeID} accessed {row.AccessedResource} ({timingLabel(row)}){" "}
                        {row.Timestamp ? `at ${new Date(row.Timestamp).toLocaleString()}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-[420px] overflow-auto rounded-xl border border-cyber-accent/15">
                <table className="cyber-table w-full text-xs">
                  <thead className="sticky top-0 bg-cyber-base/95 text-left text-slate-400">
                    <tr>
                      <th className="px-2 py-2">Employee</th>
                      <th className="px-2 py-2">Role</th>
                      <th className="px-2 py-2">Resource</th>
                      <th className="px-2 py-2">Time</th>
                      <th className="px-2 py-2">Timing</th>
                      <th className="px-2 py-2">Risk</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleRowsForTable.slice(0, 40).map((row, idx) => (
                      <tr
                        key={`${row.EmployeeID}-${idx}`}
                        className={`border-t border-cyber-accent/10 ${
                          isSuspiciousRow(row)
                            ? "bg-cyber-threat/10"
                            : isAfterHoursRow(row)
                              ? "bg-cyber-warn/10"
                              : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 font-mono text-slate-200">{row.EmployeeID}</td>
                        <td className="px-2 py-1.5 text-slate-300">{row.Role}</td>
                        <td className={`px-2 py-1.5 ${isSuspiciousRow(row) ? "text-cyber-threat" : "text-slate-300"}`}>
                          {row.AccessedResource}
                        </td>
                        <td className="px-2 py-1.5 text-slate-300">
                          {row.Timestamp ? new Date(row.Timestamp).toLocaleString() : "N/A"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${timingTone(row)}`}>
                            {timingLabel(row)}
                          </span>
                        </td>
                        <td
                          className={`px-2 py-1.5 ${isSuspiciousRow(row) ? "font-semibold text-cyber-threat" : "text-slate-200"}`}
                        >
                          {row["Risk Score"]}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${levelTone(row.Status)}`}>
                            {row.Status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-slate-300">
                          {Array.isArray(row.SuspiciousSignals) && row.SuspiciousSignals.length
                            ? row.SuspiciousSignals.join(", ")
                            : "normal_pattern"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
