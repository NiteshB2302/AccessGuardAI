const express = require("express");
const multer = require("multer");
const {
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
} = require("../controllers/threatController");
const {
  getExfiltrationIncidents,
  updateExfiltrationIncidentStatus
} = require("../controllers/exfiltrationController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate, authorizeRoles("Admin"));

router.get("/overview", asyncHandler(getOverview));
router.get("/analytics", asyncHandler(getAnalytics));
router.get("/alerts-search", asyncHandler(getFilteredAlerts));
router.get("/timeline-analytics", asyncHandler(getTimelineAnalytics));
router.get("/live-feed", asyncHandler(getLiveFeed));
router.get("/alerts", asyncHandler(getAlerts));
router.get("/risk-table", asyncHandler(getRiskTable));
router.get("/detection-history", asyncHandler(getDetectionHistory));
router.patch("/alerts/:id", asyncHandler(updateAlertStatus));
router.post("/alerts/resolve-all", asyncHandler(resolveAlerts));
router.post("/email-scan", asyncHandler(scanEmail));
router.post("/role-misuse", upload.single("file"), asyncHandler(detectRoleMisuseByUpload));
router.post("/role-misuse/current-data", asyncHandler(detectRoleMisuseFromSystemData));
router.get("/exfil-incidents", asyncHandler(getExfiltrationIncidents));
router.patch("/exfil-incidents/:id", asyncHandler(updateExfiltrationIncidentStatus));

module.exports = router;
