const Document = require("../models/Document");

const DEFAULT_DOCUMENTS = [
  {
    documentID: "DOC001",
    name: "Financial_Report_2025.pdf",
    department: "Finance",
    sensitivityLevel: "Confidential",
    content: "Quarterly financial report including budget and forecast."
  },
  {
    documentID: "DOC002",
    name: "Secret_Product_Plan.pdf",
    department: "Product",
    sensitivityLevel: "Top Secret",
    content: "Secret launch strategy and partner roadmap."
  },
  {
    documentID: "DOC003",
    name: "HR_Salary_Data.xlsx",
    department: "HR",
    sensitivityLevel: "Confidential",
    content: "Salary and employee compensation information."
  },
  {
    documentID: "DOC004",
    name: "Internal_Strategy_Document.pdf",
    department: "Operations",
    sensitivityLevel: "Internal",
    content: "Internal strategy for next quarter."
  },
  {
    documentID: "DOC005",
    name: "Training_Guide.pdf",
    department: "Training",
    sensitivityLevel: "Public",
    content: "Training guide for all employees."
  },
  {
    documentID: "DOC006",
    name: "Engineering_Architecture.pdf",
    department: "Engineering",
    sensitivityLevel: "Internal",
    content: "System architecture and API references."
  },
  {
    documentID: "DOC007",
    name: "Finance_Budget_Forecast_2026.xlsx",
    department: "Finance",
    sensitivityLevel: "Confidential",
    content: "Projected budgets, cash flow, and quarterly forecast details."
  },
  {
    documentID: "DOC008",
    name: "Finance_Audit_Findings_2025.pdf",
    department: "Finance",
    sensitivityLevel: "Internal",
    content: "Internal audit findings and remediation plan for finance controls."
  },
  {
    documentID: "DOC009",
    name: "HR_Recruitment_Strategy_2026.docx",
    department: "HR",
    sensitivityLevel: "Internal",
    content: "Recruitment pipeline strategy and hiring KPIs."
  },
  {
    documentID: "DOC010",
    name: "Product_Roadmap_Alpha.pdf",
    department: "Product",
    sensitivityLevel: "Confidential",
    content: "Product alpha roadmap, milestones, and dependency risk register."
  },
  {
    documentID: "DOC011",
    name: "Operations_Disaster_Recovery_Plan.pdf",
    department: "Operations",
    sensitivityLevel: "Internal",
    content: "Disaster recovery procedures and continuity controls."
  }
];

async function ensureDefaultDocuments() {
  const currentCount = await Document.countDocuments();
  if (currentCount > 0) {
    return false;
  }

  try {
    await Document.insertMany(DEFAULT_DOCUMENTS, { ordered: false });
    return true;
  } catch (error) {
    // Ignore duplicate key races from concurrent bootstrap requests.
    if (error?.code === 11000 || Array.isArray(error?.writeErrors)) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  ensureDefaultDocuments
};
