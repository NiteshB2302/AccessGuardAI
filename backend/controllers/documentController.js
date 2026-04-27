const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Document = require("../models/Document");
const AccessLog = require("../models/AccessLog");
const DetectionResult = require("../models/DetectionResult");
const UserActivity = require("../models/UserActivity");
const DocumentDownloadRequest = require("../models/DocumentDownloadRequest");
const { canUserAccessDocument, normalizeDepartment } = require("../services/permissionService");
const { insiderThreatRisk, threatLevel } = require("../services/riskEngine");
const { createAlert } = require("../services/alertService");
const { detectMaliciousDocument } = require("../services/mlService");
const { ensureDefaultDocuments } = require("../services/defaultDocumentService");

const DOWNLOAD_REQUEST_STATUSES = ["pending_admin", "otp_sent", "approved", "rejected", "cancelled", "expired"];
const OTP_TTL_MINUTES = Number(process.env.DOCUMENT_APPROVAL_OTP_TTL_MINUTES || 10);
const AUTO_TAG_RULES = [
  { tag: "finance", tokens: ["finance", "budget", "invoice", "audit", "ledger", "payroll", "expense"] },
  { tag: "hr", tokens: ["hr", "employee", "recruit", "hiring", "benefit", "compensation", "salary"] },
  { tag: "engineering", tokens: ["engineering", "architecture", "api", "code", "repository", "deploy"] },
  { tag: "operations", tokens: ["operations", "runbook", "incident", "disaster", "continuity"] },
  { tag: "product", tokens: ["product", "roadmap", "launch", "strategy", "milestone"] },
  { tag: "training", tokens: ["training", "awareness", "onboarding", "guide", "workbook"] },
  { tag: "security", tokens: ["security", "credentials", "password", "private key", "mfa", "threat"] }
];

function normalizeAction(input) {
  return String(input || "view").trim().toLowerCase() === "download" ? "download" : "view";
}

function normalizeRequestStatus(input) {
  const status = String(input || "").trim().toLowerCase();
  return DOWNLOAD_REQUEST_STATUSES.includes(status) ? status : null;
}

function maskOtp(otp) {
  if (!otp) return "";
  return `**${String(otp).slice(-2)}`;
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp || "")).digest("hex");
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function summarizeContent(content, maxLength = 180) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "No preview available.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function normalizeTagToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function uniqueTags(values) {
  const seen = new Set();
  const tags = [];
  for (const value of values) {
    const token = normalizeTagToken(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tags.push(token);
  }
  return tags;
}

function inferDocumentTags({ documentName, content, department, sensitivityLevel, mlResult, riskScore }) {
  const source = `${documentName || ""} ${content || ""}`.toLowerCase();
  const tags = [];
  const normalizedDepartment = normalizeDepartment(department || "");
  const suspiciousKeywords = Array.isArray(mlResult?.suspicious_keywords) ? mlResult.suspicious_keywords : [];

  if (normalizedDepartment) {
    tags.push(normalizedDepartment);
  }
  tags.push(sensitivityLevel || "Internal");

  for (const rule of AUTO_TAG_RULES) {
    if (rule.tokens.some((token) => source.includes(token))) {
      tags.push(rule.tag);
    }
  }

  suspiciousKeywords.slice(0, 5).forEach((keyword) => tags.push(keyword));

  if (Number(riskScore || 0) >= 0.75) tags.push("high-risk");
  else if (Number(riskScore || 0) >= 0.45) tags.push("medium-risk");
  else tags.push("low-risk");

  return uniqueTags(tags).slice(0, 8);
}

