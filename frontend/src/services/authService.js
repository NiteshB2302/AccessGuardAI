import api from "./api";

export async function loginUser(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function bootstrapAdmin(payload = {}) {
  const { data } = await api.post("/auth/bootstrap-admin", payload);
  return data;
}

export async function getCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data.user;
}

