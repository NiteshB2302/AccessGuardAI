const path = require("path");
const mongoose = require("mongoose");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Document = require("../models/Document");
const AccessLog = require("../models/AccessLog");
const DetectionResult = require("../models/DetectionResult");
const UserActivity = require("../models/UserActivity");
const { canUserAccessDocument } = require("../services/permissionService");
const { insiderThreatRisk, threatLevel } = require("../services/riskEngine");
const { createAlert } = require("../services/alertService");
const { detectMaliciousDocument } = require("../services/mlService");

async function parseUploadedText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf") {
    const data = await pdfParse(file.buffer);
    return data.text || "";
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }
  if (ext === ".txt") {
    return file.buffer.toString("utf8");
  }
  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
}

async function listDocuments(req, res) {
  if (req.user.role === "Admin") {
    const documents = await Document.find().sort({ createdAt: -1 });
    return res.json({ documents });
  }

  if (req.user.role === "HR Manager") {
    const documents = await Document.find({
      $or: [{ sensitivityLevel: "Public" }, { department: "HR" }, { department: "Training" }]
    }).sort({ createdAt: -1 });
    return res.json({ documents });
  }

  const documents = await Document.find().sort({ createdAt: -1 });
  const decorated = documents.map((doc) => {
    const access = canUserAccessDocument(req.user, doc);
    return {
      _id: doc._id,
      documentID: doc.documentID,
      name: doc.name,
      department: doc.department,
      sensitivityLevel: doc.sensitivityLevel,
      accessAllowed: access.allowed,
      accessReason: access.reason
    };
  });

  return res.json({ documents: decorated });
}

async function accessDocument(req, res) {
  const { documentId } = req.params;
  const { action = "view", override = false } = req.body;

  const query = mongoose.Types.ObjectId.isValid(documentId)
    ? { $or: [{ _id: documentId }, { documentID: documentId }] }
    : { documentID: documentId };

  const document = await Document.findOne(query);

  if (!document) {
    return res.status(404).json({ message: "Document not found." });
  }

  const accessCheck = canUserAccessDocument(req.user, document);
  const riskScore = insiderThreatRisk(document, accessCheck.allowed);

  if (!accessCheck.allowed) {
    const canOverride = document.sensitivityLevel !== "Top Secret";
    const attemptRisk = Math.min(1, Math.max(riskScore, canOverride ? 0.65 : 0.9));
    const attemptSeverity = attemptRisk >= 0.85 ? "high" : "warning";

    await AccessLog.create({
      employeeID: req.user.employeeID,
      role: req.user.role,
      documentName: document.name,
      action,
      status: "blocked",
      timestamp: new Date(),
      metadata: {
        documentID: document.documentID,
        sensitivityLevel: document.sensitivityLevel,
        reason: accessCheck.reason,
        canOverride,
        overrideAttempted: Boolean(override)
      }
    });

    await UserActivity.create({
      employeeID: req.user.employeeID,
      actionType: action,
      documentAccessed: document.name,
      timestamp: new Date(),
      department: req.user.department,
      sensitivityLevel: document.sensitivityLevel,
      metadata: {
        blocked: true,
        canOverride
      }
    });

    await createAlert({
      type: "Insider Threat",
      severity: attemptSeverity,
      employeeID: req.user.employeeID,
      riskScore: attemptRisk,
      message: `${req.user.employeeID} attempted ${action} on ${document.name} outside role permission.`,
      metadata: {
        role: req.user.role,
        department: req.user.department,
        documentName: document.name,
        accessReason: accessCheck.reason,
        canOverride,
        threatLevel: threatLevel(attemptRisk)
      }
    });

    if (!override || !canOverride) {
      return res.status(403).json({
        message: canOverride
          ? "Restricted by role policy. Confirm override to continue."
          : "Insider threat detected. Access blocked.",
        requiresOverride: canOverride,
        attemptedAction: action,
        document: {
          documentID: document.documentID,
          name: document.name,
          department: document.department,
          sensitivityLevel: document.sensitivityLevel
        },
        alert: {
          employeeID: req.user.employeeID,
          role: req.user.role,
          documentAccessed: document.name,
          riskScore: Number(attemptRisk.toFixed(2)),
          threatLevel: threatLevel(attemptRisk)
        }
      });
    }

    const overrideRisk = Math.min(1, Math.max(attemptRisk, 0.85));
    const overrideSeverity = overrideRisk >= 0.92 ? "high" : "warning";

    await AccessLog.create({
      employeeID: req.user.employeeID,
      role: req.user.role,
      documentName: document.name,
      action,
      status: "override",
      timestamp: new Date(),
      metadata: {
        documentID: document.documentID,
        sensitivityLevel: document.sensitivityLevel,
        overrideConfirmed: true,
        reason: accessCheck.reason
      }
    });

    await createAlert({
      type: "Insider Threat",
      severity: overrideSeverity,
      employeeID: req.user.employeeID,
      riskScore: overrideRisk,
      message: `${req.user.employeeID} used override to ${action} ${document.name}.`,
      metadata: {
        role: req.user.role,
        department: req.user.department,
        documentName: document.name,
        override: true,
        threatLevel: threatLevel(overrideRisk)
      }
    });

    return res.json({
      message: "Override accepted. Document access granted with elevated monitoring.",
      overrideUsed: true,
      document: {
        documentID: document.documentID,
        name: document.name,
        department: document.department,
        sensitivityLevel: document.sensitivityLevel
      },
      audit: {
        riskScore: Number(overrideRisk.toFixed(2)),
        threatLevel: threatLevel(overrideRisk)
      }
    });
  }

  await AccessLog.create({
    employeeID: req.user.employeeID,
    role: req.user.role,
    documentName: document.name,
    action,
    status: "allowed",
    timestamp: new Date(),
    metadata: {
      documentID: document.documentID,
      sensitivityLevel: document.sensitivityLevel,
      reason: accessCheck.reason
    }
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: action,
    documentAccessed: document.name,
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: document.sensitivityLevel
  });

  return res.json({
    message: "Document access granted.",
    document: {
      documentID: document.documentID,
      name: document.name,
      department: document.department,
      sensitivityLevel: document.sensitivityLevel
    },
    audit: {
      riskScore: Number(riskScore.toFixed(2)),
      threatLevel: threatLevel(riskScore)
    }
  });
}

