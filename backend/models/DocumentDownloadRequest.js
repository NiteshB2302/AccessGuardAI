const mongoose = require("mongoose");
const { getNextSequence } = require("../utils/sequence");

const documentDownloadRequestSchema = new mongoose.Schema(
  {
    requestID: {
      type: String,
      unique: true,
      index: true
    },
    employeeID: {
      type: String,
      required: true,
      index: true
    },
    employeeName: {
      type: String,
      default: ""
    },
    role: {
      type: String,
      required: true
    },
    department: {
      type: String,
      default: ""
    },
    documentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true
    },
    documentID: {
      type: String,
      required: true
    },
    documentName: {
      type: String,
      required: true
    },
    documentDepartment: {
      type: String,
      default: ""
    },
    sensitivityLevel: {
      type: String,
      enum: ["Public", "Internal", "Confidential", "Top Secret"],
      default: "Internal"
    },
    status: {
      type: String,
      enum: ["pending_admin", "otp_sent", "approved", "rejected", "cancelled", "expired"],
      default: "pending_admin",
      index: true
    },
    requestReason: {
      type: String,
      default: ""
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    otpHash: {
      type: String,
      default: null
    },
    otpExpiresAt: {
      type: Date,
      default: null
    },
    approvedBy: {
      type: String,
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    rejectedBy: {
      type: String,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

documentDownloadRequestSchema.pre("save", async function preSave(next) {
  if (this.isNew && !this.requestID) {
    let generatedID;
    let exists = true;
    while (exists) {
      // eslint-disable-next-line no-await-in-loop
      const sequence = await getNextSequence("documentRequestID");
      generatedID = `REQ${String(sequence).padStart(4, "0")}`;
      // eslint-disable-next-line no-await-in-loop
      exists = Boolean(await this.constructor.exists({ requestID: generatedID }));
    }
    this.requestID = generatedID;
  }
  next();
});

module.exports = mongoose.model("DocumentDownloadRequest", documentDownloadRequestSchema);
