const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectMatchedKeywords(text, keywords) {
  const source = normalizeText(text);
  return keywords.filter((token) => source.includes(token));
}

function shouldUsePythonModels() {
  const explicit = String(process.env.USE_PYTHON_MODELS || "").toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return !process.env.VERCEL;
}

function allowJsFallback() {
  const value = String(process.env.ALLOW_JS_ML_FALLBACK || "true").toLowerCase();
  return value !== "false";
}

function runPythonModel(scriptName, payload) {
  const pythonPath = process.env.PYTHON_PATH || "python";
  const scriptPath = path.resolve(__dirname, "../../ml_models", scriptName);
  const tempFilePath = path.join(
    os.tmpdir(),
    `access-guard-ai-${Date.now()}-${Math.floor(Math.random() * 9999)}.json`
  );

  fs.writeFileSync(tempFilePath, JSON.stringify(payload), "utf8");

  return new Promise((resolve, reject) => {
    const processRunner = spawn(pythonPath, [scriptPath, tempFilePath], {
      cwd: path.resolve(__dirname, "../../")
    });

    let stdout = "";
    let stderr = "";

    processRunner.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    processRunner.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processRunner.on("close", (code) => {
      fs.unlink(tempFilePath, () => {});

      if (code !== 0) {
        return reject(new Error(stderr || `Python process failed for ${scriptName}`));
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        return resolve(parsed);
      } catch (error) {
        return reject(new Error(`Invalid ML output from ${scriptName}: ${stdout}`));
      }
    });

    processRunner.on("error", (error) => {
      fs.unlink(tempFilePath, () => {});
      reject(error);
    });
  });
}

function scoreToRiskLevel(score) {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}

function scoreToRiskLevelLower(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function roleMisuseFallback(payload = {}) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  const officeHoursStart = Number(process.env.OFFICE_HOURS_START || 9);
  const officeHoursEnd = Number(process.env.OFFICE_HOURS_END || 18);

  const roleRules = {
    intern: ["training", "onboarding", "guide"],
    "finance analyst": ["finance", "financial", "budget", "invoice", "audit", "report"],
    finance: ["finance", "financial", "budget", "invoice", "audit", "report"],
    developer: ["engineering", "technical", "architecture", "source", "code", "repository", "api"],
    engineer: ["engineering", "technical", "architecture", "source", "code", "repository", "api"],
    "hr manager": ["hr", "employee", "salary", "payroll", "records", "training", "onboarding", "guide"],
    hr: ["hr", "employee", "salary", "payroll", "records", "training", "onboarding", "guide"]
  };

  const sensitiveTerms = [
    "confidential",
    "top secret",
    "secret",
    "salary",
    "payroll",
    "credential",
    "database",
    "source code",
    "private key"
  ];

  const rows = records.map((entry) => {
    const employeeID = String(entry.EmployeeID || "").trim();
    const role = String(entry.Role || "").trim();
    const resource = String(entry.AccessedResource || "").trim();
    const roleText = normalizeText(role);
    const resourceText = normalizeText(resource);
    const hasSensitiveTerm = sensitiveTerms.some((term) => resourceText.includes(term));

    let risk = 0.18;

    const matchedRule = Object.entries(roleRules).find(([key]) => roleText.includes(key));
    if (matchedRule) {
      const allowedTokens = matchedRule[1];
      const isAllowed = allowedTokens.some((token) => resourceText.includes(token));
      if (!isAllowed) {
        risk += 0.58;
      }
    } else if (hasSensitiveTerm) {
      risk += 0.22;
    }

    const ts = new Date(entry.Timestamp || "");
    const hour = Number.isNaN(ts.getTime()) ? 12 : ts.getHours();
    const day = Number.isNaN(ts.getTime()) ? 2 : ts.getDay();
    const isWeekend = day === 0 || day === 6;
    const isAfterOfficeHours = hour < officeHoursStart || hour >= officeHoursEnd;

    if (isAfterOfficeHours) {
      risk += 0.18;
    }
    if (isWeekend) {
      risk += 0.06;
    }

    if (hasSensitiveTerm) {
      risk += 0.14;
    }

    const suspiciousSignals = [];
    if (matchedRule) {
      const allowedTokens = matchedRule[1];
      const isAllowed = allowedTokens.some((token) => resourceText.includes(token));
      if (!isAllowed) suspiciousSignals.push("role_policy_violation");
    }
    if (isAfterOfficeHours) suspiciousSignals.push("after_office_hours_access");
    if (isWeekend) suspiciousSignals.push("weekend_access");
    if (hasSensitiveTerm) {
      suspiciousSignals.push("sensitive_resource_access");
    }
    if (!suspiciousSignals.length) suspiciousSignals.push("normal_pattern");

    const finalRisk = Number(clamp(risk).toFixed(2));
    const workTiming = isWeekend ? "weekend" : isAfterOfficeHours ? "after_hours" : "office_hours";
    return {
      EmployeeID: employeeID,
      Role: role,
      AccessedResource: resource,
      Timestamp: String(entry.Timestamp || "").trim() || new Date().toISOString(),
      AccessHour: hour,
      IsAfterOfficeHours: isAfterOfficeHours,
      IsWeekend: isWeekend,
      WorkTiming: workTiming,
      SuspiciousSignals: suspiciousSignals,
      "Risk Score": finalRisk,
      Status: finalRisk >= 0.68 || (isAfterOfficeHours && finalRisk >= 0.55) ? "Suspicious" : "Normal"
    };
  });

  return { rows };
}

