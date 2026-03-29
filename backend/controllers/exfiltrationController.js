const mongoose = require("mongoose");
const AccessLog = require("../models/AccessLog");
const Alert = require("../models/Alert");
const DetectionResult = require("../models/DetectionResult");
const Document = require("../models/Document");
const ExfiltrationIncident = require("../models/ExfiltrationIncident");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const { createAlert } = require("../services/alertService");
const { detectDataExfiltration } = require("../services/mlService");
const { getSensitivityRisk } = require("../services/permissionService");
const { threatLevel } = require("../services/riskEngine");

function clampRisk(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function parseRecipientDomain(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 ? parts[1] : "";
}

function normalizeDepartment(input) {
  const value = String(input || "").trim().toLowerCase();
  if (["finance", "fiance", "financial"].includes(value)) return "finance";
  if (["hr", "human resources"].includes(value)) return "hr";
  if (["engineering", "developer", "development"].includes(value)) return "engineering";
  if (["operations", "ops"].includes(value)) return "operations";
  if (["product"].includes(value)) return "product";
  if (["training", "learning"].includes(value)) return "training";
  if (["intern", "internship"].includes(value)) return "intern";
  return value;
}

function classifySeverity(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.55) return "warning";
  return "low";
}

async function findDocumentById(documentId) {
  if (!documentId) return null;
  const trimmed = String(documentId).trim();
  const query = mongoose.Types.ObjectId.isValid(trimmed)
    ? { $or: [{ _id: trimmed }, { documentID: trimmed }] }
    : { documentID: trimmed };
  return Document.findOne(query);
}

async function computeChainSignal(employeeID, documentName) {
  if (!documentName) {
    return {
      score: 0.15,
      recentAccessAt: null,
      minutesSinceAccess: null,
      matchedAccessType: null,
      inWindow: false
    };
  }

  const recentAccess = await AccessLog.findOne({
    employeeID,
    documentName,
    action: { $in: ["download", "view"] },
    status: { $in: ["allowed", "override"] }
  }).sort({ timestamp: -1 });

  if (!recentAccess) {
    return {
      score: 0.22,
      recentAccessAt: null,
      minutesSinceAccess: null,
      matchedAccessType: null,
      inWindow: false
    };
  }

  const now = Date.now();
  const diffMinutes = Math.max(0, (now - new Date(recentAccess.timestamp).getTime()) / (1000 * 60));
  const inThirtyMinutes = diffMinutes <= 30;
  const inSixHours = diffMinutes <= 360;

  const score = inThirtyMinutes ? 0.95 : inSixHours ? 0.72 : 0.44;
  return {
    score,
    recentAccessAt: recentAccess.timestamp,
    minutesSinceAccess: Number(diffMinutes.toFixed(1)),
    matchedAccessType: recentAccess.action,
    inWindow: inSixHours
  };
}

function buildRecommendation({ riskScore, requiresOverride, hardBlocked, isExternalRecipient }) {
  if (hardBlocked) {
    return "Transmission blocked by policy. Top-risk leakage pattern detected.";
  }
  if (requiresOverride) {
    return "High-risk transmission. Request admin approval or cancel.";
  }
  if (riskScore >= 0.45 || isExternalRecipient) {
    return "Proceed with caution and verify recipient intent before sending.";
  }
  return "Low risk. Transmission is within current policy baseline.";
}

