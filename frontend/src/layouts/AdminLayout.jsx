import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import AdminSidebar from "../components/AdminSidebar";
import TopNavbar from "../components/TopNavbar";
import { useAuth } from "../services/AuthContext";
import { fetchAlerts } from "../services/dashboardService";

const PAGE_TITLES = {
  "/admin/overview": "System Security Overview",
  "/admin/monitoring": "Threat Monitoring",
  "/admin/analytics": "Threat Analytics",
  "/admin/detections": "AI Detection Modules",
  "/admin/role-misuse": "Role Misuse Model",
  "/admin/employees": "Employee Management"
};

const PAGE_SUBTITLES = {
  "/admin/overview": "Unified security posture and enterprise risk overview.",
  "/admin/monitoring": "Real-time analyst queue for active incidents and controls.",
  "/admin/analytics": "Interactive intelligence views across threats and trends.",
  "/admin/detections": "AI-powered document and email threat detection modules.",
  "/admin/role-misuse": "Behavior policy model for access anomalies and privilege drift.",
  "/admin/employees": "Identity lifecycle, account governance, and workforce controls."
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [alerts, setAlerts] = useState([]);
  const [popupAlert, setPopupAlert] = useState(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const latestAlertId = useRef(null);

  useEffect(() => {
    fetchAlerts().then(setAlerts).catch(() => {});
    const interval = setInterval(() => {
      fetchAlerts().then(setAlerts).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!alerts.length) return;
    const newest = alerts[0];
    if (!latestAlertId.current) {
      latestAlertId.current = newest._id;
      return;
    }
    if (latestAlertId.current !== newest._id) {
      latestAlertId.current = newest._id;
      setPopupAlert(newest);
      setTimeout(() => setPopupAlert(null), 5000);
    }
  }, [alerts]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobileNavOpen]);

  const title = useMemo(() => PAGE_TITLES[location.pathname] || "Access Guard AI Admin", [location.pathname]);
  const subtitle = useMemo(
    () => PAGE_SUBTITLES[location.pathname] || "Security operations workspace.",
    [location.pathname]
  );

  return (
    <div className="app-shell relative min-h-screen md:flex">
      <div className="page-veil" />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none fixed right-[-120px] top-[8vh] z-0 h-72 w-72 rounded-full bg-cyber-accent/20 blur-3xl"
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="pointer-events-none fixed bottom-[4vh] left-[-100px] z-0 h-64 w-64 rounded-full bg-cyber-safe/15 blur-3xl"
      />

      <div className="hidden md:block md:w-[300px]">
        <AdminSidebar />
      </div>

      <main className="relative z-10 flex-1 p-4 md:p-7">
        <div className="mb-3 flex items-center justify-between md:hidden">
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-cyber-accent/30 bg-white/85 px-3 py-2 text-sm text-cyber-accent"
          >
            <Menu className="h-4 w-4" />
            Menu
          </button>
          <span className="rounded-full border border-cyber-accent/20 bg-white/75 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-500">
            Admin Console
          </span>
        </div>

        <TopNavbar user={user} onLogout={logout} notifications={alerts.slice(0, 12)} />
        <div className="mb-5 rounded-2xl border border-cyber-accent/20 bg-gradient-to-r from-white/85 to-cyber-base/80 p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyber-accent">Admin Security Command</p>
              <h1 className="mt-1 font-display text-2xl font-semibold md:text-3xl">
                <span className="title-gradient">{title}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            <div className="surface-shimmer rounded-xl border border-cyber-safe/25 bg-cyber-safe/10 px-3 py-2 text-sm text-slate-600">
              <p className="text-[11px] uppercase tracking-wide text-cyber-safe">Live Alert Watch</p>
              <p className="font-semibold text-slate-900">{alerts.length} unresolved alerts</p>
            </div>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="rounded-3xl border border-cyber-accent/20 bg-white/45 p-2 md:p-3"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {popupAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 30 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -8, x: 20 }}
            className="fixed right-4 top-4 z-[700] max-w-sm rounded-2xl border border-cyber-threat/45 bg-white/95 p-4 shadow-cyber backdrop-blur-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-cyber-threat">
              Security Alert
            </p>
            <p className="mt-1 text-sm text-slate-800">{popupAlert.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[850] bg-slate-900/45 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <motion.aside
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -18, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative h-full w-[86vw] max-w-[320px] border-r border-cyber-accent/25 bg-white/95 shadow-cyber"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => setIsMobileNavOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-lg border border-cyber-accent/30 bg-white/90 p-1.5 text-cyber-accent"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
              <AdminSidebar mobile onNavigate={() => setIsMobileNavOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
