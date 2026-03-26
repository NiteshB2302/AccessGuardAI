const Alert = require("../models/Alert");

async function createAlert(payload) {
  const alert = await Alert.create(payload);
  return alert;
}

async function listRecentAlerts(limit = 50) {
  return Alert.find().sort({ createdAt: -1 }).limit(limit);
}

module.exports = { createAlert, listRecentAlerts };

