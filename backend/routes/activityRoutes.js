const express = require("express");
const { getMyActivity, getAccessLogs, getSessionAuditLogs } = require("../controllers/activityController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.use(authenticate);
router.get("/me", asyncHandler(getMyActivity));
router.get("/logs", authorizeRoles("Admin"), asyncHandler(getAccessLogs));
router.get("/sessions", authorizeRoles("Admin"), asyncHandler(getSessionAuditLogs));

module.exports = router;
