const xlsx = require("xlsx");
const crypto = require("crypto");
const Alert = require("../models/Alert");
const AccessLog = require("../models/AccessLog");
const DetectionResult = require("../models/DetectionResult");
const ExfiltrationIncident = require("../models/ExfiltrationIncident");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const { buildEmployeeRiskTable } = require("../services/riskEngine");
const { detectRoleMisuse, detectSpamEmail } = require("../services/mlService");
const { createAlert } = require("../services/alertService");

function classifyThreatLevel(score) {
  if (score >= 0.7) return "Red";
  if (score >= 0.4) return "Yellow";
  return "Green";
}

function normalizeRoleMisuseRecord(raw) {
  const key = Object.keys(raw).reduce((acc, k) => {
    acc[k.toLowerCase()] = raw[k];
    return acc;
  }, {});

  return {
    EmployeeID: String(key.employeeid || key.employee_id || "").trim(),
    Role: String(key.role || "").trim(),
    AccessedResource: String(key.accessedresource || key.resource || "").trim(),
    Timestamp: key.timestamp ? String(key.timestamp) : new Date().toISOString()
  };
}

const RESOURCE_DOMAIN_KEYWORDS = {
  Finance: ["finance", "financial", "budget", "invoice", "audit", "ledger", "forecast", "report"],
  HR: ["hr", "employee", "salary", "payroll", "recruit", "benefit", "people ops"],
  Engineering: ["engineering", "technical", "architecture", "code", "source", "repository", "api", "system"],
  Product: ["product", "roadmap", "strategy", "alpha", "beta", "feature", "launch"],
  Operations: ["operations", "disaster recovery", "continuity", "runbook", "incident"],
  Training: ["training", "guide", "onboarding", "learning", "handbook"],
  Public: ["public", "company overview", "announcement"]
};

