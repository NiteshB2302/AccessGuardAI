const dotenv = require("dotenv");
dotenv.config();

const connectMongoDB = require("../database/mongodb_connection");
const User = require("./models/User");
const Document = require("./models/Document");
const AccessLog = require("./models/AccessLog");
const UserActivity = require("./models/UserActivity");
const Alert = require("./models/Alert");
const DetectionResult = require("./models/DetectionResult");

async function seedUsers() {
  const existingAdmin = await User.findOne({ email: "admin@accessguard.ai" });
  if (!existingAdmin) {
    await User.create({
      name: "Security Admin",
      email: "admin@accessguard.ai",
      password: "Admin@123",
      role: "Admin",
      department: "Security"
    });
  }

  const users = [
    {
      name: "Nina HR",
      email: "hr@accessguard.ai",
      password: "Hr@123456",
      role: "HR Manager",
      department: "HR"
    },
    {
      name: "Dev Employee",
      email: "dev@accessguard.ai",
      password: "Emp@123456",
      role: "Employee",
      department: "Engineering"
    },
    {
      name: "Finance Employee",
      email: "finance@accessguard.ai",
      password: "Emp@123456",
      role: "Employee",
      department: "Finance"
    },
    {
      name: "Intern Employee",
      email: "intern@accessguard.ai",
      password: "Emp@123456",
      role: "Employee",
      department: "Intern"
    }
  ];

  for (const user of users) {
    const exists = await User.findOne({ email: user.email });
    if (!exists) {
      await User.create(user);
    }
  }
}

async function seedDocuments() {
  const demoDocs = [
    {
      name: "Financial_Report_2025.pdf",
      department: "Finance",
      sensitivityLevel: "Confidential",
      content: "Quarterly financial report including budget and forecast."
    },
    {
      name: "Secret_Product_Plan.pdf",
      department: "Product",
      sensitivityLevel: "Top Secret",
      content: "Secret launch strategy and partner roadmap."
    },
    {
      name: "HR_Salary_Data.xlsx",
      department: "HR",
      sensitivityLevel: "Confidential",
      content: "Salary and employee compensation information."
    },
    {
      name: "Internal_Strategy_Document.pdf",
      department: "Operations",
      sensitivityLevel: "Internal",
      content: "Internal strategy for next quarter."
    },
    {
      name: "Training_Guide.pdf",
      department: "Training",
      sensitivityLevel: "Public",
      content: "Training guide for all employees."
    },
    {
      name: "Engineering_Architecture.pdf",
      department: "Engineering",
      sensitivityLevel: "Internal",
      content: "System architecture and API references."
    },
    {
      name: "Finance_Budget_Forecast_2026.xlsx",
      department: "Finance",
      sensitivityLevel: "Confidential",
      content: "Projected budgets, cash flow, and quarterly forecast details."
    },
    {
      name: "Finance_Audit_Findings_2025.pdf",
      department: "Finance",
      sensitivityLevel: "Internal",
      content: "Internal audit findings and remediation plan for finance controls."
    },
    {
      name: "HR_Recruitment_Strategy_2026.docx",
      department: "HR",
      sensitivityLevel: "Internal",
      content: "Recruitment pipeline strategy and hiring KPIs."
    },
    {
      name: "Product_Roadmap_Alpha.pdf",
      department: "Product",
      sensitivityLevel: "Confidential",
      content: "Product alpha roadmap, milestones, and dependency risk register."
    },
    {
      name: "Operations_Disaster_Recovery_Plan.pdf",
      department: "Operations",
      sensitivityLevel: "Internal",
      content: "Disaster recovery procedures and continuity controls."
    }
  ];

  for (const doc of demoDocs) {
    const exists = await Document.findOne({ name: doc.name });
    if (!exists) {
      await Document.create(doc);
    }
  }
}

async function seedSecurityEvents() {
  const users = await User.find();
  const docs = await Document.find();
  if (!users.length || !docs.length) return;

  const sampleUser = users.find((u) => u.role === "Employee");
  const sampleDoc = docs.find((d) => d.sensitivityLevel === "Top Secret") || docs[0];

  const existingLog = await AccessLog.findOne();
  if (!existingLog && sampleUser && sampleDoc) {
    await AccessLog.create({
      employeeID: sampleUser.employeeID,
      role: sampleUser.role,
      documentName: sampleDoc.name,
      action: "download",
      status: "blocked",
      timestamp: new Date(Date.now() - 1000 * 60 * 30)
    });

    await Alert.create({
      type: "Insider Threat",
      severity: "high",
      message: `${sampleUser.employeeID} attempted to download ${sampleDoc.name}.`,
      employeeID: sampleUser.employeeID,
      riskScore: 0.92,
      metadata: {
        document: sampleDoc.name
      }
    });
  }

  const existingActivity = await UserActivity.findOne();
  if (!existingActivity && sampleUser) {
    await UserActivity.create({
      employeeID: sampleUser.employeeID,
      actionType: "login",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
      department: sampleUser.department
    });
  }

  const existingDetection = await DetectionResult.findOne();
  if (!existingDetection && sampleUser) {
    await DetectionResult.create({
      type: "Email",
      sourceName: "seed_email",
      prediction: "Phishing",
      riskScore: 0.89,
      details: {
        suspicious_keywords: ["verify account", "urgent payment"]
      },
      createdBy: sampleUser.employeeID
    });
  }
}

async function runSeed() {
  await connectMongoDB();
  await seedUsers();
  await seedDocuments();
  await seedSecurityEvents();
  // eslint-disable-next-line no-console
  console.log("Seed completed.");
  process.exit(0);
}

runSeed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", error.message);
  process.exit(1);
});
