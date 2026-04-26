const RESOURCE_PERMISSIONS = {
  Finance: ["Financial Reports"],
  HR: ["Employee Records"],
  Engineering: ["Technical Documentation"],
  Intern: ["Training Documents"],
  Product: ["Strategy Documents"]
};

const SENSITIVITY_RISK = {
  Public: 0.1,
  Internal: 0.35,
  Confidential: 0.65,
  "Top Secret": 0.95
};

function normalizeDepartment(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (["finance", "fiance", "financial"].includes(raw)) return "Finance";
  if (["hr", "human resources"].includes(raw)) return "HR";
  if (["engineering", "developer", "development"].includes(raw)) return "Engineering";
  if (["ops", "operations"].includes(raw)) return "Operations";
  if (["product"].includes(raw)) return "Product";
  if (["training", "learning"].includes(raw)) return "Training";
  if (["intern", "internship"].includes(raw)) return "Intern";
  if (["security"].includes(raw)) return "Security";
  if (["general", "common"].includes(raw)) return "General";
  return input;
}

function canUserAccessDocument(user, document) {
  if (!user || !document) {
    return {
      allowed: false,
      viewAllowed: false,
      downloadAllowed: false,
      requiresAdminApproval: false,
      isRoleMatch: false,
      reason: "Invalid access context."
    };
  }

  if (user.role === "Admin") {
    return {
      allowed: true,
      viewAllowed: true,
      downloadAllowed: true,
      requiresAdminApproval: false,
      isRoleMatch: true,
      reason: "Admin full access."
    };
  }

  const userDept = normalizeDepartment(user.department);
  const docDept = normalizeDepartment(document.department);
  const isPublic = document.sensitivityLevel === "Public";
  const isTopSecret = document.sensitivityLevel === "Top Secret";

  // All non-admin users can view documents. Cross-role viewing is monitored as risk.
  if (user.role === "HR Manager") {
    const hrRoleMatch = isPublic || ["HR", "Training"].includes(docDept);
    const canDownload = hrRoleMatch && !isTopSecret;
    return {
      allowed: true,
      viewAllowed: true,
      downloadAllowed: canDownload,
      requiresAdminApproval: !canDownload,
      isRoleMatch: hrRoleMatch,
      reason: canDownload
        ? "HR manager allowed by policy."
        : hrRoleMatch
          ? "Top Secret downloads require admin OTP approval."
          : "Cross-department download requires admin OTP approval."
    };
  }

  const employeeRoleMatch = isPublic || docDept === userDept;
  const canDownload = employeeRoleMatch && !isTopSecret;

  return {
    allowed: true,
    viewAllowed: true,
    downloadAllowed: canDownload,
    requiresAdminApproval: !canDownload,
    isRoleMatch: employeeRoleMatch,
    reason: canDownload
      ? "Department-matched access."
      : employeeRoleMatch
        ? "Top Secret downloads require admin OTP approval."
        : `Cross-department download requires admin OTP approval (${user.department} vs ${document.department}).`
  };
}

function getSensitivityRisk(sensitivityLevel) {
  return SENSITIVITY_RISK[sensitivityLevel] || 0.2;
}

module.exports = {
  RESOURCE_PERMISSIONS,
  SENSITIVITY_RISK,
  canUserAccessDocument,
  getSensitivityRisk,
  normalizeDepartment
};
