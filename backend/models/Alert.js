const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "Insider Threat",
        "Role Misuse",
        "Malicious Document",
        "Phishing Email",
        "Behavior Anomaly",
        "Data Exfiltration"
      ],
      required: true
    },
    severity: {
      type: String,
      enum: ["low", "warning", "high"],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    employeeID: {
      type: String,
      default: null
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    status: {
      type: String,
      enum: ["open", "investigating", "closed"],
      default: "open"
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", alertSchema);