const SENSITIVE_RESOURCE_KEYWORDS = [
  "confidential",
  "top secret",
  "secret",
  "salary",
  "payroll",
  "database",
  "credential",
  "private key",
  "source code",
  "customer pii"
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDepartment(input) {
  const raw = normalizeText(input);
  if (["finance", "fiance", "financial"].includes(raw)) return "Finance";
  if (["hr", "human resources"].includes(raw)) return "HR";
  if (["engineering", "developer", "development", "tech"].includes(raw)) return "Engineering";
  if (["ops", "operations"].includes(raw)) return "Operations";
  if (["product"].includes(raw)) return "Product";
  if (["training", "learning", "intern", "internship"].includes(raw)) return "Training";
  if (["security", "soc"].includes(raw)) return "Security";
  return "";
}

function inferDepartmentFromRole(roleValue) {
  const role = normalizeText(roleValue);
  if (role.includes("admin")) return "Security";
  if (role.includes("hr")) return "HR";
  if (role.includes("finance")) return "Finance";
  if (role.includes("developer") || role.includes("engineer") || role.includes("technical")) return "Engineering";
  if (role.includes("product")) return "Product";
  if (role.includes("operation")) return "Operations";
  if (role.includes("intern")) return "Training";
  return "";
}

function inferResourceDomains(resourceValue) {
  const resource = normalizeText(resourceValue);
  const domains = new Set();

  for (const [domain, tokens] of Object.entries(RESOURCE_DOMAIN_KEYWORDS)) {
    if (tokens.some((token) => resource.includes(token))) {
      domains.add(domain);
    }
  }

  return domains;
}

function isSensitiveResource(resourceValue) {
  const resource = normalizeText(resourceValue);
  return SENSITIVE_RESOURCE_KEYWORDS.some((token) => resource.includes(token));
}

function getAllowedDomainsForRoleAndDepartment(roleValue, departmentValue) {
  const role = normalizeText(roleValue);
  const department = normalizeDepartment(departmentValue) || inferDepartmentFromRole(roleValue);

  if (role.includes("admin")) {
    return null;
  }

  if (role.includes("hr manager") || role === "hr" || role.includes("human resources")) {
    return new Set(["HR", "Training", "Public"]);
  }

  if (role.includes("intern")) {
    return new Set(["Training", "Public"]);
  }

  const allowed = new Set(["Public", "Training"]);
  if (department) {
    allowed.add(department);
  }

  return allowed;
}

function roleMisuseHeuristicAdjust(rows, userContextByEmployeeID = new Map()) {
  return rows.map((row) => {
    const employeeID = String(row.EmployeeID || "").trim();
    const employeeContext = userContextByEmployeeID.get(employeeID) || {};

    const evaluatedRole = employeeContext.role || row.Role || "Employee";
    const evaluatedDepartment =
      normalizeDepartment(employeeContext.department) || inferDepartmentFromRole(evaluatedRole);

    const allowedDomains = getAllowedDomainsForRoleAndDepartment(evaluatedRole, evaluatedDepartment);
    const detectedDomains = inferResourceDomains(row.AccessedResource);
    const sensitiveResource = isSensitiveResource(row.AccessedResource);

    const existingRisk = Math.max(0, Math.min(1, Number(row["Risk Score"] || 0)));
    let adjustedRisk = existingRisk;
    let adjustedStatus = row.Status || "Normal";
    let policyDecision = "model_only";

    if (allowedDomains === null) {
      adjustedRisk = Math.min(existingRisk, sensitiveResource ? 0.45 : 0.25);
      adjustedStatus = adjustedRisk >= 0.68 ? "Suspicious" : "Normal";
      policyDecision = "admin_access";
    } else {
      const hasKnownResourceDomain = detectedDomains.size > 0;
      const isAllowed = [...detectedDomains].some((domain) => allowedDomains.has(domain));

      if (hasKnownResourceDomain && !isAllowed) {
        adjustedRisk = Math.max(existingRisk, sensitiveResource ? 0.92 : 0.78);
        adjustedStatus = "Suspicious";
        policyDecision = "policy_violation";
      } else if (isAllowed) {
        adjustedRisk = Math.min(existingRisk, sensitiveResource ? 0.5 : 0.3);
        adjustedStatus = adjustedRisk >= 0.68 ? "Suspicious" : "Normal";
        policyDecision = "policy_allowed";
      } else if (sensitiveResource) {
        adjustedRisk = Math.max(existingRisk, 0.66);
        adjustedStatus = "Suspicious";
        policyDecision = "sensitive_unknown_resource";
      } else {
        adjustedStatus = adjustedRisk >= 0.68 ? "Suspicious" : "Normal";
      }
    }

    return {
      ...row,
      "Risk Score": Number(adjustedRisk.toFixed(2)),
      Status: adjustedStatus,
      EvaluatedRole: evaluatedRole,
      EvaluatedDepartment: evaluatedDepartment || "Unknown",
      AllowedDomains: allowedDomains ? [...allowedDomains] : ["ALL"],
      DetectedDomains: [...detectedDomains],
      PolicyDecision: policyDecision
    };
  });
}

function normalizeTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function buildRoleMisuseAlertFingerprint(employeeID, rows = []) {
  const normalizedRows = rows
    .map((row) => ({
      ts: normalizeTimestamp(row.Timestamp),
      resource: normalizeText(row.AccessedResource),
      risk: Number(row["Risk Score"] || 0).toFixed(2)
    }))
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts.localeCompare(b.ts);
      if (a.resource !== b.resource) return a.resource.localeCompare(b.resource);
      return a.risk.localeCompare(b.risk);
    });

  const payload = JSON.stringify({
    employeeID: String(employeeID || "").trim(),
    rows: normalizedRows
  });

  return crypto.createHash("sha1").update(payload).digest("hex");
}

