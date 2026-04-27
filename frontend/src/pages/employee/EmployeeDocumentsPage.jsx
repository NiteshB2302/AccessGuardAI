import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eye, FileLock2, Search, ShieldAlert, UploadCloud } from "lucide-react";
import {
  accessDocument,
  createDocument,
  fetchDocuments,
  fetchMyDocumentRequests,
  requestDocumentDownload,
  verifyDocumentDownloadOtp
} from "../../services/dashboardService";
import { useAuth } from "../../services/AuthContext";

const LEVELS = ["All", "Public", "Internal", "Confidential", "Top Secret"];
const SENSITIVITY_OPTIONS = ["Public", "Internal", "Confidential", "Top Secret"];

function badgeTone(level) {
  if (level === "Top Secret") return "bg-cyber-threat/20 text-cyber-threat border-cyber-threat/40";
  if (level === "Confidential") return "bg-cyber-warn/20 text-cyber-warn border-cyber-warn/40";
  if (level === "Internal") return "bg-cyber-accent/20 text-cyber-accent border-cyber-accent/40";
  return "bg-cyber-safe/20 text-cyber-safe border-cyber-safe/40";
}

function requestStatusTone(status) {
  if (status === "approved") return "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe";
  if (status === "otp_sent") return "border-cyber-accent/45 bg-cyber-accent/10 text-cyber-accent";
  if (status === "pending_admin") return "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn";
  return "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat";
}

