const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema(
  {
    employeeID: {
      type: String,
      required: true,
      index: true
    },
    loginTime: {
      type: Date,
      default: null
    },
    documentAccessed: {
      type: String,
      default: null
    },
    actionType: {
      type: String,
      enum: [
        "login",
        "view",
        "download",
        "upload",
        "email_scan",
        "secure_share_scan",
        "secure_share_send",
        "secure_share_blocked",
        "secure_share_request_approval",
        "secure_share_cancel",
        "secure_share_admin_action",
        "role_misuse_scan",
        "admin_alert",
        "account_block",
        "account_unblock"
      ],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    department: {
      type: String,
      default: null
    },
    sensitivityLevel: {
      type: String,
      enum: ["Public", "Internal", "Confidential", "Top Secret", null],
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model("UserActivity", userActivitySchema);
