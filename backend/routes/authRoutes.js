const express = require("express");
const { bootstrapAdmin, login, getMe } = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/bootstrap-admin", asyncHandler(bootstrapAdmin));
router.post("/login", asyncHandler(login));
router.get("/me", authenticate, asyncHandler(getMe));

module.exports = router;
