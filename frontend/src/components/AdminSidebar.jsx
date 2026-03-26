import { motion } from "framer-motion";
import { Activity, AlertTriangle, BarChart3, FileSearch, ShieldAlert, Users } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/admin/overview", label: "Dashboard Overview", icon: Activity },
  { to: "/admin/monitoring", label: "Threat Monitoring", icon: ShieldAlert },
  { to: "/admin/analytics", label: "Threat Analytics", icon: BarChart3 },
  { to: "/admin/detections", label: "AI Detection Modules", icon: FileSearch },
  { to: "/admin/role-misuse", label: "Role Misuse Model", icon: AlertTriangle },
  { to: "/admin/employees", label: "Employee Management", icon: Users }
];

function navClass({ isActive }) {
  return [
    "group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
    isActive
      ? "nav-active-glow border-cyber-accent/55 bg-cyber-accent/15 text-slate-900 shadow-panel"
      : "border-cyber-accent/15 bg-cyber-panelSoft/25 text-slate-600 hover:border-cyber-accent/30 hover:bg-cyber-accent/10 hover:text-slate-800"
  ].join(" ");
}

export default function AdminSidebar({ mobile = false, onNavigate }) {
  const shellClass = mobile
    ? "glass-panel cyber-scroll h-full w-full overflow-y-auto rounded-none p-5"
    : "glass-panel cyber-scroll sticky top-0 h-screen w-full overflow-y-auto rounded-r-3xl p-6";

  return (
    <aside className={shellClass}>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-center gap-3"
      >
        <div className="animate-float-y rounded-xl border border-cyber-accent/35 bg-cyber-accent/20 p-2">
          <Activity className="h-6 w-6 text-cyber-accent" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-slate-900">ACCESS GUARD AI</p>
          <p className="text-xs text-cyber-accent/80">Admin Security Command</p>
        </div>
      </motion.div>

      <div className="mb-4 rounded-xl border border-cyber-accent/20 bg-cyber-base/45 px-3 py-2 text-xs text-slate-600">
        <p className="uppercase tracking-wider text-slate-500">Workspace</p>
        <p className="mt-1 text-cyber-accent">SOC Control Panel</p>
      </div>

      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Navigation</p>
      <nav className="space-y-2">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.to}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <NavLink to={item.to} className={navClass} onClick={onNavigate}>
                <span className="rounded-lg border border-cyber-accent/20 bg-white/75 p-1.5">
                  <Icon className="h-3.5 w-3.5 text-cyber-accent transition group-hover:scale-110" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </motion.div>
          );
        })}
      </nav>
    </aside>
  );
}