function groupSuspiciousRoleMisuseRows(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    const employeeID = String(row.EmployeeID || "").trim();
    if (!employeeID) {
      // Ignore malformed rows lacking employee identity.
      // eslint-disable-next-line no-continue
      continue;
    }

    const existing = grouped.get(employeeID) || {
      employeeID,
      maxRisk: 0,
      rows: []
    };

    const risk = Number(row["Risk Score"] || 0);
    existing.maxRisk = Math.max(existing.maxRisk, risk);
    existing.rows.push(row);
    grouped.set(employeeID, existing);
  }

  return [...grouped.values()].sort((a, b) => b.maxRisk - a.maxRisk);
}

async function shouldCreateRoleMisuseAlert({ employeeID, riskScore, fingerprint }) {
  const existingFingerprint = await Alert.findOne({
    type: "Role Misuse",
    employeeID,
    "metadata.pipelineFingerprint": fingerprint
  })
    .select("_id")
    .lean();

  if (existingFingerprint) {
    return false;
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const similarRecentAlert = await Alert.findOne({
    type: "Role Misuse",
    employeeID,
    createdAt: { $gte: oneHourAgo },
    riskScore: {
      $gte: Number(Math.max(0, riskScore - 0.02).toFixed(2)),
      $lte: Number(Math.min(1, riskScore + 0.02).toFixed(2))
    },
    status: { $ne: "closed" }
  })
    .select("_id")
    .lean();

  return !similarRecentAlert;
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildLastDays(days = 7) {
  const output = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    output.push(date);
  }
  return output;
}

async function getActiveEmployeeIDs() {
  const users = await User.find().select("employeeID accountStatus").lean();
  return users
    .filter((user) => user.accountStatus !== "Blocked")
    .map((user) => String(user.employeeID || "").trim())
    .filter(Boolean);
}

async function getBlockedEmployeeIDs() {
  const users = await User.find({ accountStatus: "Blocked" }).select("employeeID").lean();
  return users.map((user) => String(user.employeeID || "").trim()).filter(Boolean);
}

async function getAllEmployeeIDs() {
  const users = await User.find().select("employeeID").lean();
  return users.map((user) => String(user.employeeID || "").trim()).filter(Boolean);
}

async function getOverview(req, res) {
  const [totalEmployees, activeEmployeeIDs, blockedEmployeeIDs] = await Promise.all([
    User.countDocuments(),
    getActiveEmployeeIDs(),
    getBlockedEmployeeIDs()
  ]);

  const [
    activeAlerts,
    blockedQueueAlerts,
    maliciousDocuments,
    documentScans,
    emailDetections,
    emailScans,
    riskTable,
    exfiltrationAttempts
  ] = await Promise.all([
    Alert.countDocuments({
      employeeID: { $in: activeEmployeeIDs },
      status: "open",
      "metadata.manual": { $ne: true },
      "metadata.action": { $nin: ["block", "unblock"] }
    }),
    Alert.countDocuments({
      employeeID: { $in: blockedEmployeeIDs },
      status: { $ne: "closed" }
    }),
    DetectionResult.countDocuments({
      type: "Document",
      createdBy: { $in: [...activeEmployeeIDs, ...blockedEmployeeIDs] },
      riskScore: { $gte: 0.7 }
    }),
    DetectionResult.countDocuments({
      type: "Document",
      createdBy: { $in: [...activeEmployeeIDs, ...blockedEmployeeIDs] }
    }),
    DetectionResult.find({ type: "Email", createdBy: { $in: [...activeEmployeeIDs, ...blockedEmployeeIDs] } }),
    DetectionResult.countDocuments({
      type: "Email",
      createdBy: { $in: [...activeEmployeeIDs, ...blockedEmployeeIDs] }
    }),
    buildEmployeeRiskTable(),
    ExfiltrationIncident.countDocuments({ employeeID: { $in: activeEmployeeIDs }, riskScore: { $gte: 0.65 } })
  ]);

  const activeRiskRows = riskTable.filter((item) => item.accountStatus !== "Blocked");
  const blockedRiskRows = riskTable.filter((item) => item.accountStatus === "Blocked");

  const suspiciousEmployees = activeRiskRows.filter((item) => item.riskScore >= 0.7).length;
  const spamEmailsDetected = emailDetections.filter((item) =>
    ["Spam", "Phishing"].includes(item.prediction)
  ).length;

  const avgRisk =
    activeRiskRows.length > 0
      ? activeRiskRows.reduce((sum, item) => sum + item.riskScore, 0) / activeRiskRows.length
      : 0;

  return res.json({
    totalEmployees,
    activeAlerts,
    blockedUserAlertQueue: blockedQueueAlerts,
    suspiciousEmployees,
    maliciousDocuments,
    documentScans,
    spamEmailsDetected,
    emailScans,
    dataExfiltrationAttempts: exfiltrationAttempts,
    systemOverallRiskScore: Number(avgRisk.toFixed(2)),
    activeRiskEmployees: activeRiskRows.length,
    blockedRiskEmployees: blockedRiskRows.length,
    systemThreatLevel: classifyThreatLevel(Math.max(avgRisk, activeAlerts / 20))
  });
}

async function getAnalytics(req, res) {
  const employeeIDs = await getActiveEmployeeIDs();

  const [alertAgg, emailDetections, riskTable, exfilStatusAgg] = await Promise.all([
    Alert.aggregate([{ $match: { employeeID: { $in: employeeIDs } } }, { $group: { _id: "$type", value: { $sum: 1 } } }]),
    DetectionResult.find({ type: "Email", createdBy: { $in: employeeIDs } }),
    buildEmployeeRiskTable(),
    ExfiltrationIncident.aggregate([
      { $match: { employeeID: { $in: employeeIDs } } },
      { $group: { _id: "$status", value: { $sum: 1 } } }
    ])
  ]);

  const threatDistribution = alertAgg.map((row) => ({ label: row._id, value: row.value }));
  const employeeRiskScores = riskTable.slice(0, 12).map((item) => ({
    employeeID: item.employeeID,
    score: item.riskScore
  }));

  const departmentTotals = {};
  riskTable.forEach((item) => {
    const bucket = departmentTotals[item.department] || { total: 0, count: 0 };
    bucket.total += item.riskScore;
    bucket.count += 1;
    departmentTotals[item.department] = bucket;
  });

  const departmentRiskHeatmap = Object.entries(departmentTotals).map(([department, data]) => ({
    department,
    score: Number((data.total / data.count).toFixed(2))
  }));

  const spamVsSafeEmails = {
    safe: emailDetections.filter((item) => item.prediction === "Safe").length,
    spam: emailDetections.filter((item) => item.prediction === "Spam").length,
    phishing: emailDetections.filter((item) => item.prediction === "Phishing").length
  };

  return res.json({
    threatDistribution,
    employeeRiskScores,
    departmentRiskHeatmap,
    spamVsSafeEmails,
    exfiltrationStatusMix: exfilStatusAgg.map((row) => ({ label: row._id, value: row.value }))
  });
}

async function getFilteredAlerts(req, res) {
  const { type, severity, status, from, to, scope = "active", includeClosed = "false" } = req.query;
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
  const [activeEmployeeIDs, blockedEmployeeIDs] = await Promise.all([
    getActiveEmployeeIDs(),
    getBlockedEmployeeIDs()
  ]);

  const employeeIDs =
    scope === "blocked" ? blockedEmployeeIDs : scope === "all" ? [...activeEmployeeIDs, ...blockedEmployeeIDs] : activeEmployeeIDs;

  const query = {
    employeeID: { $in: employeeIDs }
  };
  if (String(includeClosed).toLowerCase() !== "true" && !status) {
    query.status = { $ne: "closed" };
  }
  if (type) query.type = type;
  if (severity) query.severity = severity;
  if (status) query.status = status;

  if (from || to) {
    query.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        query.createdAt.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        query.createdAt.$lte = toDate;
      }
    }
    if (!query.createdAt.$gte && !query.createdAt.$lte) {
      delete query.createdAt;
    }
  }

  const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(limit);
  return res.json({ alerts });
}

