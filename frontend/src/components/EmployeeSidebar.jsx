import { motion } from "framer-motion";
import { BookOpen, Bell, Activity, UserCircle2, ShieldCheck, Send } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/employee/profile", label: "Security Center", icon: UserCircle2 },
  { to: "/employee/documents", label: "Document Portal", icon: BookOpen },
  { to: "/employee/secure-share", label: "Secure Share Guard", icon: Send },
  { to: "/employee/activity", label: "Activity History", icon: Activity },
  { to: "/employee/notifications", label: "Security Notifications", icon: Bell }
];

function navClass({ isActive }) {
  return [
    "group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
    isActive
      ? "nav-active-glow border-cyber-safe/55 bg-cyber-safe/15 text-slate-900 shadow-panel"
      : "border-cyber-accent/15 bg-cyber-panelSoft/25 text-slate-600 hover:border-cyber-safe/30 hover:bg-cyber-safe/10 hover:text-slate-800"
  ].join(" ");
}

export default function EmployeeSidebar() {
  return (
    <aside className="glass-panel cyber-scroll sticky top-0 h-screen w-full overflow-y-auto rounded-r-3xl p-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-center gap-3"
      >
        <div className="animate-float-y rounded-xl border border-cyber-safe/35 bg-cyber-safe/20 p-2">
          <ShieldCheck className="h-6 w-6 text-cyber-safe" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-slate-900">ACCESS GUARD AI</p>
          <p className="text-xs text-cyber-safe/80">Employee Protection Desk</p>
        </div>
      </motion.div>

      <div className="mb-4 rounded-xl border border-cyber-safe/25 bg-cyber-base/45 px-3 py-2 text-xs text-slate-600">
        <p className="uppercase tracking-wider text-slate-500">Workspace</p>
        <p className="mt-1 text-cyber-safe">Personal Security Hub</p>
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
              <NavLink to={item.to} className={navClass}>
                <span className="rounded-lg border border-cyber-safe/25 bg-white/75 p-1.5">
                  <Icon className="h-3.5 w-3.5 text-cyber-safe transition group-hover:scale-110" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </motion.div>
          );
        })}
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="surface-shimmer mt-6 rounded-xl border border-cyber-accent/35 bg-cyber-accent/10 p-3 text-xs"
      >
        <p className="font-semibold uppercase tracking-wide text-cyber-accent">Secure Share Guard</p>
        <p className="mt-1 text-slate-600">Scan outgoing messages before external transmission.</p>
      </motion.div>
    </aside>
  );
}
