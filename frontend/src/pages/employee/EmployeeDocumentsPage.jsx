import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileLock2, Download, Eye, Search } from "lucide-react";
import { accessDocument, fetchDocuments } from "../../services/dashboardService";

const LEVELS = ["All", "Public", "Internal", "Confidential", "Top Secret"];

function badgeTone(level) {
  if (level === "Top Secret") return "bg-cyber-threat/20 text-cyber-threat border-cyber-threat/40";
  if (level === "Confidential") return "bg-cyber-warn/20 text-cyber-warn border-cyber-warn/40";
  if (level === "Internal") return "bg-cyber-accent/20 text-cyber-accent border-cyber-accent/40";
  return "bg-cyber-safe/20 text-cyber-safe border-cyber-safe/40";
}

export default function EmployeeDocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("All");
  const [overridePrompt, setOverridePrompt] = useState(null);

  const loadData = async () => {
    const docs = await fetchDocuments();
    setDocuments(docs);
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

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

  const handleDocumentAction = async (documentId, action, override = false) => {
    setStatusMessage("");
    try {
      const data = await accessDocument(documentId, action, override);
      setStatusMessage(
        `${action.toUpperCase()} success: ${data.document.name}${data.overrideUsed ? " (override used, monitored)" : ""}`
      );
      setOverridePrompt(null);
      loadData().catch(() => {});
    } catch (error) {
      const payload = error?.response?.data;
      if (payload?.requiresOverride) {
        setOverridePrompt({
          document: payload.document,
          message: payload.message,
          attemptedAction: payload.attemptedAction || action
        });
      } else {
        const message = payload?.message || "Document access blocked.";
        setStatusMessage(message);
      }
      loadData().catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyber-accent/25 bg-cyber-base/55 p-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">Document Portal</h2>
        <p className="mt-1 text-sm text-slate-400">
          Access department documents with policy-aware monitoring and live risk validation.
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

      {statusMessage && (
        <p className="rounded-lg border border-cyber-accent/30 bg-cyber-accent/10 px-3 py-2 text-sm text-cyber-accent">
          {statusMessage}
        </p>
      )}

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
                <span
                  className={`max-w-full rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${badgeTone(document.sensitivityLevel)}`}
                >
                  {document.sensitivityLevel}
                </span>
                <span
                  className={`max-w-full rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${
                    document.accessAllowed
                      ? "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe"
                      : "border-cyber-warn/45 bg-cyber-warn/10 text-cyber-warn"
                  }`}
                >
                  {document.accessAllowed ? "Allowed" : "Restricted"}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDocumentAction(document.documentID, "view")}
                className="inline-flex items-center gap-1 rounded-lg border border-cyber-accent/30 bg-cyber-accent/10 px-3 py-1.5 text-xs text-cyber-accent"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
              <button
                onClick={() => handleDocumentAction(document.documentID, "download")}
                className="inline-flex items-center gap-1 rounded-lg border border-cyber-safe/30 bg-cyber-safe/10 px-3 py-1.5 text-xs text-cyber-safe"
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

      {overridePrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-cyber-warn/45 bg-cyber-base p-5 shadow-cyber">
            <h3 className="font-display text-xl font-semibold text-cyber-warn">Security Warning</h3>
            <p className="mt-2 text-sm text-slate-200">
              {overridePrompt.message} This action will be logged as high risk and visible to admins.
            </p>
            <div className="mt-3 rounded-xl border border-cyber-accent/20 bg-cyber-panelSoft/35 p-3 text-sm text-slate-200">
              <p>Document: {overridePrompt.document?.name}</p>
              <p>Department: {overridePrompt.document?.department}</p>
              <p>Sensitivity: {overridePrompt.document?.sensitivityLevel}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleDocumentAction(overridePrompt.document.documentID, "view", true)}
                className="rounded-lg border border-cyber-accent/40 bg-cyber-accent/15 px-3 py-2 text-sm text-cyber-accent"
              >
                Open Anyway
              </button>
              <button
                onClick={() => handleDocumentAction(overridePrompt.document.documentID, "download", true)}
                className="rounded-lg border border-cyber-safe/40 bg-cyber-safe/10 px-3 py-2 text-sm text-cyber-safe"
              >
                Download Anyway
              </button>
              <button
                onClick={() => setOverridePrompt(null)}
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
