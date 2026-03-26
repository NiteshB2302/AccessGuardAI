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

function canUserAccessDocument(user, document) {
  if (!user || !document) {
    return { allowed: false, reason: "Invalid access context." };
  }

  if (user.role === "Admin") {
    return { allowed: true, reason: "Admin full access." };
  }

  if (document.sensitivityLevel === "Top Secret" && user.role !== "Admin") {
    return { allowed: false, reason: "Top Secret documents are admin-restricted." };
  }

  const userDept = normalizeDepartment(user.department);
  const docDept = normalizeDepartment(document.department);

  if (user.role === "HR Manager") {
    const hrAllowed = ["HR", "Training", "Public"];
    if (hrAllowed.includes(docDept) || document.sensitivityLevel === "Public") {
      return { allowed: true, reason: "HR manager allowed by policy." };
    }
  }

  if (user.role === "Employee") {
    if (document.sensitivityLevel === "Public") {
      return { allowed: true, reason: "Public document." };
    }

    if (docDept === userDept) {
      return { allowed: true, reason: "Department-matched access." };
    }
  }

  return {
    allowed: false,
    reason: `Department mismatch. ${user.department} role cannot access ${document.department} resources.`
  };
}

function getSensitivityRisk(sensitivityLevel) {
  return SENSITIVITY_RISK[sensitivityLevel] || 0.2;
}

module.exports = {
  RESOURCE_PERMISSIONS,
  SENSITIVITY_RISK,
  canUserAccessDocument,
  getSensitivityRisk
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
  return input;
}