async function getTimelineAnalytics(req, res) {
  const days = buildLastDays(7);
  const dateKeys = days.map((d) => dayKey(d));
  const labels = days.map((d) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })
  );
  const indexByKey = new Map(days.map((d, idx) => [dayKey(d), idx]));
  const startDate = new Date(days[0]);
  const employeeIDs = await getActiveEmployeeIDs();

  const [alerts, emailDetections, riskTable] = await Promise.all([
    Alert.find({ employeeID: { $in: employeeIDs }, createdAt: { $gte: startDate } }).select("severity createdAt"),
    DetectionResult.find({
      type: "Email",
      createdBy: { $in: employeeIDs },
      createdAt: { $gte: startDate }
    }).select("prediction createdAt"),
    buildEmployeeRiskTable()
  ]);

  const alertTrend = {
    total: Array(labels.length).fill(0),
    high: Array(labels.length).fill(0),
    warning: Array(labels.length).fill(0),
    low: Array(labels.length).fill(0)
  };

  alerts.forEach((alert) => {
    const key = dayKey(new Date(alert.createdAt));
    const index = indexByKey.get(key);
    if (index === undefined) return;
    alertTrend.total[index] += 1;
    if (alert.severity === "high") alertTrend.high[index] += 1;
    else if (alert.severity === "warning") alertTrend.warning[index] += 1;
    else alertTrend.low[index] += 1;
  });

  const emailTrend = {
    safe: Array(labels.length).fill(0),
    spam: Array(labels.length).fill(0),
    phishing: Array(labels.length).fill(0)
  };

  emailDetections.forEach((item) => {
    const key = dayKey(new Date(item.createdAt));
    const index = indexByKey.get(key);
    if (index === undefined) return;
    const prediction = String(item.prediction || "").toLowerCase();
    if (prediction === "spam") emailTrend.spam[index] += 1;
    else if (prediction === "phishing") emailTrend.phishing[index] += 1;
    else emailTrend.safe[index] += 1;
  });

  const riskBands = {
    safe: riskTable.filter((item) => item.riskScore < 0.4).length,
    warning: riskTable.filter((item) => item.riskScore >= 0.4 && item.riskScore < 0.7).length,
    high: riskTable.filter((item) => item.riskScore >= 0.7).length
  };

  return res.json({
    labels,
    dateKeys,
    alertTrend,
    emailTrend,
    riskBands,
    topRiskEmployees: riskTable.slice(0, 8)
  });
}

