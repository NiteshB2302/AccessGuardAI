import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


def safe_timestamp(value):
    try:
        return pd.to_datetime(value, utc=False, errors="coerce")
    except Exception:
        return pd.NaT


def normalize_scores(values):
    arr = np.array(values, dtype=float)
    if len(arr) == 0:
        return arr
    min_val = np.min(arr)
    max_val = np.max(arr)
    if np.isclose(min_val, max_val):
        return np.full_like(arr, 0.2, dtype=float)
    return (arr - min_val) / (max_val - min_val)


ROLE_RESOURCE_RULES = {
    "intern": ["training", "onboarding", "guide"],
    "developer": ["engineering", "technical", "architecture", "code", "repository"],
    "finance analyst": ["finance", "financial", "budget", "report", "invoice"],
    "finance": ["finance", "financial", "budget", "report", "invoice"],
    "hr manager": ["hr", "employee", "salary", "payroll", "records", "training", "guide", "onboarding"],
    "hr": ["hr", "employee", "salary", "payroll", "records", "training", "guide", "onboarding"],
}

SENSITIVE_TERMS = [
    "confidential",
    "secret",
    "top secret",
    "salary",
    "payroll",
    "database",
    "credential",
    "financial",
    "source code",
    "private key",
]


def policy_rule_risk(role, resource, hour):
    role_text = str(role).strip().lower()
    resource_text = str(resource).strip().lower()
    risk = 0.0

    matched_rule = None
    for known_role, allowed_tokens in ROLE_RESOURCE_RULES.items():
        if known_role in role_text:
            matched_rule = allowed_tokens
            break

    if matched_rule:
        if not any(token in resource_text for token in matched_rule):
            risk += 0.55
    else:
        # Unknown role: enforce lighter baseline policy check.
        if any(term in resource_text for term in SENSITIVE_TERMS):
            risk += 0.25

    if hour < 6 or hour > 22:
        risk += 0.2

    if any(term in resource_text for term in SENSITIVE_TERMS):
        risk += 0.15

    return float(min(1.0, risk))


def policy_alignment(role, resource):
    role_text = str(role).strip().lower()
    resource_text = str(resource).strip().lower()

    matched_rule = None
    for known_role, allowed_tokens in ROLE_RESOURCE_RULES.items():
        if known_role in role_text:
            matched_rule = allowed_tokens
            break

    if matched_rule is None:
        # Unknown role: neutral baseline, not a direct mismatch.
        return {
            "known_role": False,
            "is_allowed": True,
            "is_violation": False,
        }

    is_allowed = any(token in resource_text for token in matched_rule)
    return {
        "known_role": True,
        "is_allowed": is_allowed,
        "is_violation": not is_allowed,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    records = payload.get("records", [])
    if not records:
        print(json.dumps({"rows": []}))
        return

    df = pd.DataFrame(records).fillna("")
    for col in ["EmployeeID", "Role", "AccessedResource", "Timestamp"]:
        if col not in df.columns:
            df[col] = ""

    parsed_ts = df["Timestamp"].apply(safe_timestamp)
    df["hour"] = parsed_ts.dt.hour.fillna(12).astype(int)
    df["weekday"] = parsed_ts.dt.weekday.fillna(2).astype(int)

    emp_codes = pd.factorize(df["EmployeeID"].astype(str))[0]
    role_codes = pd.factorize(df["Role"].astype(str))[0]
    resource_codes = pd.factorize(df["AccessedResource"].astype(str))[0]

    X = np.column_stack([emp_codes, role_codes, resource_codes, df["hour"].values, df["weekday"].values])

    if len(df) >= 6:
        contamination = 0.22
        model = IsolationForest(n_estimators=220, contamination=contamination, random_state=42)
        model.fit(X)
        raw_anomaly = -model.decision_function(X)
        normalized_risk = normalize_scores(raw_anomaly)
        predictions = model.predict(X)
    else:
        # With very small uploads, anomaly models are unstable. Use conservative defaults.
        normalized_risk = np.full(len(df), 0.2)
        predictions = np.array([1] * len(df))

    rows = []
    for index, row in df.iterrows():
        ml_risk = float(np.clip(normalized_risk[index], 0.0, 1.0))
        rule_risk = policy_rule_risk(row["Role"], row["AccessedResource"], int(row["hour"]))
        alignment = policy_alignment(row["Role"], row["AccessedResource"])
        is_violation = bool(alignment["is_violation"])
        is_business_hours = 6 <= int(row["hour"]) <= 22

        # Hybrid scoring with false-positive damping for policy-compliant records.
        if is_violation:
            combined_risk = float(np.clip(max(rule_risk, ml_risk * 0.45 + rule_risk * 0.8), 0.0, 1.0))
        else:
            combined_risk = float(np.clip(ml_risk * 0.28 + rule_risk * 0.55, 0.0, 1.0))
            if alignment["known_role"] and alignment["is_allowed"] and is_business_hours:
                combined_risk *= 0.52

        anomaly_extreme = ml_risk >= 0.9 and (not is_business_hours or rule_risk >= 0.25)
        status = "Suspicious" if is_violation or anomaly_extreme or combined_risk >= 0.68 else "Normal"
        rows.append(
            {
                "EmployeeID": str(row["EmployeeID"]),
                "Role": str(row["Role"]),
                "AccessedResource": str(row["AccessedResource"]),
                "Risk Score": round(combined_risk, 2),
                "Status": status,
            }
        )

    print(json.dumps({"rows": rows}))


if __name__ == "__main__":
    main()
