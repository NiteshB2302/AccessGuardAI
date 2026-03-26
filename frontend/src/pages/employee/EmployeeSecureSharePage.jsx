import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Lock, Mail, Send, ShieldCheck, ShieldX } from "lucide-react";
import {
  analyzeSecureShare,
  decideSecureShare,
  fetchDocuments,
  fetchMySecureShareIncidents
} from "../../services/dashboardService";

function riskTone(score) {
  if (score >= 0.75) return "text-cyber-threat";
  if (score >= 0.45) return "text-cyber-warn";
  return "text-cyber-safe";
}

function badgeForStatus(status) {
  const key = String(status || "").toLowerCase();
  if (["blocked_pending_override", "blocked_by_policy", "sent_override"].includes(key)) {
    return "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat";
  }
  if (["approval_requested", "investigating"].includes(key)) {
    return "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn";
  }
  if (["sent", "resolved", "analyzed"].includes(key)) {
    return "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe";
  }
  return "border-cyber-accent/30 bg-cyber-accent/10 text-cyber-accent";
}

function statusLabel(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmployeeSecureSharePage() {
  const [documents, setDocuments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [form, setForm] = useState({
    recipientEmail: "",
    subject: "",
    content: "",
    documentId: ""
  });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState("");

  const loadData = async () => {
    const [docs, incidentRows] = await Promise.all([fetchDocuments(), fetchMySecureShareIncidents()]);
    setDocuments(docs || []);
    setIncidents(incidentRows || []);
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  const selectedDocument = useMemo(
    () => documents.find((item) => item.documentID === form.documentId) || null,
    [documents, form.documentId]
  );

  const handleAnalyze = async () => {
    if (!form.recipientEmail.trim() || !form.content.trim()) {
      setMessage("Recipient email and message are required.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const payload = {
        recipientEmail: form.recipientEmail,
        subject: form.subject,
        content: form.content,
        documentId: form.documentId || null
      };
      const result = await analyzeSecureShare(payload);
      setAnalysisResult(result);
      setMessage(result.analysis?.recommendation || "Analysis completed.");
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || "Unable to analyze secure-share message.");
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (decision) => {
    if (!analysisResult?.incident?.id) return;
    setDecisionLoading(decision);
    setMessage("");
    try {
      const result = await decideSecureShare(analysisResult.incident.id, decision);
      setMessage(result.message || "Decision updated.");
      await loadData();
      setAnalysisResult((prev) =>
        prev
          ? {
              ...prev,
              incident: {
                ...prev.incident,
                status: result.incident?.status || prev.incident.status
              }
            }
          : prev
      );
    } catch (error) {
      setMessage(error?.response?.data?.message || "Unable to process decision.");
    } finally {
      setDecisionLoading("");
    }
  };

  const scoreWidth = `${Math.round((analysisResult?.analysis?.riskScore || 0) * 100)}%`;

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-cyber-accent/30 bg-gradient-to-r from-cyber-panel to-cyber-base p-5 shadow-cyber"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyber-accent">Secure Share Guard</p>
            <h2 className="font-display text-2xl font-semibold text-slate-900">Outgoing Email Leakage Protection</h2>
            <p className="mt-1 text-sm text-slate-300">
              AI checks if downloaded or sensitive document content is being sent outside company boundaries.
            </p>
          </div>
          <div className="rounded-2xl border border-cyber-accent/25 bg-cyber-base/45 px-4 py-3 text-sm text-slate-200">
            <p>Model: TF-IDF Similarity + Policy Risk Fusion</p>
          </div>
        </div>
      </motion.section>

      {message && (
        <div className="rounded-xl border border-cyber-accent/35 bg-cyber-accent/10 px-3 py-2 text-sm text-cyber-accent">
          {message}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Compose Outgoing Email</h3>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Recipient Email</label>
              <input
                value={form.recipientEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, recipientEmail: e.target.value }))}
                placeholder="external.partner@gmail.com"
                className="w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Subject</label>
              <input
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Quarterly strategy update"
                className="w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Attach Accessed Document (Optional)</label>
              <select
                value={form.documentId}
                onChange={(e) => setForm((prev) => ({ ...prev, documentId: e.target.value }))}
                className="w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
              >
                <option value="">No Document Selected</option>
                {documents.map((doc) => (
                  <option key={doc.documentID} value={doc.documentID}>
                    {doc.name} ({doc.sensitivityLevel})
                  </option>
                ))}
              </select>
              {selectedDocument && (
                <p className="mt-1 text-xs text-slate-400">
                  {selectedDocument.department} • {selectedDocument.sensitivityLevel}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Message Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Write your outgoing message..."
                className="h-40 w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
              />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyber-accent px-4 py-2 text-sm font-semibold text-cyber-base disabled:opacity-70"
            >
              <Mail className="h-4 w-4" />
              {loading ? "Running Leakage Analysis..." : "Analyze With Secure Share Guard"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">AI Analysis & Action Center</h3>
          {!analysisResult && <p className="text-sm text-slate-400">Run analysis to view risk and recommendations.</p>}

          {analysisResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Risk Score</p>
                  <p className={`font-display text-2xl ${riskTone(analysisResult.analysis.riskScore)}`}>
                    {analysisResult.analysis.riskScore}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-cyber-panelSoft">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: scoreWidth }}
                    className={`h-full ${
                      analysisResult.analysis.riskScore >= 0.75
                        ? "bg-cyber-threat"
                        : analysisResult.analysis.riskScore >= 0.45
                          ? "bg-cyber-warn"
                          : "bg-cyber-safe"
                    }`}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-200">
                  Threat Level:{" "}
                  <span className={riskTone(analysisResult.analysis.riskScore)}>
                    {analysisResult.analysis.threatLevel}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-400">{analysisResult.analysis.recommendation}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-cyber-accent/15 bg-cyber-base/45 p-2 text-slate-300">
                  Similarity: {analysisResult.analysis.scoreBreakdown.similarity}
                </div>
                <div className="rounded-lg border border-cyber-accent/15 bg-cyber-base/45 p-2 text-slate-300">
                  Sensitivity: {analysisResult.analysis.scoreBreakdown.sensitivity}
                </div>
                <div className="rounded-lg border border-cyber-accent/15 bg-cyber-base/45 p-2 text-slate-300">
                  External Signal: {analysisResult.analysis.scoreBreakdown.external}
                </div>
                <div className="rounded-lg border border-cyber-accent/15 bg-cyber-base/45 p-2 text-slate-300">
                  Access Chain: {analysisResult.analysis.scoreBreakdown.chain}
                </div>
              </div>

              <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/45 p-3 text-xs">
                <p className="mb-1 text-slate-400">Suspicious Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {(analysisResult.analysis.suspiciousKeywords || []).length === 0 && (
                    <span className="text-slate-500">None</span>
                  )}
                  {(analysisResult.analysis.suspiciousKeywords || []).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-0.5 text-cyber-threat"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/45 p-3 text-xs text-slate-300">
                <p className="text-slate-400">Incident Status</p>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 ${badgeForStatus(analysisResult.incident.status)}`}>
                  {statusLabel(analysisResult.incident.status)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDecision("send")}
                  disabled={decisionLoading === "send"}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyber-safe/35 bg-cyber-safe/10 px-3 py-1.5 text-xs text-cyber-safe disabled:opacity-70"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
                <button
                  onClick={() => handleDecision("send_anyway")}
                  disabled={analysisResult.analysis.hardBlocked || decisionLoading === "send_anyway"}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-3 py-1.5 text-xs text-cyber-threat disabled:opacity-55"
                >
                  <ShieldX className="h-3.5 w-3.5" />
                  Send Anyway
                </button>
                <button
                  onClick={() => handleDecision("request_approval")}
                  disabled={decisionLoading === "request_approval"}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyber-warn/35 bg-cyber-warn/10 px-3 py-1.5 text-xs text-cyber-warn disabled:opacity-70"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Request Approval
                </button>
                <button
                  onClick={() => handleDecision("cancel")}
                  disabled={decisionLoading === "cancel"}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-500 bg-cyber-base/60 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-70"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>

              {analysisResult.analysis.hardBlocked && (
                <div className="rounded-xl border border-cyber-threat/40 bg-cyber-threat/10 p-2 text-xs text-cyber-threat">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Hard policy block: this transmission cannot be sent.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
        <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Secure Share Incident History</h3>
        <div className="max-h-[340px] overflow-auto">
          <table className="cyber-table w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2">Time</th>
                <th className="pb-2">Recipient</th>
                <th className="pb-2">Document</th>
                <th className="pb-2">Risk</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((row) => (
                <tr
                  key={row._id}
                  className={`border-t border-cyber-accent/10 ${
                    row.riskScore >= 0.7 || ["sent_override", "blocked_by_policy"].includes(row.status)
                      ? "bg-cyber-threat/8"
                      : ""
                  }`}
                >
                  <td className="py-2 text-xs text-slate-300">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2 text-slate-200">{row.recipientEmail}</td>
                  <td className="py-2 text-slate-300">{row.documentName || "Message Only"}</td>
                  <td className={`py-2 font-semibold ${riskTone(row.riskScore)}`}>{row.riskScore}</td>
                  <td className="py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeForStatus(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-slate-400">
                    No secure-share incidents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
