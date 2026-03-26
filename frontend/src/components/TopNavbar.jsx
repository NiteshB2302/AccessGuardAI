import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, LogOut, Search, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";

function normalizeSeverity(raw) {
  const value = String(raw || "").toLowerCase();
  if (value.includes("high") || value.includes("threat")) return "high";
  if (value.includes("warn") || value.includes("medium")) return "warning";
  return "safe";
}

function severityTone(severity) {
  if (severity === "high") return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
  if (severity === "warning") return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
  return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function storageKeyForUser(user) {
  return `access-guard-read-notifications:${user?.employeeID || "unknown"}:${user?.role || "unknown"}`;
}

function normalizeNotifications(items = []) {
  return items
    .map((item, index) => {
      const timestamp = item?.timestamp || item?.createdAt || item?.time || new Date().toISOString();
      const severity = normalizeSeverity(item?.severity || item?.level);
      const id = String(item?.id || item?._id || `${timestamp}-${index}`);
      return {
        id,
        title: item?.category || item?.type || "Security Event",
        source: item?.source || "Access Guard AI",
        message: item?.message || "New security event detected.",
        severity,
        status: item?.status || "open",
        timestamp
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export default function TopNavbar({ user, onLogout, notifications = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState(new Set());
  const bellRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0, width: 360 });
  const [portalRoot, setPortalRoot] = useState(null);

  const parsedNotifications = useMemo(() => normalizeNotifications(notifications), [notifications]);
  const key = useMemo(() => storageKeyForUser(user), [user]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setReadIds(new Set(parsed.map((item) => String(item))));
      } else {
        setReadIds(new Set());
      }
    } catch {
      setReadIds(new Set());
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(Array.from(readIds)));
    } catch {}
  }, [key, readIds]);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!isOpen) return;
      const clickedBell = bellRef.current && bellRef.current.contains(event.target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!clickedBell && !clickedDropdown) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;

      const width = Math.min(360, Math.max(280, window.innerWidth - 16));
      const top = rect.bottom + 8;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));

      setDropdownStyle({ top, left, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const unreadCount = useMemo(
    () => parsedNotifications.filter((item) => !readIds.has(item.id)).length,
    [parsedNotifications, readIds]
  );

  const markAsRead = (id) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(String(id));
      return next;
    });
  };

  const markAllAsRead = () => {
    setReadIds(new Set(parsedNotifications.map((item) => item.id)));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel relative z-[260] mb-6 flex flex-col gap-3 overflow-visible rounded-2xl border border-cyber-accent/25 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5"
    >
      <div className="relative w-full max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-accent/80" />
        <input
          type="text"
          placeholder="Search employee, document, alert..."
          className="w-full rounded-xl border border-cyber-accent/20 bg-white/85 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-cyber-accent focus:shadow-panel"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative z-[320]" ref={bellRef}>
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            className="relative rounded-xl border border-cyber-accent/25 bg-white/85 p-2.5 transition hover:bg-cyber-accent/10"
            title="Notifications"
          >
            <Bell className="h-4 w-4 text-cyber-accent" />
            {unreadCount > 0 && (
              <>
                <span className="absolute -right-1.5 -top-1.5 rounded-full border border-cyber-threat/40 bg-cyber-threat px-1 text-[10px] font-semibold leading-4 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
                <span className="absolute -right-1.5 -top-1.5 h-5 min-w-[20px] rounded-full border border-cyber-threat/20 bg-cyber-threat/50 status-pulse" />
              </>
            )}
          </button>

          {isOpen &&
            portalRoot &&
            createPortal(
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width }}
                className="fixed z-[1400] max-w-[92vw] rounded-2xl border border-cyber-accent/30 bg-white/95 p-3 shadow-cyber backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-cyber-accent" />
                    <p className="text-sm font-semibold text-slate-800">Notifications</p>
                  </div>
                  <button
                    onClick={markAllAsRead}
                    className="rounded-md border border-cyber-accent/35 bg-cyber-accent/10 px-2 py-1 text-[11px] text-cyber-accent"
                  >
                    Mark all read
                  </button>
                </div>

                <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
                  <p>Security event inbox</p>
                  <span className="glass-pill px-2 py-0.5 font-medium text-cyber-accent">
                    {unreadCount} unread
                  </span>
                </div>

                <div className="cyber-scroll max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {parsedNotifications.length === 0 && (
                    <p className="rounded-xl border border-cyber-accent/15 bg-cyber-panelSoft/20 px-3 py-3 text-xs text-slate-500">
                      No notifications right now.
                    </p>
                  )}

                  {parsedNotifications.map((item) => {
                    const isRead = readIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => markAsRead(item.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          isRead
                            ? "border-cyber-accent/10 bg-cyber-panelSoft/20 opacity-80"
                            : "border-cyber-accent/25 bg-cyber-accent/10 shadow-[0_8px_20px_rgba(37,99,235,0.08)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-800">{item.message}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {item.source} | {formatTime(item.timestamp)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${severityTone(item.severity)}`}>
                              {item.severity}
                            </span>
                            {!isRead && <span className="h-2 w-2 rounded-full bg-cyber-accent" />}
                            {isRead && <Check className="h-3.5 w-3.5 text-cyber-safe" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>,
              portalRoot
            )}
        </div>

        <div className="rounded-xl border border-cyber-accent/25 bg-white/85 px-3 py-2 shadow-[0_8px_20px_rgba(37,99,235,0.08)]">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Signed In As</p>
          <p className="text-sm font-semibold text-slate-900">{user?.name || "User"}</p>
          <p className="text-[11px] text-cyber-accent/90">{user?.role || "User"}</p>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-xl border border-cyber-threat/40 bg-cyber-threat/10 px-3 py-2 text-sm text-cyber-threat transition hover:bg-cyber-threat/20 hover:shadow-panel"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </motion.div>
  );
}
