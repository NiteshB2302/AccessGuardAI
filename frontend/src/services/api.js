import axios from "axios";

const baseURL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const api = axios.create({
  baseURL
});

function forceSecurityLogout(message) {
  const token = localStorage.getItem("access_guard_token");
  if (!token) return;

  localStorage.removeItem("access_guard_token");
  const notice = message || "Session terminated by security policy. Please sign in again.";
  sessionStorage.setItem("access_guard_logout_notice", notice);
  window.dispatchEvent(
    new CustomEvent("access-guard-force-logout", {
      detail: { message: notice }
    })
  );
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_guard_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response?.data?.sessionTerminated === true) {
      forceSecurityLogout(response?.data?.message);
    }
    return response;
  },
  (error) => {
    const status = Number(error?.response?.status || 0);
    const code = String(error?.response?.data?.code || "");
    const message = error?.response?.data?.message;

    if (
      (status === 401 && code === "SESSION_INVALIDATED") ||
      (status === 403 && code === "ACCOUNT_BLOCKED")
    ) {
      forceSecurityLogout(message);
    }

    return Promise.reject(error);
  }
);

export default api;
