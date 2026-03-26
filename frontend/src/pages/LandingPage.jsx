import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ShieldCheck, Siren, Sparkles } from "lucide-react";
import { useAuth } from "../services/AuthContext";

function randomizeMetrics(current) {
  const nextThreat = Math.max(8, Math.min(92, current.threat + (Math.random() * 12 - 6)));
  const nextDefense = Math.max(70, Math.min(99, current.defense + (Math.random() * 6 - 3)));
  const nextLatency = Math.max(40, Math.min(180, current.latency + (Math.random() * 30 - 15)));

  return {
    threat: Number(nextThreat.toFixed(0)),
    defense: Number(nextDefense.toFixed(0)),
    latency: Number(nextLatency.toFixed(0))
  };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState({
    threat: 34,
    defense: 96,
    latency: 86
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => randomizeMetrics(prev));
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const ctaLabel = user ? "Open Workspace" : "Sign In";
  const ctaPath = user ? (user.role === "Admin" ? "/admin/overview" : "/employee/profile") : "/login";

  const threatTone = useMemo(() => (metrics.threat >= 65 ? "text-cyber-threat" : "text-cyber-warn"), [metrics]);

  return (
    <div className="app-shell relative min-h-screen overflow-hidden px-5 py-6 md:px-10 lg:px-16">
      <div className="landing-orb blue left-[-90px] top-[80px] h-56 w-56" />
      <div className="landing-orb green right-[8%] top-[18%] h-52 w-52" />
      <div className="landing-orb red bottom-[8%] left-[38%] h-48 w-48" />

      <header className="relative z-10 mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyber-accent/30 bg-cyber-accent/10 p-2">
            <ShieldCheck className="h-5 w-5 text-cyber-accent" />
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-slate-900">Access Guard AI</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Enterprise Cyber Defense Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-xl border border-cyber-accent/25 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-cyber-accent/10"
          >
            Login
          </Link>
          <button
            onClick={() => navigate(ctaPath)}
            className="rounded-xl bg-cyber-accent px-4 py-2 text-sm font-semibold text-white shadow-panel transition hover:brightness-110"
          >
            {ctaLabel}
          </button>
        </div>
      </header>

      <main className="relative z-10 grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl p-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyber-safe/25 bg-cyber-safe/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyber-safe">
            <Sparkles className="h-3.5 w-3.5" />
            Real-time AI SOC Simulation
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
            Light, modern threat intelligence for
            <span className="title-gradient block">insider risk and misuse defense</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-600 md:text-base">
            Access Guard AI combines role intelligence, behavior analytics, malicious content detection, and
            explainable scoring into one enterprise-grade command center.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-cyber-accent/20 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Threat Load</p>
              <p className={`mt-2 font-display text-2xl ${threatTone}`}>{metrics.threat}%</p>
              <div className="live-bar mt-3 h-1.5 rounded-full bg-cyber-panelSoft/80">
                <motion.div
                  animate={{ width: `${metrics.threat}%` }}
                  transition={{ type: "spring", stiffness: 90, damping: 16 }}
                  className="h-full rounded-full bg-cyber-threat"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-cyber-accent/20 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Defense Readiness</p>
              <p className="mt-2 font-display text-2xl text-cyber-safe">{metrics.defense}%</p>
              <div className="live-bar mt-3 h-1.5 rounded-full bg-cyber-panelSoft/80">
                <motion.div
                  animate={{ width: `${metrics.defense}%` }}
                  transition={{ type: "spring", stiffness: 90, damping: 16 }}
                  className="h-full rounded-full bg-cyber-safe"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-cyber-accent/20 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Detection Latency</p>
              <p className="mt-2 font-display text-2xl text-cyber-accent">{metrics.latency}ms</p>
              <div className="live-bar mt-3 h-1.5 rounded-full bg-cyber-panelSoft/80">
                <motion.div
                  animate={{ width: `${Math.min(100, Math.max(12, 100 - metrics.latency / 2))}%` }}
                  transition={{ type: "spring", stiffness: 90, damping: 16 }}
                  className="h-full rounded-full bg-cyber-accent"
                />
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-3xl p-6"
        >
          <h2 className="mb-4 font-display text-2xl font-semibold text-slate-900">Live Control Pulse</h2>
          <div className="space-y-3">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
              className="rounded-2xl border border-cyber-accent/20 bg-cyber-accent/10 p-4"
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Activity className="h-4 w-4 text-cyber-accent" />
                Insider Behavior Stream
              </p>
              <p className="mt-1 text-sm text-slate-600">Behavioral model monitors access drift in real time.</p>
            </motion.div>

            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, delay: 0.4 }}
              className="rounded-2xl border border-cyber-warn/25 bg-cyber-warn/10 p-4"
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Siren className="h-4 w-4 text-cyber-warn" />
                Role Misuse Guard
              </p>
              <p className="mt-1 text-sm text-slate-600">Policy-aware anomaly fusion with explainable signals.</p>
            </motion.div>

            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, delay: 0.8 }}
              className="rounded-2xl border border-cyber-safe/25 bg-cyber-safe/10 p-4"
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-cyber-safe" />
                Secure Share Gate
              </p>
              <p className="mt-1 text-sm text-slate-600">Outbound data leak checks before message transmission.</p>
            </motion.div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
