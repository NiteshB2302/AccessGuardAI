const dotenv = require("dotenv");
dotenv.config();

const connectMongoDB = require("../database/mongodb_connection");
const User = require("./models/User");
const AccessLog = require("./models/AccessLog");
const UserActivity = require("./models/UserActivity");
const Alert = require("./models/Alert");
const DetectionResult = require("./models/DetectionResult");
const ExfiltrationIncident = require("./models/ExfiltrationIncident");

async function cleanupOrphanSecurityData() {
  await connectMongoDB();

  const employeeIDs = await User.distinct("employeeID");

  const orphanEmployeeFilter = { employeeID: { $nin: employeeIDs } };
  const orphanAlertFilter = {
    $or: [{ employeeID: null }, { employeeID: "" }, { employeeID: { $exists: false } }, orphanEmployeeFilter]
  };
  const orphanCreatedByFilter = { createdBy: { $nin: employeeIDs } };

  const [accessLogs, activities, alerts, detections, incidents] = await Promise.all([
    AccessLog.deleteMany(orphanEmployeeFilter),
    UserActivity.deleteMany(orphanEmployeeFilter),
    Alert.deleteMany(orphanAlertFilter),
    DetectionResult.deleteMany(orphanCreatedByFilter),
    ExfiltrationIncident.deleteMany(orphanEmployeeFilter)
  ]);

  // eslint-disable-next-line no-console
  console.log("Orphan security data cleanup complete.");
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        activeUsers: employeeIDs.length,
        deleted: {
          accessLogs: accessLogs.deletedCount,
          userActivities: activities.deletedCount,
          alerts: alerts.deletedCount,
          detectionResults: detections.deletedCount,
          exfiltrationIncidents: incidents.deletedCount
        }
      },
      null,
      2
    )
  );

  process.exit(0);
}

cleanupOrphanSecurityData().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Orphan cleanup failed:", error.message);
  process.exit(1);
});
