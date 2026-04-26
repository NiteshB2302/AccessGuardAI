import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser } from "./authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_guard_token");
    if (!token) {
      setLoading(false);
      return;
    }

    getCurrentUser()
      .then((profile) => {
        setUser(profile);
      })
      .catch(() => {
        localStorage.removeItem("access_guard_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleForcedLogout = () => {
      localStorage.removeItem("access_guard_token");
      setUser(null);
    };

    window.addEventListener("access-guard-force-logout", handleForcedLogout);
    return () => window.removeEventListener("access-guard-force-logout", handleForcedLogout);
  }, []);

  const login = async (email, password) => {
    const data = await loginUser(email, password);
    localStorage.setItem("access_guard_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem("access_guard_token")) {
        await logoutUser();
      }
    } catch {
      // Ignore logout API failures and clear local session.
    }
    localStorage.removeItem("access_guard_token");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