async function analyzeSecureShare(req, res) {
  const { recipientEmail, subject = "", content = "", documentId = null } = req.body;

  const normalizedRecipient = String(recipientEmail || "").trim().toLowerCase();
  if (!normalizedRecipient || !normalizedRecipient.includes("@")) {
    return res.status(400).json({ message: "Valid recipientEmail is required." });
  }

  if (!String(content).trim()) {
    return res.status(400).json({ message: "Email content is required." });
  }

  const [document, existingHighIncidents] = await Promise.all([
    findDocumentById(documentId),
    ExfiltrationIncident.countDocuments({
      employeeID: req.user.employeeID,
      createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
      riskScore: { $gte: 0.72 }
    })
  ]);

  const recipientDomain = parseRecipientDomain(normalizedRecipient);
  const internalDomain = String(process.env.COMPANY_EMAIL_DOMAIN || "accessguard.ai").toLowerCase();
  const isExternalRecipient = !recipientDomain.endsWith(internalDomain);

  const mlResult = await detectDataExfiltration({
    documentText: document?.content || "",
    emailText: String(content),
    subject: String(subject)
  });

  const similarityScore = clampRisk(mlResult.similarity_score || 0);
  const keywordHits = Array.isArray(mlResult.suspicious_keywords) ? mlResult.suspicious_keywords : [];
  const keywordScore = clampRisk(Math.min(keywordHits.length / 6, 1));
  const sensitivityScore = clampRisk(getSensitivityRisk(document?.sensitivityLevel || "Internal"));
  const externalScore = isExternalRecipient ? 0.95 : 0.1;
  const policyMismatchScore =
    document &&
    normalizeDepartment(document.department) &&
    normalizeDepartment(req.user.department) &&
    normalizeDepartment(document.department) !== normalizeDepartment(req.user.department)
      ? 0.84
      : 0.12;

  const chainSignal = await computeChainSignal(req.user.employeeID, document?.name);
  const chainScore = clampRisk(chainSignal.score);

  let riskScore =
    similarityScore * 0.24 +
    sensitivityScore * 0.24 +
    externalScore * 0.2 +
    chainScore * 0.14 +
    policyMismatchScore * 0.08 +
    keywordScore * 0.1;

  if (isExternalRecipient && document?.sensitivityLevel === "Top Secret") {
    riskScore += 0.1;
  }
  if (existingHighIncidents > 0) {
    riskScore += 0.04;
  }
  riskScore = clampRisk(riskScore);

  const hardBlocked =
    (isExternalRecipient && document?.sensitivityLevel === "Top Secret") || riskScore >= 0.92;
  const requiresOverride =
    hardBlocked ||
    riskScore >= 0.64 ||
    (isExternalRecipient && (sensitivityScore >= 0.65 || similarityScore >= 0.55));
  const userThreatLevel = threatLevel(riskScore);
  const recommendation = buildRecommendation({
    riskScore,
    requiresOverride,
    hardBlocked,
    isExternalRecipient
  });

  const incident = await ExfiltrationIncident.create({
    employeeID: req.user.employeeID,
    role: req.user.role,
    department: req.user.department,
    recipientEmail: normalizedRecipient,
    recipientDomain,
    isExternalRecipient,
    subject: String(subject || ""),
    messageBody: String(content || ""),
    documentID: document?.documentID || null,
    documentName: document?.name || null,
    documentDepartment: document?.department || null,
    sensitivityLevel: document?.sensitivityLevel || null,
    riskScore: Number(riskScore.toFixed(2)),
    threatLevel: userThreatLevel,
    requiresOverride,
    hardBlocked,
    status: hardBlocked ? "blocked_by_policy" : requiresOverride ? "blocked_pending_override" : "analyzed",
    scores: {
      similarity: Number(similarityScore.toFixed(2)),
      sensitivity: Number(sensitivityScore.toFixed(2)),
      external: Number(externalScore.toFixed(2)),
      chain: Number(chainScore.toFixed(2)),
      policyMismatch: Number(policyMismatchScore.toFixed(2)),
      keyword: Number(keywordScore.toFixed(2))
    },
    evidence: {
      suspiciousKeywords: keywordHits,
      suspiciousSentences: mlResult.matched_sentences || [],
      modelRiskLevel: mlResult.risk_level || "LOW",
      contentRiskScore: clampRisk(mlResult.content_risk_score || 0),
      recentAccessAt: chainSignal.recentAccessAt,
      minutesSinceAccess: chainSignal.minutesSinceAccess,
      matchedAccessType: chainSignal.matchedAccessType,
      explanation: recommendation
    }
  });

  await DetectionResult.create({
    type: "Data Exfiltration",
    sourceName: document?.name || "secure_share_message",
    prediction: hardBlocked ? "Blocked" : requiresOverride ? "Suspicious" : "Safe",
    riskScore: Number(riskScore.toFixed(2)),
    details: {
      incidentId: incident._id,
      recipientEmail: normalizedRecipient,
      isExternalRecipient,
      documentName: document?.name || null,
      suspiciousKeywords: keywordHits,
      suspiciousSentences: mlResult.matched_sentences || []
    },
    createdBy: req.user.employeeID
  });

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "secure_share_scan",
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: document?.sensitivityLevel || null,
    metadata: {
      recipientEmail: normalizedRecipient,
      documentName: document?.name || null,
      riskScore: Number(riskScore.toFixed(2)),
      requiresOverride,
      hardBlocked
    }
  });

  if (requiresOverride || hardBlocked || riskScore >= 0.7) {
    await createAlert({
      type: "Data Exfiltration",
      severity: classifySeverity(riskScore),
      employeeID: req.user.employeeID,
      riskScore: Number(riskScore.toFixed(2)),
      message: `${req.user.employeeID} triggered secure-share data exfiltration guard for ${
        document?.name || "message content"
      }.`,
      metadata: {
        incidentId: incident._id,
        recipientEmail: normalizedRecipient,
        recipientDomain,
        isExternalRecipient,
        documentName: document?.name || null,
        suspiciousKeywords: keywordHits,
        recommendation
      }
    });
  }

  return res.json({
    message: "Secure share analysis completed.",
    incident: {
      id: incident._id,
      status: incident.status
    },
    analysis: {
      riskScore: Number(riskScore.toFixed(2)),
      threatLevel: userThreatLevel,
      requiresOverride,
      hardBlocked,
      recommendation,
      document: document
        ? {
            documentID: document.documentID,
            name: document.name,
            department: document.department,
            sensitivityLevel: document.sensitivityLevel
          }
        : null,
      recipient: {
        email: normalizedRecipient,
        domain: recipientDomain,
        isExternal: isExternalRecipient
      },
      suspiciousKeywords: keywordHits,
      suspiciousSentences: mlResult.matched_sentences || [],
      chain: {
        recentAccessAt: chainSignal.recentAccessAt,
        minutesSinceAccess: chainSignal.minutesSinceAccess,
        inHighRiskWindow: Boolean(chainSignal.inWindow),
        matchedAccessType: chainSignal.matchedAccessType
      },
      scoreBreakdown: {
        similarity: Number(similarityScore.toFixed(2)),
        sensitivity: Number(sensitivityScore.toFixed(2)),
        external: Number(externalScore.toFixed(2)),
        chain: Number(chainScore.toFixed(2)),
        policyMismatch: Number(policyMismatchScore.toFixed(2)),
        keyword: Number(keywordScore.toFixed(2))
      }
    }
  });
}

