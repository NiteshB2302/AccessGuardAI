const express = require("express");
const multer = require("multer");
const {
  listDocuments,
  createDocument,
  accessDocument,
  requestRestrictedDownload,
  listMyDownloadRequests,
  verifyDownloadOtp,
  listDownloadRequests,
  approveDownloadRequest,
  rejectDownloadRequest,
  scanDocument,
  getScanHistory
} = require("../controllers/documentController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

router.use(authenticate);
router.post("/create", upload.single("file"), asyncHandler(createDocument));
router.post("/:documentId/request-download", authorizeRoles("HR Manager", "Employee"), asyncHandler(requestRestrictedDownload));
router.get("/download-requests/mine", authorizeRoles("HR Manager", "Employee"), asyncHandler(listMyDownloadRequests));
router.post(
  "/download-requests/:requestId/verify-otp",
  authorizeRoles("HR Manager", "Employee"),
  asyncHandler(verifyDownloadOtp)
);
router.get("/download-requests", authorizeRoles("Admin"), asyncHandler(listDownloadRequests));
router.post("/download-requests/:requestId/approve", authorizeRoles("Admin"), asyncHandler(approveDownloadRequest));
router.post("/download-requests/:requestId/reject", authorizeRoles("Admin"), asyncHandler(rejectDownloadRequest));
router.get("/", asyncHandler(listDocuments));
router.post("/:documentId/access", asyncHandler(accessDocument));
router.post("/scan", authorizeRoles("Admin"), upload.single("file"), asyncHandler(scanDocument));
router.get("/scan-history", authorizeRoles("Admin"), asyncHandler(getScanHistory));

module.exports = router;
