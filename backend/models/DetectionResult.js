const mongoose = require("mongoose");

const detectionResultSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Document", "Email", "Role Misuse", "Behavior", "Data Exfiltration"],
      required: true
    },
    sourceName: {
      type: String,
      required: true
    },
    prediction: {
      type: String,
      required: true
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdBy: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("DetectionResult", detectionResultSchema);