async function getLiveFeed(req, res) {
  const employeeIDs = await getAllEmployeeIDs();

  const [logs, alerts] = await Promise.all([
    AccessLog.find({ employeeID: { $in: employeeIDs } }).sort({ timestamp: -1 }).limit(25),
    Alert.find({ employeeID: { $in: employeeIDs } }).sort({ createdAt: -1 }).limit(25)
  ]);

  const feed = [
    ...logs.map((entry) => ({
      type: "activity",
      level: entry.status === "blocked" ? "threat" : entry.status === "override" ? "warning" : "normal",
      timestamp: entry.timestamp,
      message: `${entry.employeeID} ${entry.action} ${entry.documentName}${entry.status === "override" ? " (override)" : ""}`
    })),
    ...alerts.map((entry) => ({
      type: "alert",
      level: entry.severity === "high" ? "threat" : "warning",
      timestamp: entry.createdAt,
      message: entry.message
    }))
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 40);

  return res.json({ feed });
}

async function getAlerts(req, res) {
  const includeClosed = String(req.query.includeClosed || "false").toLowerCase() === "true";
  const [activeEmployeeIDs, blockedEmployeeIDs] = await Promise.all([
    getActiveEmployeeIDs(),
    getBlockedEmployeeIDs()
  ]);

  const statusFilter = includeClosed ? {} : { status: { $ne: "closed" } };

  const [alerts, blockedAlerts] = await Promise.all([
    Alert.find({ employeeID: { $in: activeEmployeeIDs }, ...statusFilter }).sort({ createdAt: -1 }).limit(150),
    Alert.find({ employeeID: { $in: blockedEmployeeIDs }, ...statusFilter }).sort({ createdAt: -1 }).limit(150)
  ]);

  return res.json({
    alerts,
    blockedAlerts,
    counts: {
      active: alerts.length,
      blocked: blockedAlerts.length,
      total: alerts.length + blockedAlerts.length
    }
  });
}