function evaluateDocumentThreat({ riskLevel, riskScore, suspiciousKeywords, suspiciousSentences, content }) {
  const normalizedLevel = String(riskLevel || "LOW").toUpperCase();
  const score = Number(riskScore || 0);
  const keywords = Array.isArray(suspiciousKeywords) ? suspiciousKeywords.map((item) => String(item).toLowerCase()) : [];
  const sentences = Array.isArray(suspiciousSentences) ? suspiciousSentences : [];
  const text = String(content || "").toLowerCase();

  const criticalTokens = [
    "private key",
    "customer pii",
    "source code",
    "credentials",
    "password",
    "database",
    "top secret"
  ];
  const behaviorPattern = /bypass|disable monitoring|exfiltrat|unauthorized|steal|dump|external account|outside company/i;
  const criticalHits = criticalTokens.filter((token) => text.includes(token)).length;
  const behaviorHit = behaviorPattern.test(text);

  if (normalizedLevel === "HIGH" || score >= 0.74) {
    return { blocked: true, reason: "high_risk_score" };
  }
  if (normalizedLevel === "MEDIUM" && keywords.length >= 4 && (sentences.length >= 1 || behaviorHit)) {
    return { blocked: true, reason: "medium_with_dense_signals" };
  }
  if (criticalHits >= 3 && (behaviorHit || keywords.length >= 5)) {
    return { blocked: true, reason: "critical_content_pattern" };
  }

  return { blocked: false, reason: "allow" };
}

