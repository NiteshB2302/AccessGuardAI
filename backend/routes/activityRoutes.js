const express = require("express");
const { getMyActivity, getAccessLogs } = require("../controllers/activityController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.use(authenticate);
router.get("/me", asyncHandler(getMyActivity));
router.get("/logs", authorizeRoles("Admin"), asyncHandler(getAccessLogs));

module.exports = router;