async function decideSecureShare(req, res) {
  const { incidentId } = req.params;
  const { decision } = req.body;

  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    return res.status(400).json({ message: "Invalid incident id." });
  }

  const validDecisions = ["send", "request_approval", "cancel"];
  if (!validDecisions.includes(decision)) {
    return res.status(400).json({ message: "Invalid decision." });
  }

  const incident = await ExfiltrationIncident.findOne({
    _id: incidentId,
    employeeID: req.user.employeeID
  });
  if (!incident) {
    return res.status(404).json({ message: "Incident not found." });
  }

  const finalRisk = Number(incident.riskScore || 0);
  const baseActivity = {
    employeeID: req.user.employeeID,
    timestamp: new Date(),
    department: req.user.department,
    sensitivityLevel: incident.sensitivityLevel || null
  };
  const adminApproved =
    incident.status === "approved_to_send" || incident.adminAction?.status === "approved_to_send";

  if (decision === "cancel") {
    incident.status = "cancelled";
    await incident.save();
    await UserActivity.create({
      ...baseActivity,
      actionType: "secure_share_cancel",
      metadata: {
        incidentId: incident._id,
        riskScore: finalRisk
      }
    });

    return res.json({
      message: "Transmission cancelled.",
      incident: { id: incident._id, status: incident.status }
    });
  }

  if (decision === "request_approval") {
    incident.status = "approval_requested";
    await incident.save();

    await UserActivity.create({
      ...baseActivity,
      actionType: "secure_share_request_approval",
      metadata: {
        incidentId: incident._id,
        riskScore: finalRisk
      }
    });

    await createAlert({
      type: "Data Exfiltration",
      severity: classifySeverity(Math.max(finalRisk, 0.65)),
      employeeID: req.user.employeeID,
      riskScore: Number(Math.max(finalRisk, 0.65).toFixed(2)),
      message: `${req.user.employeeID} requested admin approval for secure-share transmission.`,
      metadata: {
        incidentId: incident._id,
        recipientEmail: incident.recipientEmail,
        documentName: incident.documentName
      }
    });

    return res.json({
      message: "Approval request sent to admin security queue.",
      incident: { id: incident._id, status: incident.status }
    });
  }

  if (incident.hardBlocked && !adminApproved) {
    incident.status = "blocked_by_policy";
    await incident.save();
    await UserActivity.create({
      ...baseActivity,
      actionType: "secure_share_blocked",
      metadata: {
        incidentId: incident._id,
        riskScore: finalRisk,
        reason: "hard_block"
      }
    });
    return res.status(403).json({
      message: "Transmission blocked by policy.",
      incident: { id: incident._id, status: incident.status }
    });
  }

  if (decision === "send" && incident.requiresOverride && !adminApproved) {
    incident.status = "blocked_pending_override";
    await incident.save();
    await UserActivity.create({
      ...baseActivity,
      actionType: "secure_share_blocked",
      metadata: {
        incidentId: incident._id,
        riskScore: finalRisk,
        reason: "override_required"
      }
    });
    return res.status(403).json({
      message: "High-risk transmission requires override or approval.",
      incident: { id: incident._id, status: incident.status },
      requiresOverride: true
    });
  }

  const overrideUsed = false;
  incident.status = "sent";
  await incident.save();

  await UserActivity.create({
    ...baseActivity,
    actionType: "secure_share_send",
    metadata: {
      incidentId: incident._id,
      riskScore: finalRisk,
      overrideUsed
    }
  });

  if (overrideUsed || finalRisk >= 0.65) {
    await createAlert({
      type: "Data Exfiltration",
      severity: classifySeverity(overrideUsed ? Math.max(finalRisk, 0.82) : finalRisk),
      employeeID: req.user.employeeID,
      riskScore: Number((overrideUsed ? Math.max(finalRisk, 0.82) : finalRisk).toFixed(2)),
      message: `${req.user.employeeID} ${
        overrideUsed ? "sent with override" : "sent"
      } secure-share content to ${incident.recipientEmail}.`,
      metadata: {
        incidentId: incident._id,
        overrideUsed,
        recipientEmail: incident.recipientEmail,
        documentName: incident.documentName
      }
    });
  }

  return res.json({
    message: adminApproved ? "Email sent successfully after admin approval." : "Email sent successfully.",
    incident: {
      id: incident._id,
      status: incident.status
    },
    audit: {
      riskScore: Number(finalRisk.toFixed(2)),
      threatLevel: incident.threatLevel,
      overrideUsed
    }
  });
}