function statusBannerTone(type) {
  if (type === "success") return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
  if (type === "warning") return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  if (type === "error") return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  return "border-cyber-accent/30 bg-cyber-accent/10 text-cyber-accent";
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = fileName || "document.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function EmployeeDocumentsPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [requestHistory, setRequestHistory] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("All");
  const [loadingAction, setLoadingAction] = useState("");
  const [viewDoc, setViewDoc] = useState(null);
  const [restrictedPrompt, setRestrictedPrompt] = useState(null);
  const [otpPrompt, setOtpPrompt] = useState(null);
  const [otpValue, setOtpValue] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [form, setForm] = useState({
    name: "",
    sensitivityLevel: "Internal",
    department: user?.department || "",
    content: "",
    file: null
  });

  const updateStatus = (message, type = "info") => {
    setStatusMessage(message);
    setStatusType(type);
  };

  const loadData = async () => {
    const [docs, requests] = await Promise.all([fetchDocuments(), fetchMyDocumentRequests(20)]);
    setDocuments(docs);
    setRequestHistory(requests);
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.department) {
      setForm((prev) => ({ ...prev, department: prev.department || user.department }));
    }
  }, [user?.department]);

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const matchesLevel = level === "All" ? true : document.sensitivityLevel === level;
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          document.name.toLowerCase().includes(q) ||
          document.department.toLowerCase().includes(q) ||
          document.sensitivityLevel.toLowerCase().includes(q);
        return matchesLevel && matchesSearch;
      }),
    [documents, level, search]
  );

  const handleDocumentAction = async (document, action) => {
    updateStatus("", "info");
    setLoadingAction(`${action}-${document.documentID}`);
    try {
      const data = await accessDocument(document.documentID, action);
      if (action === "view") {
        setViewDoc(data?.document || null);
        updateStatus(data?.message || "Document opened.", "success");
      } else {
        downloadTextFile(data?.document?.name, data?.document?.content);
        updateStatus(
          `Downloaded ${data?.document?.name}. Risk score ${Number(data?.audit?.riskScore || 0).toFixed(2)}.`,
          "success"
        );
      }
      setRestrictedPrompt(null);
      await loadData();
    } catch (error) {
      const payload = error?.response?.data || {};
      if (payload?.requiresAdminApproval) {
        setRestrictedPrompt({
          document: payload.document,
          existingRequest: payload.existingRequest || null,
          alert: payload.alert || null
        });
      } else {
        updateStatus(payload?.message || "Document action failed.", "error");
      }
      await loadData();
    } finally {
      setLoadingAction("");
    }
  };

  const handleRequestAdmin = async () => {
    if (!restrictedPrompt?.document?.documentID) return;
    setLoadingAction(`request-${restrictedPrompt.document.documentID}`);
    try {
      const response = await requestDocumentDownload(restrictedPrompt.document.documentID, requestReason);
      const request = response?.request;
      updateStatus(response?.message || "Request submitted.", "warning");
      setRestrictedPrompt(null);
      setRequestReason("");
      setOtpPrompt({
        requestID: request?.requestID,
        requestDoc: restrictedPrompt.document.name,
        requestRef: request?.id
      });
      await loadData();
    } catch (error) {
      updateStatus(error?.response?.data?.message || "Unable to submit admin request.", "error");
    } finally {
      setLoadingAction("");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpPrompt?.requestRef || !otpValue.trim()) {
      updateStatus("Enter OTP from notifications.", "warning");
      return;
    }
    setLoadingAction(`otp-${otpPrompt.requestRef}`);
    try {
      const response = await verifyDocumentDownloadOtp(otpPrompt.requestRef, otpValue.trim());
      downloadTextFile(response?.document?.name, response?.document?.content);
      updateStatus(`OTP verified. Download started for ${response?.document?.name}.`, "success");
      setOtpPrompt(null);
      setOtpValue("");
      await loadData();
    } catch (error) {
      updateStatus(error?.response?.data?.message || "OTP verification failed.", "error");
    } finally {
      setLoadingAction("");
    }
  };

  const handleCreateDocument = async (event) => {
    event.preventDefault();
    setLoadingAction("create-document");
    updateStatus("", "info");
    try {
      const response = await createDocument({
        name: form.name,
        department: form.department,
        sensitivityLevel: form.sensitivityLevel,
        content: form.content,
        file: form.file
      });
      const riskLevel = String(response?.scan?.riskLevel || "LOW").toUpperCase();
      const scanSummary = response?.scan
        ? ` Scan: ${response.scan.riskLevel} (${Number(response.scan.riskScore || 0).toFixed(2)}).`
        : "";
      const tone = riskLevel === "HIGH" ? "warning" : riskLevel === "MEDIUM" ? "warning" : "success";
      updateStatus(`${response?.message || "Document added."}${scanSummary}`, tone);
      setForm((prev) => ({
        ...prev,
        name: "",
        content: "",
        file: null
      }));
      setFileInputKey((prev) => prev + 1);
      await loadData();
    } catch (error) {
      const payload = error?.response?.data || {};
      const scanSummary = payload?.scan
        ? ` Scan: ${payload.scan.riskLevel} (${Number(payload.scan.riskScore || 0).toFixed(2)}).`
        : "";
      const isWarning = Boolean(payload?.warning) || String(payload?.scan?.riskLevel || "").toUpperCase() === "HIGH";
      updateStatus(`${payload?.message || "Unable to add document."}${scanSummary}`, isWarning ? "warning" : "error");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateDocument} className="rounded-2xl border border-cyber-safe/25 bg-cyber-safe/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-cyber-safe" />
          <h3 className="font-display text-lg font-semibold text-slate-900">Add New Document</h3>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Upload a TXT/PDF/DOCX file or paste real content to create role-aware documents.
        </p>

        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
            placeholder="Document name"
          />
          <input
            value={form.department}
            disabled={user?.role === "Employee"}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            className="rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent disabled:opacity-60"
            placeholder="Department"
          />
        </div>

        <div className="mt-2">
          <select
            value={form.sensitivityLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, sensitivityLevel: e.target.value }))}
            className="rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
          >
            {SENSITIVITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="mt-2 rounded-xl border border-cyber-accent/20 bg-cyber-base/45 px-3 py-2 text-xs text-slate-300">
            Tags are auto-detected from file name, department, sensitivity, content keywords, and AI risk signals.
          </p>
        </div>

        <textarea
          value={form.content}
          onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
          placeholder="Paste document content here (optional if uploading file)."
          className="mt-2 min-h-[110px] w-full rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            key={fileInputKey}
            type="file"
            accept=".txt,.pdf,.docx"
            onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
            className="rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-xs text-slate-300"
          />
          <button
            type="submit"
            disabled={loadingAction === "create-document"}
            className="rounded-xl border border-cyber-safe/45 bg-cyber-safe/10 px-3 py-2 text-sm font-medium text-cyber-safe disabled:opacity-60"
          >
            {loadingAction === "create-document" ? "Adding..." : "Add Document"}
          </button>
        </div>
      </form>

      {statusMessage && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${statusBannerTone(statusType)}`}>
          {statusMessage}
        </p>
      )}

      <div className="rounded-2xl border border-cyber-accent/25 bg-cyber-base/55 p-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">Document Portal</h2>
        <p className="mt-1 text-sm text-slate-400">
          View all documents, download role-approved files instantly, and request admin OTP for restricted downloads.
        </p>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-accent/70" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents, department, sensitivity..."
              className="w-full rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/35 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-cyber-accent"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((item) => (
              <button
                key={item}
                onClick={() => setLevel(item)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  level === item
                    ? "border-cyber-accent/45 bg-cyber-accent/15 text-slate-900"
                    : "border-cyber-accent/20 bg-cyber-base/45 text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-cyber-accent/20 bg-cyber-base/50 p-4">
        <h3 className="mb-2 font-display text-lg font-semibold text-slate-900">Recent Download Requests</h3>
        <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
          {requestHistory.map((request) => (
            <div key={request.id} className="rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-100">{request.documentName}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${requestStatusTone(request.status)}`}>
                  {request.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {request.requestID} | Risk {Number(request.riskScore || 0).toFixed(2)}
              </p>
            </div>
          ))}
          {requestHistory.length === 0 && (
            <p className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/20 px-3 py-4 text-sm text-slate-400">
              No restricted download requests yet.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredDocuments.map((document, index) => (
          <motion.div
            key={document._id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className="glass-panel rounded-2xl border border-cyber-accent/20 p-4"
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="rounded-lg bg-cyber-accent/15 p-2">
                  <FileLock2 className="h-4 w-4 text-cyber-accent" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900" title={document.name}>
                    {document.name}
                  </p>
                  <p className="text-xs text-slate-400">{document.department}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:flex-col sm:items-end">
                <span className={`max-w-full rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${badgeTone(document.sensitivityLevel)}`}>
                  {document.sensitivityLevel}
                </span>
                <span
                  className={`max-w-full rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${
                    document.downloadAllowed
                      ? "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe"
                      : "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn"
                  }`}
                >
                  {document.downloadAllowed ? "Direct Download" : "Admin OTP Required"}
                </span>
              </div>
            </div>

            <p className="mb-3 line-clamp-2 text-xs text-slate-400">{document.contentPreview}</p>
            {Array.isArray(document.tags) && document.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {document.tags.slice(0, 4).map((tag) => (
                  <span
                    key={`${document.documentID}-${tag}`}
                    className="rounded-full border border-cyber-accent/30 bg-cyber-accent/10 px-2 py-0.5 text-[10px] text-cyber-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleDocumentAction(document, "view")}
                disabled={loadingAction === `view-${document.documentID}`}
                className="inline-flex items-center gap-1 rounded-lg border border-cyber-accent/30 bg-cyber-accent/10 px-3 py-1.5 text-xs text-cyber-accent disabled:opacity-60"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
              <button
                onClick={() => handleDocumentAction(document, "download")}
                disabled={loadingAction === `download-${document.documentID}`}
                className="inline-flex items-center gap-1 rounded-lg border border-cyber-safe/30 bg-cyber-safe/10 px-3 py-1.5 text-xs text-cyber-safe disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredDocuments.length === 0 && (
        <div className="rounded-2xl border border-cyber-accent/20 bg-cyber-panelSoft/30 p-6 text-center text-sm text-slate-400">
          No documents match your current filter.
        </div>
      )}

      {viewDoc && (
        <div className="fixed inset-0 z-[540] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-cyber-accent/30 bg-cyber-base p-5 shadow-cyber">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-semibold text-slate-100">{viewDoc.name}</h3>
              <button
                onClick={() => setViewDoc(null)}
                className="rounded-lg border border-cyber-accent/30 bg-cyber-accent/10 px-2 py-1 text-xs text-cyber-accent"
              >
                Close
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-400">
              {viewDoc.department} | {viewDoc.sensitivityLevel}
            </p>
            <pre className="max-h-[420px] overflow-auto rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/35 p-3 text-xs leading-6 text-slate-200">
              {viewDoc.content}
            </pre>
          </div>
        </div>
      )}

      {restrictedPrompt && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-cyber-warn/45 bg-cyber-base p-5 shadow-cyber">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-cyber-warn" />
              <h3 className="font-display text-xl font-semibold text-cyber-warn">Restricted Download</h3>
            </div>
            <p className="mt-2 text-sm text-slate-200">
              This file is outside your direct download permissions. You can request admin OTP approval.
            </p>
            <div className="mt-3 rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/35 p-3 text-sm text-slate-200">
              <p>Document: {restrictedPrompt.document?.name}</p>
              <p>Department: {restrictedPrompt.document?.department}</p>
              <p>Sensitivity: {restrictedPrompt.document?.sensitivityLevel}</p>
              {restrictedPrompt.alert?.riskScore !== undefined && (
                <p className="mt-1 text-cyber-warn">Risk score added: {Number(restrictedPrompt.alert.riskScore).toFixed(2)}</p>
              )}
            </div>
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Reason for download request (optional)"
              className="mt-3 min-h-[78px] w-full rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyber-accent"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleRequestAdmin}
                disabled={loadingAction === `request-${restrictedPrompt.document?.documentID}`}
                className="rounded-lg border border-cyber-accent/40 bg-cyber-accent/15 px-3 py-2 text-sm text-cyber-accent disabled:opacity-60"
              >
                Request Admin
              </button>
              <button
                onClick={() => {
                  setRestrictedPrompt(null);
                  setRequestReason("");
                }}
                className="rounded-lg border border-slate-500 bg-cyber-base/60 px-3 py-2 text-sm text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {otpPrompt && (
        <div className="fixed inset-0 z-[560] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-cyber-accent/45 bg-cyber-base p-5 shadow-cyber">
            <h3 className="font-display text-xl font-semibold text-slate-100">Enter Admin OTP</h3>
            <p className="mt-2 text-sm text-slate-300">
              Request <span className="font-mono text-cyber-accent">{otpPrompt.requestID}</span> for{" "}
              <span className="text-slate-100">{otpPrompt.requestDoc}</span> is waiting for OTP verification.
              Check the bell notification after admin approves.
            </p>
            <input
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              placeholder="Enter 6-digit OTP"
              className="mt-3 w-full rounded-xl border border-cyber-accent/25 bg-cyber-panelSoft/35 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-accent"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleVerifyOtp}
                disabled={loadingAction === `otp-${otpPrompt.requestRef}`}
                className="rounded-lg border border-cyber-safe/40 bg-cyber-safe/10 px-3 py-2 text-sm text-cyber-safe disabled:opacity-60"
              >
                Verify OTP
              </button>
              <button
                onClick={() => {
                  setOtpPrompt(null);
                  setOtpValue("");
                }}
                className="rounded-lg border border-slate-500 bg-cyber-base/60 px-3 py-2 text-sm text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