async function updateAlertStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const valid = ["open", "investigating", "closed"];
  if (!valid.includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const alert = await Alert.findByIdAndUpdate(id, { status }, { new: true });
  if (!alert) {
    return res.status(404).json({ message: "Alert not found." });
  }

  return res.json({ alert });
}

async function resolveAlerts(req, res) {
  const { scope = "active", employeeID = null } = req.body || {};
  const validScopes = ["active", "blocked", "all"];
  if (!validScopes.includes(scope)) {
    return res.status(400).json({ message: "Invalid scope. Use active, blocked, or all." });
  }

  const [activeEmployeeIDs, blockedEmployeeIDs] = await Promise.all([
    getActiveEmployeeIDs(),
    getBlockedEmployeeIDs()
  ]);

  let targetEmployeeIDs = [];
  if (employeeID) {
    targetEmployeeIDs = [String(employeeID).trim()];
  } else if (scope === "blocked") {
    targetEmployeeIDs = blockedEmployeeIDs;
  } else if (scope === "all") {
    targetEmployeeIDs = [...activeEmployeeIDs, ...blockedEmployeeIDs];
  } else {
    targetEmployeeIDs = activeEmployeeIDs;
  }

  if (!targetEmployeeIDs.length) {
    return res.json({
      message: "No alerts found for the selected scope.",
      scope,
      resolvedCount: 0,
      matchedCount: 0
    });
  }

  const updateResult = await Alert.updateMany(
    {
      employeeID: { $in: targetEmployeeIDs },
      status: { $ne: "closed" }
    },
    {
      $set: {
        status: "closed",
        "metadata.resolvedBy": req.user.employeeID,
        "metadata.resolvedAt": new Date(),
        "metadata.resolveScope": scope
      }
    }
  );

  return res.json({
    message: `Resolved ${updateResult.modifiedCount} alert(s).`,
    scope,
    employeeCount: targetEmployeeIDs.length,
    matchedCount: updateResult.matchedCount,
    resolvedCount: updateResult.modifiedCount
  });
}

async function scanEmail(req, res) {
  const { content } = req.body;
  if (!content || content.trim().length < 5) {
    return res.status(400).json({ message: "Email content is required." });
  }

  const mlResult = await detectSpamEmail(content);
  const riskScore = Number(mlResult.confidence || 0);

  await DetectionResult.create({
    type: "Email",
    sourceName: "email_input",
    prediction: mlResult.prediction || "Safe",
    riskScore,
    details: mlResult,
    createdBy: req.user.employeeID
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "email_scan",
    timestamp: new Date(),
    department: req.user.department
  });

  if (["Spam", "Phishing"].includes(mlResult.prediction) && riskScore >= 0.6) {
    await createAlert({
      type: "Phishing Email",
      severity: riskScore >= 0.8 ? "high" : "warning",
      employeeID: req.user.employeeID,
      riskScore,
      message: `${mlResult.prediction} email detected by Access Guard AI.`,
      metadata: {
        suspiciousKeywords: mlResult.suspicious_keywords || []
      }
    });
  }

  return res.json({
    prediction: mlResult.prediction || "Safe",
    confidenceScore: Number(riskScore.toFixed(2)),
    suspiciousKeywords: mlResult.suspicious_keywords || []
  });
}

