const User = require("../models/User");
const Alert = require("../models/Alert");
const AccessLog = require("../models/AccessLog");
const ExfiltrationIncident = require("../models/ExfiltrationIncident");
const UserActivity = require("../models/UserActivity");
const DetectionResult = require("../models/DetectionResult");
const { createAlert } = require("../services/alertService");
const { computeBehaviorRisk, filterRiskSignals, threatLevel } = require("../services/riskEngine");
const { RESOURCE_PERMISSIONS } = require("../services/permissionService");

const ALERT_TYPES = [
  "Insider Threat",
  "Role Misuse",
  "Malicious Document",
  "Phishing Email",
  "Behavior Anomaly",
  "Data Exfiltration"
];

const ALERT_SEVERITIES = ["low", "warning", "high"];
const EMPLOYEE_DELETE_PIN = process.env.EMPLOYEE_DELETE_PIN || "12345678";

async function createEmployee(req, res) {
  const { name, email, password, role, department } = req.body;

  if (!name || !email || !password || !department) {
    return res.status(400).json({ message: "name, email, password and department are required." });
  }

  const normalizedRole = role || "Employee";

  if (req.user.role === "HR Manager" && normalizedRole === "Admin") {
    return res.status(403).json({ message: "HR Manager cannot create Admin accounts." });
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({ message: "Email already registered." });
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: normalizedRole,
    department
  });

  return res.status(201).json({
    message: "Employee created successfully.",
    employee: {
      employeeID: user.employeeID,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt
    }
  });
}

async function listEmployees(req, res) {
  const employees = await User.find().select("-password").sort({ createdAt: -1 });
  return res.json({ employees });
}

function getRolePermissions(req, res) {
  return res.json({
    permissions: RESOURCE_PERMISSIONS,
    examples: [
      { role: "Finance Analyst", resource: "Financial Reports" },
      { role: "HR Manager", resource: "Employee Records" },
      { role: "Developer", resource: "Technical Documentation" },
      { role: "Intern", resource: "Training Documents" }
    ]
  });
}

async function blockEmployee(req, res) {
  const { employeeID } = req.params;
  const { reason = "Manual security block due to elevated threat." } = req.body;

  const employee = await User.findOne({ employeeID });
  if (!employee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  if (employee.role === "Admin") {
    return res.status(403).json({ message: "Admin accounts cannot be blocked via this action." });
  }

  employee.accountStatus = "Blocked";
  employee.blockedReason = reason;
  employee.blockedAt = new Date();
  employee.blockedBy = req.user.employeeID;
  await employee.save();

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "account_block",
    timestamp: new Date(),
    department: req.user.department,
    metadata: {
      targetEmployeeID: employee.employeeID,
      reason
    }
  });

  await createAlert({
    type: "Behavior Anomaly",
    severity: "high",
    employeeID: employee.employeeID,
    riskScore: 0.95,
    message: `Admin blocked ${employee.employeeID}. Reason: ${reason}`,
    metadata: {
      actionBy: req.user.employeeID,
      action: "block",
      manual: true
    }
  });

  return res.json({
    message: `${employee.employeeID} has been blocked.`,
    employee: {
      employeeID: employee.employeeID,
      name: employee.name,
      accountStatus: employee.accountStatus,
      blockedReason: employee.blockedReason,
      blockedAt: employee.blockedAt,
      blockedBy: employee.blockedBy
    }
  });
}

async function unblockEmployee(req, res) {
  const { employeeID } = req.params;

  const employee = await User.findOne({ employeeID });
  if (!employee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  employee.accountStatus = "Active";
  employee.blockedReason = null;
  employee.blockedAt = null;
  employee.blockedBy = null;
  await employee.save();

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "account_unblock",
    timestamp: new Date(),
    department: req.user.department,
    metadata: {
      targetEmployeeID: employee.employeeID
    }
  });

  await createAlert({
    type: "Behavior Anomaly",
    severity: "low",
    employeeID: employee.employeeID,
    riskScore: 0.25,
    message: `Admin restored account access for ${employee.employeeID}.`,
    metadata: {
      actionBy: req.user.employeeID,
      action: "unblock",
      manual: true
    }
  });

  return res.json({
    message: `${employee.employeeID} has been unblocked.`,
    employee: {
      employeeID: employee.employeeID,
      name: employee.name,
      accountStatus: employee.accountStatus
    }
  });
}

async function sendAlertToEmployee(req, res) {
  const { employeeID } = req.params;
  const { message, severity = "warning", type = "Behavior Anomaly", riskScore = 0.75 } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Alert message is required." });
  }

  const employee = await User.findOne({ employeeID });
  if (!employee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  const alertType = ALERT_TYPES.includes(type) ? type : "Behavior Anomaly";
  const alertSeverity = ALERT_SEVERITIES.includes(severity) ? severity : "warning";
  const clampedRisk = Math.max(0, Math.min(1, Number(riskScore || 0.75)));

  const alert = await createAlert({
    type: alertType,
    severity: alertSeverity,
    employeeID: employee.employeeID,
    riskScore: clampedRisk,
    message: message.trim(),
    metadata: {
      actionBy: req.user.employeeID,
      manual: true
    }
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "admin_alert",
    timestamp: new Date(),
    department: req.user.department,
    metadata: {
      targetEmployeeID: employee.employeeID,
      severity: alertSeverity
    }
  });

  return res.status(201).json({
    message: `Alert sent to ${employee.employeeID}.`,
    alert
  });
}

