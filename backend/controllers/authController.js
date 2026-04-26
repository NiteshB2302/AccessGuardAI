const jwt = require("jsonwebtoken");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const { createAlert } = require("../services/alertService");

const OFFICE_HOURS_START = Number(process.env.OFFICE_HOURS_START || 9);
const OFFICE_HOURS_END = Number(process.env.OFFICE_HOURS_END || 18);
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      employeeID: user.employeeID,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus,
      tokenVersion: Number(user.tokenVersion || 0)
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

function buildTimingMetadata(timestamp = new Date()) {
  const time = new Date(timestamp);
  const hour = time.getHours();
  const dayOfWeek = time.getDay(); // 0 = Sunday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isAfterOfficeHours = hour < OFFICE_HOURS_START || hour >= OFFICE_HOURS_END;

  return {
    officeHours: `${String(OFFICE_HOURS_START).padStart(2, "0")}:00-${String(OFFICE_HOURS_END).padStart(2, "0")}:00`,
    timezone: APP_TIMEZONE,
    hour,
    dayOfWeek,
    isWeekend,
    isAfterOfficeHours,
    workTiming: isWeekend ? "weekend" : isAfterOfficeHours ? "after_hours" : "office_hours",
    localTimeLabel: time.toLocaleString("en-IN", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    })
  };
}

async function maybeCreateAfterHoursAlert({ user, timing, event }) {
  if (user.role === "Admin") {
    return null;
  }

  if (!timing.isAfterOfficeHours && !timing.isWeekend) {
    return null;
  }

  const alertRisk = timing.isWeekend ? 0.62 : 0.48;
  return createAlert({
    type: "Behavior Anomaly",
    severity: "warning",
    employeeID: user.employeeID,
    riskScore: alertRisk,
    message: `${user.employeeID} ${event} ${timing.localTimeLabel} (${timing.workTiming.replace("_", " ")}).`,
    metadata: {
      category: "after_hours_activity",
      event,
      officeHours: timing.officeHours,
      timezone: timing.timezone,
      isAfterOfficeHours: timing.isAfterOfficeHours,
      isWeekend: timing.isWeekend
    }
  });
}

async function bootstrapAdmin(req, res) {
  const usersCount = await User.countDocuments();
  if (usersCount > 0) {
    return res.status(400).json({
      message: "Users already exist. Bootstrap admin is disabled."
    });
  }

  const payload = {
    name: req.body.name || "Platform Admin",
    email: (req.body.email || "admin@accessguard.ai").toLowerCase(),
    password: req.body.password || "Admin@123",
    role: "Admin",
    department: req.body.department || "Security"
  };

  const admin = await User.create(payload);

  return res.status(201).json({
    message: "Admin account bootstrapped successfully.",
    employeeID: admin.employeeID
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  if (user.accountStatus === "Blocked") {
    return res.status(403).json({
      message: `Your account is blocked by security admin.${user.blockedReason ? ` Reason: ${user.blockedReason}` : ""}`
    });
  }

  const loginAt = new Date();
  const timing = buildTimingMetadata(loginAt);
  await UserActivity.create({
    employeeID: user.employeeID,
    loginTime: loginAt,
    actionType: "login",
    timestamp: loginAt,
    department: user.department,
    metadata: {
      source: "auth_login",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || "unknown",
      ...timing
    }
  });

  await maybeCreateAfterHoursAlert({
    user,
    timing,
    event: "logged in at"
  });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      employeeID: user.employeeID,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus
    }
  });
}

async function logout(req, res) {
  const logoutAt = new Date();
  const timing = buildTimingMetadata(logoutAt);
  const latestLogin = await UserActivity.findOne({
    employeeID: req.user.employeeID,
    actionType: "login"
  })
    .sort({ timestamp: -1 })
    .lean();

  const sessionMinutes = latestLogin?.timestamp
    ? Math.max(0, Math.round((logoutAt.getTime() - new Date(latestLogin.timestamp).getTime()) / (1000 * 60)))
    : null;

  await UserActivity.create({
    employeeID: req.user.employeeID,
    loginTime: latestLogin?.timestamp ? new Date(latestLogin.timestamp) : null,
    actionType: "logout",
    timestamp: logoutAt,
    department: req.user.department,
    metadata: {
      source: "auth_logout",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || "unknown",
      sessionDurationMinutes: sessionMinutes,
      ...timing
    }
  });

  await maybeCreateAfterHoursAlert({
    user: req.user,
    timing,
    event: "logged out at"
  });

  return res.json({
    message: "Logout recorded successfully.",
    loggedAt: logoutAt,
    sessionDurationMinutes: sessionMinutes,
    afterOfficeHours: timing.isAfterOfficeHours || timing.isWeekend
  });
}

async function getMe(req, res) {
  return res.json({ user: req.user });
}

module.exports = {
  bootstrapAdmin,
  login,
  logout,
  getMe
};