async function runRoleMisusePipeline({ req, records, sourceName, activityMetadata = {} }) {
  if (!records.length) {
    return {
      totalRecords: 0,
      suspiciousRecords: 0,
      output: []
    };
  }

  const mlResult = await detectRoleMisuse(records);
  let analyzedRows = mlResult.rows || [];

  const recordEmployeeIDs = [...new Set(records.map((row) => String(row.EmployeeID || "").trim()).filter(Boolean))];
  const userContexts = await User.find({ employeeID: { $in: recordEmployeeIDs } })
    .select("employeeID role department")
    .lean();
  const userContextByEmployeeID = new Map(
    userContexts.map((user) => [String(user.employeeID), { role: user.role, department: user.department }])
  );

  analyzedRows = roleMisuseHeuristicAdjust(analyzedRows, userContextByEmployeeID);

  const suspiciousRows = analyzedRows.filter((row) => row.Status === "Suspicious");
  const avgRisk =
    analyzedRows.length > 0
      ? analyzedRows.reduce((sum, row) => sum + Number(row["Risk Score"] || 0), 0) / analyzedRows.length
      : 0;

  await DetectionResult.create({
    type: "Role Misuse",
    sourceName,
    prediction: suspiciousRows.length ? "Suspicious" : "Normal",
    riskScore: Number(avgRisk.toFixed(2)),
    details: {
      total: analyzedRows.length,
      suspicious: suspiciousRows.length,
      rows: analyzedRows
    },
    createdBy: req.user.employeeID
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "role_misuse_scan",
    timestamp: new Date(),
    department: req.user.department,
    metadata: activityMetadata
  });

  const activeEmployeeIDs = await getActiveEmployeeIDs();
  const activeSet = new Set(activeEmployeeIDs);
  const groupedSuspicious = groupSuspiciousRoleMisuseRows(suspiciousRows).slice(0, 10);

  for (const group of groupedSuspicious) {
    if (!activeSet.has(group.employeeID)) {
      // Ignore stale/non-existent employee references.
      // eslint-disable-next-line no-continue
      continue;
    }

    const fingerprint = buildRoleMisuseAlertFingerprint(group.employeeID, group.rows);
    const shouldCreate = await shouldCreateRoleMisuseAlert({
      employeeID: group.employeeID,
      riskScore: group.maxRisk,
      fingerprint
    });

    if (!shouldCreate) {
      // Skip duplicate alerts when no new suspicious behavior signature exists.
      // eslint-disable-next-line no-continue
      continue;
    }

    const latestRow = [...group.rows].sort(
      (a, b) => new Date(b.Timestamp || 0).getTime() - new Date(a.Timestamp || 0).getTime()
    )[0];
    const topResources = [...new Set(group.rows.map((row) => String(row.AccessedResource || "").trim()).filter(Boolean))]
      .slice(0, 3);

    await createAlert({
      type: "Role Misuse",
      severity: Number(group.maxRisk) >= 0.8 ? "high" : "warning",
      employeeID: group.employeeID || null,
      riskScore: Number(group.maxRisk || 0),
      message: `Role misuse anomaly detected for ${group.employeeID}${group.rows.length > 1 ? ` (${group.rows.length} events)` : ""}.`,
      metadata: {
        employeeID: group.employeeID,
        suspiciousEvents: group.rows.length,
        topResources,
        latestSuspiciousAt: normalizeTimestamp(latestRow?.Timestamp),
        pipelineFingerprint: fingerprint,
        sampleRows: group.rows.slice(0, 5)
      }
    });
  }

  return {
    totalRecords: analyzedRows.length,
    suspiciousRecords: suspiciousRows.length,
    output: analyzedRows
  };
}