function serializeRequest(request) {
  if (!request) return null;
  return {
    id: request._id,
    requestID: request.requestID,
    employeeID: request.employeeID,
    employeeName: request.employeeName,
    role: request.role,
    department: request.department,
    documentID: request.documentID,
    documentName: request.documentName,
    documentDepartment: request.documentDepartment,
    sensitivityLevel: request.sensitivityLevel,
    status: request.status,
    riskScore: Number(request.riskScore || 0),
    otpExpiresAt: request.otpExpiresAt,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt,
    rejectedBy: request.rejectedBy,
    rejectedAt: request.rejectedAt,
    requestReason: request.requestReason,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
}

function getRoleValidatedDepartment(user, departmentInput) {
  if (user.role === "Admin" || user.role === "HR Manager") {
    return normalizeDepartment(departmentInput || user.department || "General");
  }
  return normalizeDepartment(user.department || "General");
}

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

async function findDocumentByParam(documentId) {
  const query = mongoose.Types.ObjectId.isValid(documentId)
    ? { $or: [{ _id: documentId }, { documentID: documentId }] }
    : { documentID: documentId };
  return Document.findOne(query);
}

function getRestrictedDownloadRisk(document) {
  const base = insiderThreatRisk(document, false);
  if (document.sensitivityLevel === "Top Secret") {
    return Math.min(1, Math.max(base, 0.92));
  }
  if (document.sensitivityLevel === "Confidential") {
    return Math.min(1, Math.max(base, 0.82));
  }
  return Math.min(1, Math.max(base, 0.72));
}

async function listDocuments(req, res) {
  await ensureDefaultDocuments();

  const documents = await Document.find().sort({ createdAt: -1 });
  const decorated = documents.map((doc) => {
    const access = canUserAccessDocument(req.user, doc);
    return {
      _id: doc._id,
      documentID: doc.documentID,
      name: doc.name,
      department: doc.department,
      sensitivityLevel: doc.sensitivityLevel,
      tags: doc.tags || [],
      viewAllowed: access.viewAllowed,
      downloadAllowed: access.downloadAllowed,
      requiresAdminApproval: access.requiresAdminApproval,
      isRoleMatch: access.isRoleMatch,
      accessAllowed: access.viewAllowed,
      accessReason: access.reason,
      contentPreview: summarizeContent(doc.content)
    };
  });

  return res.json({ documents: decorated });
}

async function createDocument(req, res) {
  await ensureDefaultDocuments();

  const { name = "", department = "", sensitivityLevel = "Internal", content = "" } = req.body || {};
  let parsedContent = String(content || "");
  if (req.file) {
    try {
      parsedContent = await parseUploadedText(req.file);
    } catch (error) {
      return res.status(400).json({ message: error.message || "Unsupported upload format." });
    }
  }
  const documentName = String(name || req.file?.originalname || "").trim();

  if (!documentName) {
    return res.status(400).json({ message: "Document name is required." });
  }

  if (!parsedContent.trim()) {
    return res.status(400).json({ message: "Document content is required. Upload a file or provide text content." });
  }

  const allowedSensitivity = ["Public", "Internal", "Confidential", "Top Secret"];
  const normalizedSensitivity = allowedSensitivity.includes(sensitivityLevel) ? sensitivityLevel : "Internal";
  const normalizedDepartment = getRoleValidatedDepartment(req.user, department);

  const mlResult = await detectMaliciousDocument(parsedContent.trim(), documentName);
  const riskScore = Number(mlResult.risk_score || 0);
  const riskLevel = String(mlResult.risk_level || "LOW").toUpperCase();
  const suspiciousKeywords = mlResult.suspicious_keywords || [];
  const suspiciousSentences = mlResult.suspicious_sentences || [];
  const threatEvaluation = evaluateDocumentThreat({
    riskLevel,
    riskScore,
    suspiciousKeywords,
    suspiciousSentences,
    content: parsedContent
  });
  const autoTags = inferDocumentTags({
    documentName,
    content: parsedContent,
    department: normalizedDepartment,
    sensitivityLevel: normalizedSensitivity,
    mlResult,
    riskScore
  });

  const detection = await DetectionResult.create({
    type: "Document",
    sourceName: documentName,
    prediction: riskLevel,
    riskScore,
    details: {
      ...mlResult,
      source: "employee_document_add_precheck",
      autoTags,
      blockReason: threatEvaluation.reason
    },
    createdBy: req.user.employeeID
  });

  if (threatEvaluation.blocked) {
    const warningSeverity = riskScore >= 0.85 ? "high" : "warning";
    await UserActivity.create({
      employeeID: req.user.employeeID,
      actionType: "upload",
      timestamp: new Date(),
      department: req.user.department,
      sensitivityLevel: normalizedSensitivity,
      metadata: {
        kind: "manual_document_create_blocked",
        detectionId: detection._id,
        documentName,
        riskScore: Number(riskScore.toFixed(2)),
        riskLevel
      }
    });

    await createAlert({
      type: "Malicious Document",
      severity: warningSeverity,
      employeeID: req.user.employeeID,
      riskScore: Number(riskScore.toFixed(2)),
      message: `Blocked document add for ${documentName}. Malicious content detected during pre-scan.`,
      metadata: {
        source: "employee_document_add_precheck",
        suspiciousKeywords,
        suspiciousSentences,
        blockReason: threatEvaluation.reason
      }
    });

    return res.status(403).json({
      message: "Document blocked. Malicious content detected during pre-scan.",
      warning: true,
      severity: warningSeverity,
      scan: {
        id: detection._id,
        fileName: documentName,
        riskLevel,
        riskScore: Number(riskScore.toFixed(2)),
        suspiciousKeywords,
        suspiciousSentences,
        blockReason: threatEvaluation.reason,
        autoTags
      }
    });
  }

  const document = await Document.create({
    name: documentName,
    department: normalizedDepartment || "General",
    sensitivityLevel: normalizedSensitivity,
    content: parsedContent.trim(),
    tags: autoTags,
    createdBy: req.user.employeeID
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "upload",
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: normalizedSensitivity,
    metadata: {
      kind: "manual_document_create",
      detectionId: detection._id,
      documentID: document.documentID,
      documentName: document.name,
      documentDepartment: document.department,
      riskScore: Number(riskScore.toFixed(2)),
      riskLevel
    }
  });

  return res.status(201).json({
    message: "Document scanned and added successfully.",
    document: {
      _id: document._id,
      documentID: document.documentID,
      name: document.name,
      department: document.department,
      sensitivityLevel: document.sensitivityLevel,
      tags: document.tags || [],
      contentPreview: summarizeContent(document.content)
    },
    scan: {
      id: detection._id,
      fileName: documentName,
      riskLevel,
      riskScore: Number(riskScore.toFixed(2)),
      suspiciousKeywords,
      suspiciousSentences,
      autoTags
    }
  });
}

async function accessDocument(req, res) {
  await ensureDefaultDocuments();

  const { documentId } = req.params;
  const action = normalizeAction(req.body?.action);

  const document = await findDocumentByParam(documentId);
  if (!document) {
    return res.status(404).json({ message: "Document not found." });
  }

  const access = canUserAccessDocument(req.user, document);

  if (action === "view") {
    const riskScore = access.isRoleMatch
      ? Math.max(0.08, insiderThreatRisk(document, true) * 0.75)
      : Math.min(1, Math.max(insiderThreatRisk(document, false), 0.58));
    const status = access.isRoleMatch ? "allowed" : "override";

    await AccessLog.create({
      employeeID: req.user.employeeID,
      role: req.user.role,
      documentName: document.name,
      action: "view",
      status,
      timestamp: new Date(),
      metadata: {
        documentID: document.documentID,
        sensitivityLevel: document.sensitivityLevel,
        accessReason: access.reason,
        isRoleMatch: access.isRoleMatch
      }
    });

    await UserActivity.create({
      employeeID: req.user.employeeID,
      actionType: "view",
      documentAccessed: document.name,
      timestamp: new Date(),
      department: req.user.department,
      sensitivityLevel: document.sensitivityLevel,
      metadata: {
        isRoleMatch: access.isRoleMatch
      }
    });

    if (!access.isRoleMatch) {
      await createAlert({
        type: "Insider Threat",
        severity: riskScore >= 0.78 ? "high" : "warning",
        employeeID: req.user.employeeID,
        riskScore,
        message: `${req.user.employeeID} viewed ${document.name} outside assigned role scope.`,
        metadata: {
          role: req.user.role,
          department: req.user.department,
          documentName: document.name,
          policy: access.reason,
          threatLevel: threatLevel(riskScore)
        }
      });
    }

    return res.json({
      message: access.isRoleMatch
        ? "Document opened."
        : "Cross-role view allowed with elevated monitoring. Download still requires admin OTP.",
      document: {
        documentID: document.documentID,
        name: document.name,
        department: document.department,
        sensitivityLevel: document.sensitivityLevel,
        content: document.content
      },
      policy: {
        viewAllowed: true,
        downloadAllowed: access.downloadAllowed,
        requiresAdminApproval: access.requiresAdminApproval,
        isRoleMatch: access.isRoleMatch,
        reason: access.reason
      },
      audit: {
        riskScore: Number(riskScore.toFixed(2)),
        threatLevel: threatLevel(riskScore)
      }
    });
  }

  if (action !== "download") {
    return res.status(400).json({ message: "Unsupported action. Use view or download." });
  }

  if (access.downloadAllowed) {
    const riskScore = Math.max(0.1, insiderThreatRisk(document, true) * 0.65);

    await AccessLog.create({
      employeeID: req.user.employeeID,
      role: req.user.role,
      documentName: document.name,
      action: "download",
      status: "allowed",
      timestamp: new Date(),
      metadata: {
        documentID: document.documentID,
        sensitivityLevel: document.sensitivityLevel,
        accessReason: access.reason,
        isRoleMatch: access.isRoleMatch
      }
    });

    await UserActivity.create({
      employeeID: req.user.employeeID,
      actionType: "download",
      documentAccessed: document.name,
      timestamp: new Date(),
      department: req.user.department,
      sensitivityLevel: document.sensitivityLevel,
      metadata: {
        isRoleMatch: access.isRoleMatch,
        approvedByPolicy: true
      }
    });

    return res.json({
      message: "Download authorized by role policy.",
      document: {
        documentID: document.documentID,
        name: document.name,
        department: document.department,
        sensitivityLevel: document.sensitivityLevel,
        content: document.content
      },
      audit: {
        riskScore: Number(riskScore.toFixed(2)),
        threatLevel: threatLevel(riskScore)
      }
    });
  }

  const requestRisk = getRestrictedDownloadRisk(document);

  await AccessLog.create({
    employeeID: req.user.employeeID,
    role: req.user.role,
    documentName: document.name,
    action: "download",
    status: "blocked",
    timestamp: new Date(),
    metadata: {
      documentID: document.documentID,
      sensitivityLevel: document.sensitivityLevel,
      accessReason: access.reason,
      requiresAdminApproval: true
    }
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "download",
    documentAccessed: document.name,
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: document.sensitivityLevel,
    metadata: {
      blocked: true,
      requiresAdminApproval: true
    }
  });

  await createAlert({
    type: "Insider Threat",
    severity: requestRisk >= 0.86 ? "high" : "warning",
    employeeID: req.user.employeeID,
    riskScore: requestRisk,
    message: `${req.user.employeeID} attempted restricted download of ${document.name}. Admin OTP approval required.`,
    metadata: {
      role: req.user.role,
      department: req.user.department,
      documentName: document.name,
      policy: access.reason,
      threatLevel: threatLevel(requestRisk),
      action: "download_request_needed"
    }
  });

  const existingRequest = await DocumentDownloadRequest.findOne({
    employeeID: req.user.employeeID,
    documentID: document.documentID,
    status: { $in: ["pending_admin", "otp_sent"] }
  }).sort({ createdAt: -1 });

  return res.status(403).json({
    message: "Download blocked by policy. Choose Request Admin to continue.",
    requiresAdminApproval: true,
    document: {
      documentID: document.documentID,
      name: document.name,
      department: document.department,
      sensitivityLevel: document.sensitivityLevel
    },
    existingRequest: serializeRequest(existingRequest),
    alert: {
      riskScore: Number(requestRisk.toFixed(2)),
      threatLevel: threatLevel(requestRisk)
    }
  });
}

async function requestRestrictedDownload(req, res) {
  await ensureDefaultDocuments();

  const { documentId } = req.params;
  const requestReason = String(req.body?.reason || "").trim();

  const document = await findDocumentByParam(documentId);
  if (!document) {
    return res.status(404).json({ message: "Document not found." });
  }

  const access = canUserAccessDocument(req.user, document);
  if (access.downloadAllowed) {
    return res.status(400).json({
      message: "This document is already allowed for direct download under your role."
    });
  }

  const existingRequest = await DocumentDownloadRequest.findOne({
    employeeID: req.user.employeeID,
    documentID: document.documentID,
    status: { $in: ["pending_admin", "otp_sent"] }
  }).sort({ createdAt: -1 });

  if (existingRequest) {
    return res.json({
      message:
        existingRequest.status === "otp_sent"
          ? "OTP already generated by admin. Check notifications."
          : "Approval request already pending admin review.",
      request: serializeRequest(existingRequest)
    });
  }

  const riskScore = getRestrictedDownloadRisk(document);
  const request = await DocumentDownloadRequest.create({
    employeeID: req.user.employeeID,
    employeeName: req.user.name || "",
    role: req.user.role,
    department: req.user.department || "",
    documentRef: document._id,
    documentID: document.documentID,
    documentName: document.name,
    documentDepartment: document.department,
    sensitivityLevel: document.sensitivityLevel,
    status: "pending_admin",
    requestReason,
    riskScore,
    metadata: {
      policyReason: access.reason
    }
  });

  await createAlert({
    type: "Insider Threat",
    severity: riskScore >= 0.86 ? "high" : "warning",
    employeeID: req.user.employeeID,
    riskScore,
    message: `${req.user.employeeID} requested admin approval to download ${document.name}.`,
    metadata: {
      requestID: request.requestID,
      documentName: document.name,
      action: "admin_approval_requested"
    }
  });

  await createAlert({
    type: "Behavior Anomaly",
    severity: "warning",
    employeeID: req.user.employeeID,
    riskScore: Number(Math.min(0.7, riskScore).toFixed(2)),
    message: `Download approval request submitted for ${document.name}. Waiting for admin action.`,
    metadata: {
      requestID: request.requestID,
      documentName: document.name,
      category: "document_download_request"
    }
  });

  return res.status(201).json({
    message: "Admin approval requested. Once approved, OTP will arrive in your notification bell.",
    request: serializeRequest(request)
  });
}

async function listMyDownloadRequests(req, res) {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
  const requests = await DocumentDownloadRequest.find({ employeeID: req.user.employeeID })
    .sort({ createdAt: -1 })
    .limit(limit);
  return res.json({
    requests: requests.map(serializeRequest)
  });
}

async function verifyDownloadOtp(req, res) {
  const { requestId } = req.params;
  const otp = String(req.body?.otp || "").trim();

  if (!otp) {
    return res.status(400).json({ message: "OTP is required." });
  }

  const query = mongoose.Types.ObjectId.isValid(requestId)
    ? { $or: [{ _id: requestId }, { requestID: requestId }] }
    : { requestID: requestId };

  const request = await DocumentDownloadRequest.findOne({
    ...query,
    employeeID: req.user.employeeID
  });

  if (!request) {
    return res.status(404).json({ message: "Download approval request not found." });
  }

  if (request.status === "pending_admin") {
    return res.status(409).json({ message: "Admin approval is still pending. Wait for OTP notification." });
  }

  if (request.status !== "otp_sent") {
    return res.status(409).json({ message: `Request is ${request.status}. OTP validation is not available.` });
  }

  if (!request.otpExpiresAt || new Date(request.otpExpiresAt).getTime() < Date.now()) {
    request.status = "expired";
    request.resolvedAt = new Date();
    await request.save();
    return res.status(410).json({ message: "OTP expired. Request admin approval again." });
  }

  if (hashOtp(otp) !== request.otpHash) {
    return res.status(400).json({ message: "Invalid OTP. Check latest notification and try again." });
  }

  const document = await Document.findById(request.documentRef);
  if (!document) {
    return res.status(404).json({ message: "Document no longer exists." });
  }

  request.status = "approved";
  request.resolvedAt = new Date();
  request.otpHash = null;
  await request.save();

  const riskScore = getRestrictedDownloadRisk(document);

  await AccessLog.create({
    employeeID: req.user.employeeID,
    role: req.user.role,
    documentName: document.name,
    action: "download",
    status: "override",
    timestamp: new Date(),
    metadata: {
      documentID: document.documentID,
      sensitivityLevel: document.sensitivityLevel,
      approvedByAdmin: true,
      requestID: request.requestID
    }
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "download",
    documentAccessed: document.name,
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: document.sensitivityLevel,
    metadata: {
      approvedByAdmin: true,
      requestID: request.requestID
    }
  });

  await createAlert({
    type: "Behavior Anomaly",
    severity: "low",
    employeeID: req.user.employeeID,
    riskScore: Number((riskScore * 0.55).toFixed(2)),
    message: `Restricted download approved via OTP for ${document.name}.`,
    metadata: {
      requestID: request.requestID,
      category: "document_download_approved"
    }
  });

  return res.json({
    message: "OTP verified. Download approved.",
    request: serializeRequest(request),
    document: {
      documentID: document.documentID,
      name: document.name,
      department: document.department,
      sensitivityLevel: document.sensitivityLevel,
      content: document.content
    },
    audit: {
      riskScore: Number(riskScore.toFixed(2)),
      threatLevel: threatLevel(riskScore)
    }
  });
}

async function listDownloadRequests(req, res) {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 80)));
  const status = normalizeRequestStatus(req.query.status);
  const filter = status ? { status } : { status: { $in: ["pending_admin", "otp_sent", "approved", "rejected"] } };

  const requests = await DocumentDownloadRequest.find(filter).sort({ createdAt: -1 }).limit(limit);
  return res.json({
    requests: requests.map(serializeRequest)
  });
}