async function getMySecureShareIncidents(req, res) {
  const incidents = await ExfiltrationIncident.find({ employeeID: req.user.employeeID })
    .sort({ createdAt: -1 })
    .limit(120);
  return res.json({ incidents });
}

async function getExfiltrationIncidents(req, res) {
  const { status, employeeID } = req.query;
  const includeOrphans = String(req.query.includeOrphans || "false").toLowerCase() === "true";
  const minRisk = Number(req.query.minRisk || 0);
  const requestedLimit = Number(req.query.limit || 120);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 10), 400) : 120;

  const query = {};
  if (status) query.status = status;

  if (!includeOrphans) {
    const employeeIDs = await User.distinct("employeeID");
    const validSet = new Set(employeeIDs.map((item) => String(item).trim()));
    if (employeeID) {
      const normalizedEmployeeID = String(employeeID).trim();
      if (!validSet.has(normalizedEmployeeID)) {
        return res.json({ incidents: [] });
      }
      query.employeeID = normalizedEmployeeID;
    } else {
      query.employeeID = { $in: [...validSet] };
    }
  } else if (employeeID) {
    query.employeeID = String(employeeID).trim();
  }

  if (!Number.isNaN(minRisk) && minRisk > 0) {
    query.riskScore = { $gte: clampRisk(minRisk) };
  }

  const incidents = await ExfiltrationIncident.find(query).sort({ createdAt: -1 }).limit(limit);
  return res.json({ incidents });
}

async function updateExfiltrationIncidentStatus(req, res) {
  const { id } = req.params;
  const { status, note = "" } = req.body;
  const validStatuses = ["investigating", "resolved", "blocked_by_policy", "approved_to_send"];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid incident id." });
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid incident status." });
  }

  const incident = await ExfiltrationIncident.findById(id);
  if (!incident) {
    return res.status(404).json({ message: "Incident not found." });
  }

  incident.status = status;
  incident.adminAction = {
    by: req.user.employeeID,
    at: new Date(),
    status,
    note
  };
  await incident.save();

  await UserActivity.create({
    employeeID: req.user.employeeID,
    actionType: "secure_share_admin_action",
    timestamp: new Date(),
    department: req.user.department,
    metadata: {
      incidentId: incident._id,
      targetEmployeeID: incident.employeeID,
      status,
      note
    }
  });

  if (status === "blocked_by_policy") {
    await createAlert({
      type: "Data Exfiltration",
      severity: "high",
      employeeID: incident.employeeID,
      riskScore: Number(Math.max(incident.riskScore || 0, 0.86).toFixed(2)),
      message: `Admin blocked secure-share incident ${incident._id} for ${incident.employeeID}.`,
      metadata: {
        incidentId: incident._id,
        actionBy: req.user.employeeID,
        note
      }
    });
  } else if (status === "resolved") {
    await Alert.updateMany(
      {
        type: "Data Exfiltration",
        "metadata.incidentId": incident._id,
        status: { $in: ["open", "investigating"] }
      },
      { $set: { status: "closed" } }
    );
  } else if (status === "approved_to_send") {
    await createAlert({
      type: "Data Exfiltration",
      severity: "warning",
      employeeID: incident.employeeID,
      riskScore: Number(Math.max(incident.riskScore || 0, 0.5).toFixed(2)),
      message: `Admin approved secure-share transmission for incident ${incident._id}.`,
      metadata: {
        incidentId: incident._id,
        actionBy: req.user.employeeID,
        note
      }
    });
  }

  return res.json({
    message: "Incident status updated.",
    incident
  });
}

module.exports = {
  analyzeSecureShare,
  decideSecureShare,
  getMySecureShareIncidents,
  getExfiltrationIncidents,
  updateExfiltrationIncidentStatus
};
