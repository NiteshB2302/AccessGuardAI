import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ShieldAlert, Sparkles } from "lucide-react";
import { useAuth } from "../services/AuthContext";
import { bootstrapAdmin } from "../services/authService";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "Admin" ? "/admin/overview" : "/employee/profile", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapMessage("");
    try {
      await bootstrapAdmin();
      setBootstrapMessage("Bootstrap complete. Admin account is initialized.");
    } catch (err) {
      setBootstrapMessage(err?.response?.data?.message || "Bootstrap unavailable.");
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="page-veil" />

      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1.08fr,1fr]">
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel hidden rounded-3xl border border-cyber-accent/30 p-8 shadow-cyber lg:block"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-cyber-accent">Access Guard AI</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-slate-900">
            Intelligent Cyber Defense
            <span className="title-gradient block">For Enterprise Workflows</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm text-slate-600">
            Detect insider threats, role misuse, malicious documents, phishing attempts, and data exfiltration with
            explainable AI signals and real-time security operations.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-cyber-accent/20 bg-cyber-base/55 p-3">
              <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                <Shield className="h-4 w-4 text-cyber-accent" />
                Threat Analytics and Incident Response Dashboard
              </p>
            </div>
            <div className="rounded-xl border border-cyber-safe/25 bg-cyber-safe/10 p-3">
              <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                <Sparkles className="h-4 w-4 text-cyber-safe" />
                AI-assisted Risk Scoring and Continuous Monitoring
              </p>
            </div>
            <div className="rounded-xl border border-cyber-threat/25 bg-cyber-threat/10 p-3">
              <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                <ShieldAlert className="h-4 w-4 text-cyber-threat" />
                Secure Share Guard for Data Exfiltration Prevention
              </p>
            </div>
          </div>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel w-full rounded-3xl border border-cyber-accent/30 p-7 shadow-cyber"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl border border-cyber-accent/30 bg-cyber-accent/15 p-2">
              <Shield className="h-6 w-6 text-cyber-accent" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-slate-900">Security Login</h2>
              <p className="text-sm text-slate-600">Authenticate to your control workspace</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-cyber-accent/25 bg-white/85 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyber-accent focus:shadow-panel"
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-cyber-accent/25 bg-white/85 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyber-accent focus:shadow-panel"
                placeholder="Enter your password"
              />
            </div>

            {error && <p className="rounded-lg bg-cyber-threat/20 px-3 py-2 text-sm text-cyber-threat">{error}</p>}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-cyber-accent px-4 py-2.5 text-sm font-semibold text-cyber-base transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <button
            onClick={handleBootstrap}
            className="mt-4 w-full rounded-xl border border-cyber-accent/30 bg-cyber-base/50 px-4 py-2 text-xs text-cyber-accent transition hover:bg-cyber-accent/10"
          >
            Bootstrap Admin (first run)
          </button>
          {bootstrapMessage && <p className="mt-2 text-xs text-slate-600">{bootstrapMessage}</p>}
        </motion.div>
      </div>
    </div>
  );
}