function documentFallback(payload = {}) {
  const text = String(payload.text || "");
  const fileName = String(payload.fileName || "");
  const content = normalizeText(text);

  if (!content) {
    return {
      risk_level: "LOW",
      risk_score: 0.05,
      suspicious_keywords: [],
      suspicious_sentences: []
    };
  }

  const keywordBank = [
    "confidential",
    "password",
    "database",
    "credentials",
    "top secret",
    "leak",
    "exfiltrate",
    "private key",
    "bypass",
    "customer pii",
    "source code",
    "unauthorized",
    "disable monitoring",
    "external account",
    "outside company",
    "steal",
    "dump",
    "export"
  ];
  const criticalKeywordBank = [
    "private key",
    "customer pii",
    "source code",
    "database",
    "credentials",
    "password",
    "top secret"
  ];
  const behaviorPatterns = [
    /bypass/,
    /disable monitoring/,
    /exfiltrat/,
    /unauthorized/,
    /steal|dump|export/,
    /external account|outside company|personal email/
  ];

  const suspiciousKeywords = collectMatchedKeywords(content, keywordBank);
  const criticalKeywordHits = collectMatchedKeywords(content, criticalKeywordBank).length;
  const suspiciousSentences = splitSentences(text).filter((sentence) => {
    const sentenceText = normalizeText(sentence);
    return keywordBank.some((token) => sentenceText.includes(token));
  });
  const behaviorHitCount = behaviorPatterns.filter((pattern) => pattern.test(content)).length;
  const benignContext = /training|awareness|internal education|policy guidance|simulated|example only/.test(content);

  const keywordScore = Math.min(suspiciousKeywords.length * 0.07, 0.42);
  const criticalScore = Math.min(criticalKeywordHits * 0.1, 0.3);
  const sentenceScore = Math.min(suspiciousSentences.length * 0.03, 0.12);
  const phraseBoost = behaviorHitCount >= 2 ? 0.24 : behaviorHitCount === 1 ? 0.14 : 0.03;
  const fileBoost = /\.(docx|pdf|txt)$/i.test(fileName) ? 0.02 : 0;
  const benignPenalty = benignContext && criticalKeywordHits <= 1 && behaviorHitCount === 0 ? 0.12 : 0;

  const score = Number(
    clamp(0.05 + keywordScore + criticalScore + sentenceScore + phraseBoost + fileBoost - benignPenalty).toFixed(2)
  );

  return {
    risk_level: scoreToRiskLevel(score),
    risk_score: score,
    suspicious_keywords: suspiciousKeywords,
    suspicious_sentences: suspiciousSentences.slice(0, 6)
  };
}

