const mongoose = require("mongoose");

const accessLogSchema = new mongoose.Schema(
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
    documentName: {
      type: String,
      required: true
    },
    action: {
      type: String,
      enum: ["view", "download"],
      required: true
    },
    status: {
      type: String,
      enum: ["allowed", "blocked", "override"],
      default: "allowed"
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model("AccessLog", accessLogSchema);