async function detectRoleMisuseByUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "Upload CSV or Excel file as `file`." });
  }

  const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  const jsonRows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
  const allRecords = jsonRows.map(normalizeRoleMisuseRecord).filter((row) => row.EmployeeID);
  const activeEmployeeIDs = await getActiveEmployeeIDs();
  const activeSet = new Set(activeEmployeeIDs);
  const records = allRecords.filter((row) => activeSet.has(row.EmployeeID));
  const ignoredRecords = allRecords.length - records.length;

  if (!records.length) {
    return res.status(400).json({
      message: "No valid records found for current active employees in file."
    });
  }

  const result = await runRoleMisusePipeline({
    req,
    records,
    sourceName: req.file.originalname,
    activityMetadata: { source: "upload_file" }
  });

  return res.json({
    ...result,
    datasetSource: "uploaded_csv_or_excel",
    ignoredRecords
  });
}

async function detectRoleMisuseFromSystemData(req, res) {
  const requestedLimit = Number(req.body?.limit || 600);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 50), 3000) : 600;
  const employeeIDs = await getActiveEmployeeIDs();

  const logs = await AccessLog.find({ employeeID: { $in: employeeIDs } }).sort({ timestamp: -1 }).limit(limit);
  if (!logs.length) {
    return res.status(400).json({
      message: "No access logs found yet. Generate employee document activity first."
    });
  }

  const records = logs.map((entry) => ({
    EmployeeID: String(entry.employeeID || "").trim(),
    Role: String(entry.role || "").trim() || "Employee",
    AccessedResource: String(entry.documentName || entry.metadata?.documentID || "UnknownResource").trim(),
    Timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString()
  }));

  const validRecords = records.filter((row) => row.EmployeeID);
  const result = await runRoleMisusePipeline({
    req,
    records: validRecords,
    sourceName: "current_app_employee_access.csv",
    activityMetadata: { source: "current_app_data", records: validRecords.length }
  });

  return res.json({
    ...result,
    datasetSource: "current_app_employee_csv",
    datasetRecordsUsed: validRecords.length,
    sampleRows: validRecords.slice(0, 5)
  });
}

async function getRiskTable(req, res) {
  const table = await buildEmployeeRiskTable();
  return res.json({ table });
}

async function getDetectionHistory(req, res) {
  const requestedLimit = Number(req.query.limit || 120);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 20), 400) : 120;
  const [activeEmployeeIDs, blockedEmployeeIDs] = await Promise.all([
    getActiveEmployeeIDs(),
    getBlockedEmployeeIDs()
  ]);
  const employeeIDs = [...activeEmployeeIDs, ...blockedEmployeeIDs];

  const [documentScans, emailScans, rows] = await Promise.all([
    DetectionResult.countDocuments({ type: "Document", createdBy: { $in: employeeIDs } }),
    DetectionResult.countDocuments({ type: "Email", createdBy: { $in: employeeIDs } }),
    DetectionResult.find({
      type: { $in: ["Document", "Email"] },
      createdBy: { $in: employeeIDs }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
  ]);

  const history = rows.map((row) => ({
    id: row._id,
    type: row.type,
    sourceName: row.sourceName,
    prediction: row.prediction,
    riskScore: Number(Number(row.riskScore || 0).toFixed(2)),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    details: row.details || {}
  }));

  return res.json({
    totals: {
      documentScans,
      emailScans,
      total: documentScans + emailScans
    },
    history
  });
}

module.exports = {
  getOverview,
  getAnalytics,
  getFilteredAlerts,
  getTimelineAnalytics,
  getLiveFeed,
  getAlerts,
  updateAlertStatus,
  resolveAlerts,
  scanEmail,
  detectRoleMisuseByUpload,
  detectRoleMisuseFromSystemData,
  getRiskTable,
  getDetectionHistory
};