function emailFallback(payload = {}) {
  const content = String(payload.content || "");
  const normalized = normalizeText(content);

  const phishingKeywords = [
    "verify account",
    "urgent payment",
    "bank credentials",
    "confirm password",
    "security alert",
    "account suspension",
    "click this link"
  ];
  const spamKeywords = [
    "free",
    "win",
    "lottery",
    "bonus",
    "exclusive deal",
    "limited offer",
    "cheap"
  ];

  const phishingHits = collectMatchedKeywords(normalized, phishingKeywords);
  const spamHits = collectMatchedKeywords(normalized, spamKeywords);
  const suspiciousKeywords = [...new Set([...phishingHits, ...spamHits])];

  let prediction = "Safe";
  let confidence = 0.62;

  if (phishingHits.length > 0) {
    prediction = "Phishing";
    confidence = clamp(0.72 + phishingHits.length * 0.06);
  } else if (spamHits.length > 0) {
    prediction = "Spam";
    confidence = clamp(0.68 + spamHits.length * 0.05);
  }

  return {
    prediction,
    confidence: Number(confidence.toFixed(2)),
    suspicious_keywords: suspiciousKeywords
  };
}

function tokenizeForSimilarity(text) {
  const tokens = normalizeText(text).match(/[a-z0-9_]{4,}/g) || [];
  return new Set(tokens);
}

function jaccardSimilarity(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let intersect = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersect += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersect / union : 0;
}

function dataExfiltrationFallback(payload = {}) {
  const documentText = String(payload.documentText || "");
  const emailText = String(payload.emailText || "");
  const subject = String(payload.subject || "");
  const mergedText = `${subject}\n${emailText}`;

  const exfilKeywords = [
    "confidential",
    "secret",
    "salary",
    "payroll",
    "database",
    "credential",
    "source code",
    "private key",
    "customer data"
  ];

  const suspiciousKeywords = collectMatchedKeywords(mergedText, exfilKeywords);
  const docTokens = tokenizeForSimilarity(documentText);
  const emailTokens = tokenizeForSimilarity(mergedText);
  const similarityScore = clamp(jaccardSimilarity(docTokens, emailTokens));
  const keywordScore = Math.min(suspiciousKeywords.length * 0.12, 0.58);
  const urgencyBoost = /urgent|immediately|asap|external|outside/.test(normalizeText(mergedText)) ? 0.14 : 0.04;
  const contentRisk = clamp(similarityScore * 0.46 + keywordScore + urgencyBoost);

  const matchedSentences = splitSentences(mergedText).filter((sentence) => {
    const source = normalizeText(sentence);
    return exfilKeywords.some((token) => source.includes(token));
  });

  return {
    similarity_score: Number(similarityScore.toFixed(2)),
    suspicious_keywords: suspiciousKeywords,
    matched_sentences: matchedSentences.slice(0, 6),
    content_risk_score: Number(contentRisk.toFixed(2)),
    risk_level: scoreToRiskLevelLower(contentRisk)
  };
}

async function runModelWithFallback(scriptName, payload, fallbackFn) {
  if (!shouldUsePythonModels()) {
    return fallbackFn(payload);
  }

  try {
    return await runPythonModel(scriptName, payload);
  } catch (error) {
    if (!allowJsFallback()) {
      throw error;
    }

    // eslint-disable-next-line no-console
    console.warn(`[ML Fallback] ${scriptName} failed, using JS fallback: ${error.message}`);
    return fallbackFn(payload);
  }
}

async function detectRoleMisuse(records) {
  return runModelWithFallback("role_misuse_detector.py", { records }, roleMisuseFallback);
}

async function detectMaliciousDocument(text, fileName) {
  return runModelWithFallback("document_detector.py", { text, fileName }, documentFallback);
}

async function detectSpamEmail(content) {
  return runModelWithFallback("spam_email_detector.py", { content }, emailFallback);
}

async function detectDataExfiltration({ documentText, emailText, subject }) {
  return runModelWithFallback(
    "data_exfiltration_detector.py",
    {
      documentText,
      emailText,
      subject
    },
    dataExfiltrationFallback
  );
}

module.exports = {
  detectRoleMisuse,
  detectMaliciousDocument,
  detectSpamEmail,
  detectDataExfiltration
};