async function deleteEmployee(req, res) {
  const { employeeID } = req.params;
  const { pin, confirm } = req.body || {};

  if (confirm !== true) {
    return res.status(400).json({ message: "Deletion confirmation is required." });
  }

  if (String(pin || "").trim() !== EMPLOYEE_DELETE_PIN) {
    return res.status(403).json({ message: "Invalid security PIN." });
  }

  const employee = await User.findOne({ employeeID });
  if (!employee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  if (employee.role === "Admin") {
    return res.status(403).json({ message: "Admin accounts cannot be deleted." });
  }

  if (req.user.employeeID === employeeID) {
    return res.status(403).json({ message: "You cannot delete your own account." });
  }

  const detectionDeleteFilter = {
    $or: [
      { createdBy: employeeID },
      { "details.employeeID": employeeID },
      { "details.EmployeeID": employeeID },
      { "details.targetEmployeeID": employeeID },
      { "details.rows.EmployeeID": employeeID },
      { "details.metadata.targetEmployeeID": employeeID }
    ]
  };

  const [accessLogs, alerts, activities, exfiltration, detections] = await Promise.all([
    AccessLog.deleteMany({ employeeID }),
    Alert.deleteMany({ employeeID }),
    UserActivity.deleteMany({ employeeID }),
    ExfiltrationIncident.deleteMany({ employeeID }),
    DetectionResult.deleteMany(detectionDeleteFilter)
  ]);

  await User.deleteOne({ employeeID });

  return res.json({
    message: `${employeeID} deleted permanently with related security data.`,
    deleted: {
      accessLogs: accessLogs.deletedCount,
      alerts: alerts.deletedCount,
      userActivities: activities.deletedCount,
      exfiltrationIncidents: exfiltration.deletedCount,
      detectionResults: detections.deletedCount,
      user: 1
    }
  });
}

async function getMyNotifications(req, res) {
  const [alerts, blockedLogs] = await Promise.all([
    Alert.find({ employeeID: req.user.employeeID }).sort({ createdAt: -1 }).limit(100),
    AccessLog.find({ employeeID: req.user.employeeID, status: "blocked" }).sort({ timestamp: -1 }).limit(100)
  ]);

  const alertNotifications = alerts.map((item) => ({
    id: item._id,
    source: "Admin Security Center",
    category: item.type,
    severity: item.severity,
    message: item.message,
    timestamp: item.createdAt,
    status: item.status
  }));

  const accessNotifications = blockedLogs.map((item) => ({
    id: item._id,
    source: "Access Control Engine",
    category: "Access Violation",
    severity: "warning",
    message: `Blocked ${item.action} request for ${item.documentName}.`,
    timestamp: item.timestamp,
    status: "closed"
  }));

  const notifications = [...alertNotifications, ...accessNotifications].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return res.json({
    accountStatus: req.user.accountStatus,
    blockedReason: req.user.blockedReason,
    notifications
  });
}

async function getMySecuritySummary(req, res) {
  const [logs, activities, alerts, exfilIncidents] = await Promise.all([
    AccessLog.find({ employeeID: req.user.employeeID }).sort({ timestamp: -1 }).limit(250),
    UserActivity.find({ employeeID: req.user.employeeID }).sort({ timestamp: -1 }).limit(250),
    Alert.find({ employeeID: req.user.employeeID }).sort({ createdAt: -1 }).limit(100),
    ExfiltrationIncident.find({ employeeID: req.user.employeeID }).sort({ createdAt: -1 }).limit(80)
  ]);

  const { riskActivities, riskAlerts } = filterRiskSignals(activities, alerts);
  const risk = computeBehaviorRisk(logs, riskActivities, riskAlerts);
  const riskScore = Number(risk.toFixed(2));
  const userThreatLevel = threatLevel(risk);
  const securityScore = Math.max(0, Math.min(100, 100 - Math.round(riskScore * 100)));
  const blockedAttempts = logs.filter((item) => item.status === "blocked").length;
  const downloads = logs.filter((item) => item.action === "download").length;
  const views = logs.filter((item) => item.action === "view").length;
  const sensitiveAccesses = activities.filter((item) =>
    ["Confidential", "Top Secret"].includes(item.sensitivityLevel)
  ).length;
  const lastLogin = activities.find((item) => item.actionType === "login")?.timestamp || null;
  const highRiskExfil = exfilIncidents.filter((item) => item.riskScore >= 0.7).length;

  const recommendations = [];
  if (blockedAttempts > 0) {
    recommendations.push("Review role boundaries before opening restricted documents.");
  }
  if (riskScore >= 0.7) {
    recommendations.push("Contact security team for account behavior review.");
  } else if (riskScore >= 0.4) {
    recommendations.push("Enable cautious mode and reduce cross-department document access.");
  } else {
    recommendations.push("Great job maintaining secure behavior. Keep following policy.");
  }
  if (!recommendations.length) {
    recommendations.push("Keep your security awareness training up to date.");
  }

  const recentDocuments = [...new Set(logs.map((item) => item.documentName))].slice(0, 6);

  return res.json({
    employeeID: req.user.employeeID,
    accountStatus: req.user.accountStatus,
    riskScore,
    threatLevel: userThreatLevel,
    securityScore,
    stats: {
      totalAccesses: logs.length,
      blockedAttempts,
      downloads,
      views,
      sensitiveAccesses,
      secureShareIncidents: exfilIncidents.length,
      highRiskSecureShare: highRiskExfil
    },
    lastLogin,
    recommendations,
    recentDocuments,
    recentAlerts: alerts.slice(0, 6).map((item) => ({
      id: item._id,
      type: item.type,
      severity: item.severity,
      message: item.message,
      createdAt: item.createdAt
    }))
  });
}

module.exports = {
  createEmployee,
  listEmployees,
  getRolePermissions,
  blockEmployee,
  unblockEmployee,
  deleteEmployee,
  sendAlertToEmployee,
  getMyNotifications,
  getMySecuritySummary
};
