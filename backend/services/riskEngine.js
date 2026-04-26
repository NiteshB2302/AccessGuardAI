const User = require("../models/User");
const AccessLog = require("../models/AccessLog");
const UserActivity = require("../models/UserActivity");
const Alert = require("../models/Alert");
const { getSensitivityRisk } = require("./permissionService");

const CRITICAL_RISK_THRESHOLD = Number(process.env.CRITICAL_RISK_THRESHOLD || 0.85);

function clampRisk(value) {
  return Math.max(0, Math.min(1, value));
}

function threatLevel(score) {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Warning";
  return "Safe";
}

function shouldForceLockByRisk(score) {
  return clampRisk(Number(score || 0)) >= CRITICAL_RISK_THRESHOLD;
}

function computeBehaviorRisk(logs = [], activities = [], alerts = []) {
  if (!logs.length && !activities.length && !alerts.length) {
    return 0.1;
  }

  const blockedEvents = logs.filter((entry) => entry.status === "blocked").length;
  const overrideEvents = logs.filter((entry) => entry.status === "override").length;
  const downloads = logs.filter((entry) => entry.action === "download").length;
  const offHoursLogins = activities.filter((entry) => {
    const hour = new Date(entry.timestamp).getHours();
    return entry.actionType === "login" && (hour < 7 || hour > 21);
  }).length;

  const sensitiveActions = activities.filter((entry) =>
    ["Confidential", "Top Secret"].includes(entry.sensitivityLevel)
  ).length;

  const avgAlertRisk =
    alerts.length > 0 ? alerts.reduce((sum, item) => sum + (item.riskScore || 0), 0) / alerts.length : 0;
  const highSeverityAlerts = alerts.filter((item) => item.severity === "high").length;
  const dataExfilAlerts = alerts.filter((item) => item.type === "Data Exfiltration").length;

  const totalLogs = Math.max(logs.length, 1);
  const totalActivities = Math.max(activities.length, 1);
  const totalAlerts = Math.max(alerts.length, 1);
  const loginEvents = Math.max(activities.filter((entry) => entry.actionType === "login").length, 1);

  const blockedRatio = blockedEvents / totalLogs;
  const overrideRatio = overrideEvents / totalLogs;
  const downloadRatio = downloads / totalLogs;
  const sensitiveRatio = sensitiveActions / totalActivities;
  const offHoursRatio = offHoursLogins / loginEvents;
  const highAlertRatio = highSeverityAlerts / totalAlerts;
  const dataExfilRatio = dataExfilAlerts / totalAlerts;

  const risk =
    blockedRatio * 0.18 +
    overrideRatio * 0.16 +
    downloadRatio * 0.05 +
    offHoursRatio * 0.06 +
    sensitiveRatio * 0.08 +
    highAlertRatio * 0.08 +
    avgAlertRisk * 0.17 +
    dataExfilRatio * 0.18;

  // Once alerts are resolved, keep historical behavior visible but below warning threshold.
  // This prevents stale warning badges from persisting after analyst resolution.
  if (alerts.length === 0) {
    return clampRisk(Math.min(risk, 0.34));
  }

  return clampRisk(risk);
}

async function enforceCriticalRiskLock({
  employeeID,
  riskScore,
  reason = "Automatic security lock due to critical risk score.",
  source = "risk-engine",
  metadata = {}
}) {
  const normalizedEmployeeID = String(employeeID || "").trim();
  if (!normalizedEmployeeID) {
    return { locked: false, reason: "INVALID_EMPLOYEE_ID" };
  }

  const user = await User.findOne({ employeeID: normalizedEmployeeID });
  if (!user) {
    return { locked: false, reason: "USER_NOT_FOUND" };
  }

  if (user.role === "Admin") {
    return { locked: false, reason: "ADMIN_EXEMPT" };
  }

  const normalizedRisk = clampRisk(Number(riskScore || 0));
  const alreadyBlocked = user.accountStatus === "Blocked";
  const blockedAt = new Date();

  user.accountStatus = "Blocked";
  user.blockedReason = reason;
  user.blockedAt = blockedAt;
  user.blockedBy = "SYSTEM_AUTO_LOCK";
  user.sessionInvalidatedAt = blockedAt;
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();

  await UserActivity.create({
    employeeID: user.employeeID,
    actionType: "account_block",
    timestamp: blockedAt,
    department: user.department,
    metadata: {
      autoLock: true,
      source,
      riskScore: Number(normalizedRisk.toFixed(2)),
      reason,
      ...metadata
    }
  });

  await Alert.create({
    type: "Behavior Anomaly",
    severity: "high",
    message: `Automatic account lock triggered for ${user.employeeID}. Reason: ${reason}`,
    employeeID: user.employeeID,
    riskScore: Number(normalizedRisk.toFixed(2)),
    metadata: {
      autoLock: true,
      source,
      criticalThreshold: CRITICAL_RISK_THRESHOLD,
      alreadyBlocked,
      ...metadata
    }
  });

  return {
    locked: true,
    alreadyBlocked,
    employeeID: user.employeeID,
    tokenVersion: user.tokenVersion,
    blockedAt,
    blockedReason: reason
  };
}

function isAdminControlActivity(activity = {}) {
  return ["admin_alert", "account_block", "account_unblock"].includes(activity.actionType);
}

function isAdminControlAlert(alert = {}) {
  const metadata = alert.metadata || {};
  const action = String(metadata.action || "").toLowerCase();
  return metadata.manual === true || action === "block" || action === "unblock";
}

function filterRiskSignals(activities = [], alerts = []) {
  return {
    riskActivities: activities.filter((item) => !isAdminControlActivity(item)),
    riskAlerts: alerts.filter((item) => item.status !== "closed" && !isAdminControlAlert(item))
  };
}

function insiderThreatRisk(document, accessAllowed) {
  const base = getSensitivityRisk(document.sensitivityLevel);
  if (!accessAllowed) {
    return clampRisk(base + 0.25);
  }
  return clampRisk(base * 0.45);
}

async function buildEmployeeRiskTable() {
  const users = await User.find().select("employeeID name role department accountStatus");
  const table = [];

  for (const user of users) {
    const [logs, activities, alerts] = await Promise.all([
      AccessLog.find({ employeeID: user.employeeID }).sort({ timestamp: -1 }).limit(200),
      UserActivity.find({ employeeID: user.employeeID }).sort({ timestamp: -1 }).limit(200),
      Alert.find({ employeeID: user.employeeID, status: { $ne: "closed" } }).sort({ createdAt: -1 }).limit(100)
    ]);

    const { riskActivities, riskAlerts } = filterRiskSignals(activities, alerts);
    const score = computeBehaviorRisk(logs, riskActivities, riskAlerts);

    table.push({
      employeeID: user.employeeID,
      name: user.name,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus || "Active",
      riskScore: Number(score.toFixed(2)),
      threatLevel: threatLevel(score)
    });
  }

  table.sort((a, b) => b.riskScore - a.riskScore);
  return table;
}

module.exports = {
  CRITICAL_RISK_THRESHOLD,
  shouldForceLockByRisk,
  threatLevel,
  insiderThreatRisk,
  isAdminControlAlert,
  isAdminControlActivity,
  filterRiskSignals,
  computeBehaviorRisk,
  enforceCriticalRiskLock,
  buildEmployeeRiskTable
};
