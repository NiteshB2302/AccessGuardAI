import { useState } from "react";
import ScanAnimation from "../../animations/ScanAnimation";
import { scanDocument, scanEmail } from "../../services/dashboardService";

function levelTone(level) {
  const normalized = (level || "").toString().toLowerCase();
  if (normalized.includes("high") || normalized.includes("phishing") || normalized.includes("spam")) {
    return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  }
  if (normalized.includes("medium") || normalized.includes("warning") || normalized.includes("suspicious")) {
    return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  }
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

export default function AdminDetectionsPage() {
  const [scanState, setScanState] = useState({ loading: false, type: "", error: "" });
  const [emailContent, setEmailContent] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [results, setResults] = useState({
    document: null,
    email: null
  });

  const handleEmailScan = async () => {
    if (!emailContent.trim()) return;
    setScanState({ loading: true, type: "email", error: "" });
    try {
      const result = await scanEmail(emailContent);
      setResults((prev) => ({ ...prev, email: result }));
      setScanState({ loading: false, type: "email", error: "" });
      setEmailContent("");
    } catch (error) {
      setScanState({
        loading: false,
        type: "email",
        error: error?.response?.data?.message || "Email scan failed."
      });
    }
  };

  const handleDocumentScan = async () => {
    if (!documentFile) return;
    setScanState({ loading: true, type: "document", error: "" });
    try {
      const result = await scanDocument(documentFile);
      setResults((prev) => ({ ...prev, document: result.scan || null }));
      setScanState({ loading: false, type: "document", error: "" });
      setDocumentFile(null);
    } catch (error) {
      setScanState({
        loading: false,
        type: "document",
        error: error?.response?.data?.message || "Document scan failed."
      });
    }
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Malicious Document Detector</h3>
          <p className="mt-1 text-xs text-slate-400">Upload PDF, DOCX, or TXT and detect suspicious language.</p>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
            className="mt-3 block w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 p-2 text-xs"
          />
          <button
            onClick={handleDocumentScan}
            className="mt-3 w-full rounded-xl bg-cyber-accent px-3 py-2 text-sm font-semibold text-cyber-base"
          >
            Scan Document
          </button>
        </div>

        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Spam / Phishing Email Detector</h3>
          <p className="mt-1 text-xs text-slate-400">Paste email content for Safe, Spam, or Phishing prediction.</p>
          <textarea
            value={emailContent}
            onChange={(e) => setEmailContent(e.target.value)}
            placeholder="Paste email content..."
            className="mt-3 h-[120px] w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 p-3 text-xs outline-none"
          />
          <button
            onClick={handleEmailScan}
            className="mt-3 w-full rounded-xl bg-cyber-safe px-3 py-2 text-sm font-semibold text-cyber-base"
          >
            Analyze Email
          </button>
        </div>
      </div>

      <div className="mt-4">
        {scanState.loading && (
          <ScanAnimation
            title={
              scanState.type === "email"
                ? "Analyzing Email..."
                : "Scanning Document..."
            }
          />
        )}

        {!!scanState.error && (
          <div className="glass-panel rounded-2xl border border-cyber-threat/30 bg-cyber-threat/10 p-4 text-sm text-cyber-threat">
            {scanState.error}
          </div>
        )}

        {!scanState.loading && !scanState.error && (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="glass-panel rounded-2xl border border-cyber-accent/25 p-4 text-sm">
              <p className="mb-2 font-semibold text-slate-900">Document Scan Result</p>
              {!results.document && <p className="text-slate-400">No document scan result yet.</p>}
              {results.document && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300">{results.document.fileName}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${levelTone(results.document.riskLevel)}`}>
                      {results.document.riskLevel}
                    </span>
                  </div>
                  <p className="text-slate-200">Risk Score: {results.document.riskScore}</p>
                  <div>
                    <p className="text-xs text-slate-400">Suspicious Keywords</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(results.document.suspiciousKeywords || []).length === 0 && (
                        <span className="text-xs text-slate-500">None</span>
                      )}
                      {(results.document.suspiciousKeywords || []).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-cyber-warn/35 bg-cyber-warn/10 px-2 py-0.5 text-xs text-cyber-warn"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Suspicious Sentences</p>
                    <div className="mt-1 space-y-1">
                      {(results.document.suspiciousSentences || []).length === 0 && (
                        <p className="text-xs text-slate-500">None</p>
                      )}
                      {(results.document.suspiciousSentences || []).map((line, idx) => (
                        <p key={`${line}-${idx}`} className="rounded-lg bg-cyber-base/50 px-2 py-1 text-xs text-slate-200">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-2xl border border-cyber-accent/25 p-4 text-sm">
              <p className="mb-2 font-semibold text-slate-900">Email Scan Result</p>
              {!results.email && <p className="text-slate-400">No email scan result yet.</p>}
              {results.email && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300">Prediction</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${levelTone(results.email.prediction)}`}>
                      {results.email.prediction}
                    </span>
                  </div>
                  <p className="text-slate-200">Confidence Score: {results.email.confidenceScore}</p>
                  <div>
                    <p className="text-xs text-slate-400">Suspicious Keywords</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(results.email.suspiciousKeywords || []).length === 0 && (
                        <span className="text-xs text-slate-500">None</span>
                      )}
                      {(results.email.suspiciousKeywords || []).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-0.5 text-xs text-cyber-threat"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
