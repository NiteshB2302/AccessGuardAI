import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import EmployeeSidebar from "../components/EmployeeSidebar";
import TopNavbar from "../components/TopNavbar";
import { useAuth } from "../services/AuthContext";
import { fetchMyNotifications } from "../services/dashboardService";

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMyNotifications();
        const items = (data.notifications || []).slice(0, 8).map((entry) => ({
          id: entry.id,
          message: entry.message,
          severity: entry.severity,
          timestamp: entry.timestamp,
          source: entry.source,
          category: entry.category,
          status: entry.status
        }));
        setNotifications(items);
      } catch (error) {
        setNotifications([]);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-shell relative min-h-screen md:flex">
      <div className="page-veil" />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none fixed left-[-120px] top-[12vh] z-0 h-72 w-72 rounded-full bg-cyber-safe/20 blur-3xl"
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12 }}
        className="pointer-events-none fixed bottom-[8vh] right-[-90px] z-0 h-64 w-64 rounded-full bg-cyber-accent/20 blur-3xl"
      />

      <div className="hidden md:block md:w-[300px]">
        <EmployeeSidebar />
      </div>

      <main className="relative z-10 flex-1 p-4 md:p-7">
        <TopNavbar user={user} onLogout={logout} notifications={notifications} />
        <div className="mb-5 rounded-2xl border border-cyber-accent/20 bg-gradient-to-r from-white/85 to-cyber-base/80 p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyber-safe">Employee Security Desk</p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900 md:text-3xl">
                Personal Protection Workspace
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Policy-aware access, secure sharing intelligence, and guided risk feedback.
              </p>
            </div>
            <div className="surface-shimmer rounded-xl border border-cyber-accent/25 bg-cyber-accent/10 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-cyber-accent">Security Notifications</p>
              <p className="font-semibold text-slate-900">{notifications.length} recent events</p>
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
    </div>
  );
}
