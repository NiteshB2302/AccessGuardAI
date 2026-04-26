const UserActivity = require("../models/UserActivity");
const AccessLog = require("../models/AccessLog");
const User = require("../models/User");

const OFFICE_HOURS_START = Number(process.env.OFFICE_HOURS_START || 9);
const OFFICE_HOURS_END = Number(process.env.OFFICE_HOURS_END || 18);
const SESSION_ACTIONS = ["login", "logout"];

function isAfterOfficeHours(entry) {
  const metadata = entry?.metadata || {};
  if (typeof metadata.isWeekend === "boolean" && metadata.isWeekend) return true;
  if (typeof metadata.isAfterOfficeHours === "boolean") return metadata.isAfterOfficeHours;
  const hour = new Date(entry.timestamp).getHours();
  return hour < OFFICE_HOURS_START || hour >= OFFICE_HOURS_END;
}

function parseBooleanFilter(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  return null;
}

function isWeekend(entry) {
  const metadata = entry?.metadata || {};
  if (typeof metadata.isWeekend === "boolean") return metadata.isWeekend;
  const day = new Date(entry.timestamp).getDay();
  return day === 0 || day === 6;
}

async function getMyActivity(req, res) {
  const activities = await UserActivity.find({ employeeID: req.user.employeeID })
    .sort({ timestamp: -1 })
    .limit(100);
  const accessLogs = await AccessLog.find({ employeeID: req.user.employeeID })
    .sort({ timestamp: -1 })
    .limit(100);
  const sessionEntries = activities.filter((entry) => ["login", "logout"].includes(entry.actionType));
  const totalLogins = sessionEntries.filter((entry) => entry.actionType === "login").length;
  const totalLogouts = sessionEntries.filter((entry) => entry.actionType === "logout").length;
  const afterHoursSessions = sessionEntries.filter((entry) => isAfterOfficeHours(entry)).length;

  return res.json({
    activities,
    accessLogs,
    sessionInsights: {
      totalLogins,
      totalLogouts,
      afterHoursSessions,
      officeHoursPolicy: `${String(OFFICE_HOURS_START).padStart(2, "0")}:00-${String(OFFICE_HOURS_END).padStart(2, "0")}:00`
    }
  });
}

async function getAccessLogs(req, res) {
  const logs = await AccessLog.find().sort({ timestamp: -1 }).limit(250);
  return res.json({ logs });
}

async function getSessionAuditLogs(req, res) {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
  const employeeID = String(req.query.employeeID || "").trim();
  const department = String(req.query.department || "").trim();
  const actionType = String(req.query.actionType || "").trim().toLowerCase();
  const afterHoursFilter = parseBooleanFilter(req.query.afterHours);

  const query = {
    actionType: { $in: SESSION_ACTIONS }
  };

  if (employeeID) {
    query.employeeID = employeeID.toUpperCase();
  }

  if (department && department.toLowerCase() !== "all") {
    query.department = department;
  }

  if (SESSION_ACTIONS.includes(actionType)) {
    query.actionType = actionType;
  }

  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    query.timestamp = {};
    if (from && !Number.isNaN(from.getTime())) {
      query.timestamp.$gte = from;
    }
    if (to && !Number.isNaN(to.getTime())) {
      query.timestamp.$lte = to;
    }
  }

  const logs = await UserActivity.find(query).sort({ timestamp: -1 }).limit(limit).lean();
  const enriched = logs.map((entry) => {
    const weekend = isWeekend(entry);
    const afterHours = isAfterOfficeHours(entry);
    return {
      ...entry,
      isWeekend: weekend,
      isAfterOfficeHours: afterHours,
      workTiming: weekend ? "weekend" : afterHours ? "after_hours" : "office_hours"
    };
  });

  const filtered = afterHoursFilter === null ? enriched : enriched.filter((entry) => entry.isAfterOfficeHours === afterHoursFilter);

  const employeeIDs = [...new Set(filtered.map((entry) => String(entry.employeeID || "").trim()).filter(Boolean))];
  const users = await User.find({ employeeID: { $in: employeeIDs } })
    .select("employeeID name role department accountStatus")
    .lean();
  const userMap = users.reduce((acc, user) => {
    acc[String(user.employeeID || "").trim()] = user;
    return acc;
  }, {});

  const rows = filtered.map((entry) => {
    const user = userMap[String(entry.employeeID || "").trim()] || {};
    return {
      id: entry._id,
      employeeID: entry.employeeID,
      employeeName: user.name || "Unknown User",
      role: user.role || "Unknown",
      department: entry.department || user.department || "Unknown",
      accountStatus: user.accountStatus || "Unknown",
      actionType: entry.actionType,
      timestamp: entry.timestamp,
      loginTime: entry.loginTime || null,
      isAfterOfficeHours: entry.isAfterOfficeHours,
      isWeekend: entry.isWeekend,
      workTiming: entry.workTiming,
      localTimeLabel: entry?.metadata?.localTimeLabel || null,
      officeHoursPolicy: entry?.metadata?.officeHours || `${String(OFFICE_HOURS_START).padStart(2, "0")}:00-${String(OFFICE_HOURS_END).padStart(2, "0")}:00`,
      sessionDurationMinutes: entry?.metadata?.sessionDurationMinutes ?? null,
      ipAddress: entry?.metadata?.ipAddress || null,
      userAgent: entry?.metadata?.userAgent || null
    };
  });

  const summary = {
    total: rows.length,
    logins: rows.filter((entry) => entry.actionType === "login").length,
    logouts: rows.filter((entry) => entry.actionType === "logout").length,
    afterHours: rows.filter((entry) => entry.isAfterOfficeHours).length,
    weekends: rows.filter((entry) => entry.isWeekend).length
  };

  return res.json({
    summary,
    rows,
    officeHoursPolicy: `${String(OFFICE_HOURS_START).padStart(2, "0")}:00-${String(OFFICE_HOURS_END).padStart(2, "0")}:00`
  });
}

module.exports = { getMyActivity, getAccessLogs, getSessionAuditLogs };