async function approveDownloadRequest(req, res) {
  const { requestId } = req.params;
  const adminNote = String(req.body?.note || "").trim();

  const query = mongoose.Types.ObjectId.isValid(requestId)
    ? { $or: [{ _id: requestId }, { requestID: requestId }] }
    : { requestID: requestId };

  const request = await DocumentDownloadRequest.findOne(query);
  if (!request) {
    return res.status(404).json({ message: "Download request not found." });
  }

  if (["approved", "rejected", "cancelled"].includes(request.status)) {
    return res.status(409).json({ message: `Request already ${request.status}.` });
  }

  const otp = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  request.status = "otp_sent";
  request.otpHash = hashOtp(otp);
  request.otpExpiresAt = expiresAt;
  request.approvedBy = req.user.employeeID;
  request.approvedAt = new Date();
  request.rejectedAt = null;
  request.rejectedBy = null;
  request.metadata = {
    ...(request.metadata || {}),
    adminNote
  };
  await request.save();

  await createAlert({
    type: "Behavior Anomaly",
    severity: "warning",
    employeeID: request.employeeID,
    riskScore: Number(Math.min(0.7, request.riskScore).toFixed(2)),
    message: `Admin approved download request ${request.requestID}. OTP: ${otp}. Expires in ${OTP_TTL_MINUTES} minutes.`,
    metadata: {
      requestID: request.requestID,
      documentName: request.documentName,
      category: "document_download_otp",
      otpExpiresAt: expiresAt
    }
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "admin_alert",
    timestamp: new Date(),
    department: req.user.department,
    metadata: {
      action: "document_download_otp_approved",
      requestID: request.requestID,
      targetEmployeeID: request.employeeID,
      otpMasked: maskOtp(otp)
    }
  });

  return res.json({
    message: "Approval completed. OTP sent to employee notifications.",
    request: serializeRequest(request),
    otpPreview: otp
  });
}

