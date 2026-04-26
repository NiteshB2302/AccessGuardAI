const fs = require("fs");
const path = require("path");
const Document = require("../models/Document");

const LIBRARY_ROOT = path.resolve(__dirname, "../../test_samples/document_library");

function loadSeedText(fileName, fallbackText) {
  try {
    const filePath = path.join(LIBRARY_ROOT, fileName);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    }
  } catch (error) {
    // Ignore read failures and use fallback content.
  }
  return fallbackText;
}

const DEFAULT_DOCUMENTS = [
  {
    documentID: "DOC001",
    name: "Finance_Q1_Operating_Brief.txt",
    department: "Finance",
    sensitivityLevel: "Confidential",
    content: loadSeedText("finance_q1_operating_brief.txt", "Finance operating brief.")
  },
  {
    documentID: "DOC002",
    name: "Finance_Audit_Observation_Log.txt",
    department: "Finance",
    sensitivityLevel: "Internal",
    content: loadSeedText("finance_audit_observation_log.txt", "Finance audit observations.")
  },
  {
    documentID: "DOC003",
    name: "HR_Compensation_Policy_2026.txt",
    department: "HR",
    sensitivityLevel: "Confidential",
    content: loadSeedText("hr_compensation_policy_2026.txt", "HR compensation policy.")
  },
  {
    documentID: "DOC004",
    name: "HR_Recruitment_Pipeline_Q2.txt",
    department: "HR",
    sensitivityLevel: "Internal",
    content: loadSeedText("hr_recruitment_pipeline_q2.txt", "HR recruitment pipeline.")
  },
  {
    documentID: "DOC005",
    name: "Engineering_Architecture_Change_Log.txt",
    department: "Engineering",
    sensitivityLevel: "Internal",
    content: loadSeedText("engineering_architecture_change_log.txt", "Engineering architecture updates.")
  },
  {
    documentID: "DOC006",
    name: "Product_Launch_Readiness_Report.txt",
    department: "Product",
    sensitivityLevel: "Confidential",
    content: loadSeedText("product_launch_readiness_report.txt", "Product launch report.")
  },
  {
    documentID: "DOC007",
    name: "Operations_Disaster_Recovery_Runbook.txt",
    department: "Operations",
    sensitivityLevel: "Internal",
    content: loadSeedText("operations_disaster_recovery_runbook.txt", "Operations DR runbook.")
  },
  {
    documentID: "DOC008",
    name: "Training_Security_Awareness_Playbook.txt",
    department: "Training",
    sensitivityLevel: "Public",
    content: loadSeedText("training_security_awareness_playbook.txt", "Security training playbook.")
  },
  {
    documentID: "DOC009",
    name: "Employee_Handbook_Public.txt",
    department: "General",
    sensitivityLevel: "Public",
    content: loadSeedText("employee_handbook_public.txt", "Employee handbook.")
  },
  {
    documentID: "DOC010",
    name: "Executive_Strategy_Memo_Top_Secret.txt",
    department: "Product",
    sensitivityLevel: "Top Secret",
    content: loadSeedText("executive_strategy_top_secret.txt", "Top secret strategy memo.")
  }
];

async function ensureDefaultDocuments() {
  const operations = DEFAULT_DOCUMENTS.map((doc) => ({
    updateOne: {
      filter: { documentID: doc.documentID },
      update: { $set: doc },
      upsert: true
    }
  }));

  const result = await Document.bulkWrite(operations, { ordered: false });
  return (result.upsertedCount || 0) > 0;
}

module.exports = {
  ensureDefaultDocuments
};