async function scanDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "Upload a PDF, DOCX, or TXT file as `file`." });
  }

  const text = await parseUploadedText(req.file);
  const mlResult = await detectMaliciousDocument(text, req.file.originalname);
  const riskScore = Number(mlResult.risk_score || 0);

  const result = await DetectionResult.create({
    type: "Document",
    sourceName: req.file.originalname,
    prediction: mlResult.risk_level || "LOW",
    riskScore,
    details: mlResult,
    createdBy: req.user.employeeID
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "upload",
    timestamp: new Date(),
    department: req.user.department,
    metadata: { source: req.file.originalname }
  });

  if (riskScore >= 0.6) {
    await createAlert({
      type: "Malicious Document",
      severity: riskScore >= 0.8 ? "high" : "warning",
      employeeID: req.user.employeeID,
      riskScore,
      message: `Malicious document pattern detected in ${req.file.originalname}.`,
      metadata: {
        suspiciousKeywords: mlResult.suspicious_keywords || [],
        suspiciousSentences: mlResult.suspicious_sentences || []
      }
    });
  }

  return res.json({
    message: "Document scan completed.",
    scan: {
      id: result._id,
      fileName: req.file.originalname,
      riskLevel: mlResult.risk_level || "LOW",
      riskScore: Number(riskScore.toFixed(2)),
      suspiciousKeywords: mlResult.suspicious_keywords || [],
      suspiciousSentences: mlResult.suspicious_sentences || []
    }
  });
}

async function getScanHistory(req, res) {
  const scans = await DetectionResult.find({ type: "Document" }).sort({ createdAt: -1 }).limit(100);
  return res.json({ scans });
}

module.exports = {
  listDocuments,
  accessDocument,
  scanDocument,
  getScanHistory
};