async function rejectDownloadRequest(req, res) {
  const { requestId } = req.params;
  const note = String(req.body?.note || "").trim();

  const query = mongoose.Types.ObjectId.isValid(requestId)
    ? { $or: [{ _id: requestId }, { requestID: requestId }] }
    : { requestID: requestId };
  const request = await DocumentDownloadRequest.findOne(query);

  if (!request) {
    return res.status(404).json({ message: "Download request not found." });
  }

  if (["approved", "rejected", "cancelled"].includes(request.status)) {
    return res.status(409).json({ message: `Request already ${request.status}.` });
  }

  request.status = "rejected";
  request.rejectedBy = req.user.employeeID;
  request.rejectedAt = new Date();
  request.resolvedAt = new Date();
  request.otpHash = null;
  request.otpExpiresAt = null;
  request.metadata = {
    ...(request.metadata || {}),
    rejectionNote: note
  };
  await request.save();

  await createAlert({
    type: "Behavior Anomaly",
    severity: "warning",
    employeeID: request.employeeID,
    riskScore: Number(Math.min(0.75, request.riskScore).toFixed(2)),
    message: `Admin rejected download request ${request.requestID} for ${request.documentName}.`,
    metadata: {
      requestID: request.requestID,
      category: "document_download_rejected",
      note
    }
  });

  return res.json({
    message: "Request rejected.",
    request: serializeRequest(request)
  });
}

async function scanDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "Upload a PDF, DOCX, or TXT file as `file`." });
  }

  let text = "";
  try {
    text = await parseUploadedText(req.file);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unsupported upload format." });
  }
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
    metadata: { source: req.file.originalname, kind: "document_scan" }
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
};
