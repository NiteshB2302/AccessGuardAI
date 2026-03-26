const express = require("express");
const {
  createEmployee,
  listEmployees,
  getRolePermissions,
  blockEmployee,
  unblockEmployee,
  deleteEmployee,
  sendAlertToEmployee,
  getMyNotifications,
  getMySecuritySummary
} = require("../controllers/employeeController");
const {
  analyzeSecureShare,
  decideSecureShare,
  getMySecureShareIncidents
} = require("../controllers/exfiltrationController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.use(authenticate);
router.get("/me/notifications", asyncHandler(getMyNotifications));
router.get("/me/security-summary", asyncHandler(getMySecuritySummary));
router.get("/me/secure-share/incidents", asyncHandler(getMySecureShareIncidents));
router.post("/me/secure-share/analyze", asyncHandler(analyzeSecureShare));
router.post("/me/secure-share/:incidentId/decision", asyncHandler(decideSecureShare));
router.get("/", authorizeRoles("Admin", "HR Manager"), asyncHandler(listEmployees));
router.post("/", authorizeRoles("Admin", "HR Manager"), asyncHandler(createEmployee));
router.get("/permissions", authorizeRoles("Admin", "HR Manager"), asyncHandler(getRolePermissions));
router.post("/:employeeID/send-alert", authorizeRoles("Admin"), asyncHandler(sendAlertToEmployee));
router.post("/:employeeID/block", authorizeRoles("Admin"), asyncHandler(blockEmployee));
router.post("/:employeeID/unblock", authorizeRoles("Admin"), asyncHandler(unblockEmployee));
router.delete("/:employeeID", authorizeRoles("Admin"), asyncHandler(deleteEmployee));

module.exports = router;
