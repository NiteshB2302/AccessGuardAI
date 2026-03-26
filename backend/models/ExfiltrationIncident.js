const mongoose = require("mongoose");

const exfiltrationIncidentSchema = new mongoose.Schema(
  {
    employeeID: {
      type: String,
      required: true,
      index: true
    },
    role: {
      type: String,
      required: true
    },
    department: {
      type: String,
      default: null
    },
    recipientEmail: {
      type: String,
      required: true
    },
    recipientDomain: {
      type: String,
      required: true
    },
    isExternalRecipient: {
      type: Boolean,
      default: true
    },
    subject: {
      type: String,
      default: ""
    },
    messageBody: {
      type: String,
      default: ""
    },
    documentID: {
      type: String,
      default: null
    },
    documentName: {
      type: String,
      default: null
    },
    documentDepartment: {
      type: String,
      default: null
    },
    sensitivityLevel: {
      type: String,
      enum: ["Public", "Internal", "Confidential", "Top Secret", null],
      default: null
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      required: true
    },
    threatLevel: {
      type: String,
      enum: ["Safe", "Warning", "High"],
      required: true
    },
    requiresOverride: {
      type: Boolean,
      default: false
    },
    hardBlocked: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: [
        "analyzed",
        "blocked_pending_override",
        "approval_requested",
        "sent",
        "sent_override",
        "cancelled",
        "investigating",
        "resolved",
        "blocked_by_policy"
      ],
      default: "analyzed"
    },
    scores: {
      similarity: { type: Number, min: 0, max: 1, default: 0 },
      sensitivity: { type: Number, min: 0, max: 1, default: 0 },
      external: { type: Number, min: 0, max: 1, default: 0 },
      chain: { type: Number, min: 0, max: 1, default: 0 },
      policyMismatch: { type: Number, min: 0, max: 1, default: 0 },
      keyword: { type: Number, min: 0, max: 1, default: 0 }
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    adminAction: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExfiltrationIncident", exfiltrationIncidentSchema);
