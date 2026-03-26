const express = require("express");
const multer = require("multer");
const {
  listDocuments,
  accessDocument,
  scanDocument,
  getScanHistory
} = require("../controllers/documentController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.use(authenticate);
router.get("/", asyncHandler(listDocuments));
router.post("/:documentId/access", asyncHandler(accessDocument));
router.post("/scan", authorizeRoles("Admin"), upload.single("file"), asyncHandler(scanDocument));
router.get("/scan-history", authorizeRoles("Admin"), asyncHandler(getScanHistory));

module.exports = router;
