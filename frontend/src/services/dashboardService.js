import api from "./api";

export async function fetchOverview() {
  const { data } = await api.get("/threats/overview");
  return data;
}

export async function fetchAnalytics() {
  const { data } = await api.get("/threats/analytics");
  return data;
}

export async function fetchTimelineAnalytics() {
  const { data } = await api.get("/threats/timeline-analytics");
  return data;
}

export async function fetchLiveFeed() {
  const { data } = await api.get("/threats/live-feed");
  return data.feed;
}

export async function fetchAlerts() {
  const { data } = await api.get("/threats/alerts");
  return data.alerts;
}

export async function fetchAlertBuckets(includeClosed = false) {
  const { data } = await api.get("/threats/alerts", {
    params: { includeClosed }
  });
  return data;
}

export async function fetchFilteredAlerts(params = {}) {
  const { data } = await api.get("/threats/alerts-search", { params });
  return data.alerts;
}

export async function resolveAlertsBulk(scope = "active", employeeID = null) {
  const payload = { scope };
  if (employeeID) payload.employeeID = employeeID;
  const { data } = await api.post("/threats/alerts/resolve-all", payload);
  return data;
}

export async function fetchRiskTable() {
  const { data } = await api.get("/threats/risk-table");
  return data.table;
}

export async function fetchDetectionHistory(limit = 120) {
  const { data } = await api.get("/threats/detection-history", {
    params: { limit }
  });
  return data;
}

export async function scanEmail(content) {
  const { data } = await api.post("/threats/email-scan", { content });
  return data;
}

export async function scanRoleMisuse(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/threats/role-misuse", form);
  return data;
}

export async function scanRoleMisuseFromCurrentData(limit = 600) {
  const { data } = await api.post("/threats/role-misuse/current-data", { limit });
  return data;
}

export async function scanDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/documents/scan", form);
  return data;
}

export async function fetchDocuments() {
  const { data } = await api.get("/documents");
  return data.documents;
}

export async function accessDocument(documentId, action, override = false) {
  const { data } = await api.post(`/documents/${documentId}/access`, { action, override });
  return data;
}

export async function fetchActivity() {
  const { data } = await api.get("/activity/me");
  return data;
}

export async function fetchEmployees() {
  const { data } = await api.get("/employees");
  return data.employees;
}

export async function createEmployee(payload) {
  const { data } = await api.post("/employees", payload);
  return data;
}

export async function deleteEmployeePermanently(employeeID, pin, confirm = true) {
  const { data } = await api.delete(`/employees/${employeeID}`, {
    data: { pin, confirm }
  });
  return data;
}

export async function sendEmployeeAlert(employeeID, payload) {
  const { data } = await api.post(`/employees/${employeeID}/send-alert`, payload);
  return data;
}

export async function blockEmployeeAccount(employeeID, reason) {
  const { data } = await api.post(`/employees/${employeeID}/block`, { reason });
  return data;
}

export async function unblockEmployeeAccount(employeeID) {
  const { data } = await api.post(`/employees/${employeeID}/unblock`);
  return data;
}

export async function fetchMyNotifications() {
  const { data } = await api.get("/employees/me/notifications");
  return data;
}

export async function fetchMySecuritySummary() {
  const { data } = await api.get("/employees/me/security-summary");
  return data;
}

export async function analyzeSecureShare(payload) {
  const { data } = await api.post("/employees/me/secure-share/analyze", payload);
  return data;
}

export async function decideSecureShare(incidentId, decision) {
  const { data } = await api.post(`/employees/me/secure-share/${incidentId}/decision`, { decision });
  return data;
}

export async function fetchMySecureShareIncidents() {
  const { data } = await api.get("/employees/me/secure-share/incidents");
  return data.incidents;
}

export async function fetchExfiltrationIncidents(params = {}) {
  const { data } = await api.get("/threats/exfil-incidents", { params });
  return data.incidents;
}

export async function updateExfiltrationIncidentStatus(incidentId, status, note = "") {
  const { data } = await api.patch(`/threats/exfil-incidents/${incidentId}`, { status, note });
  return data;
}
