const UserActivity = require("../models/UserActivity");
const AccessLog = require("../models/AccessLog");

async function getMyActivity(req, res) {
  const activities = await UserActivity.find({ employeeID: req.user.employeeID })
    .sort({ timestamp: -1 })
    .limit(100);
  const accessLogs = await AccessLog.find({ employeeID: req.user.employeeID })
    .sort({ timestamp: -1 })
    .limit(100);

  return res.json({ activities, accessLogs });
}

async function getAccessLogs(req, res) {
  const logs = await AccessLog.find().sort({ timestamp: -1 }).limit(250);
  return res.json({ logs });
}

module.exports = { getMyActivity, getAccessLogs };

