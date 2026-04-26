import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


DEFAULT_DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "role_misuse_dataset.csv"
KNOWN_ROLES = {"intern", "developer", "finance analyst", "hr manager", "employee", "admin"}

RESOURCE_DOMAIN_KEYWORDS = {
    "Finance": ["finance", "financial", "budget", "invoice", "audit", "ledger", "payroll", "forecast"],
    "HR": ["hr", "employee", "recruit", "salary", "benefit", "people", "hiring", "payroll"],
    "Engineering": ["engineering", "technical", "architecture", "code", "repository", "api", "source"],
    "Operations": ["operations", "runbook", "disaster", "continuity", "incident", "command"],
    "Product": ["product", "roadmap", "strategy", "alpha", "beta", "feature", "launch"],
    "Training": ["training", "onboarding", "learning", "guide", "handbook"],
    "Public": ["public", "announcement", "company overview", "general notice"],
}

SENSITIVE_TERMS = [
    "confidential",
    "top secret",
    "secret",
    "salary",
    "payroll",
    "database",
    "credential",
    "private key",
    "customer pii",
    "source code",
]

OFFICE_HOURS_START = int(os.getenv("OFFICE_HOURS_START", "9"))
OFFICE_HOURS_END = int(os.getenv("OFFICE_HOURS_END", "18"))


def clamp(value, min_value=0.0, max_value=1.0):
    return float(max(min_value, min(max_value, value)))


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


def normalize_text(value):
    return str(value or "").strip().lower()


def parse_binary_label(value):
    token = normalize_text(value)
    if token in {"1", "true", "yes", "suspicious", "malicious", "anomaly"}:
        return 1
    return 0


def normalize_role(role_value):
    role = normalize_text(role_value)
    if "admin" in role:
        return "admin"
    if "hr" in role:
        return "hr manager"
    if "finance" in role:
        return "finance analyst"
    if "developer" in role or "engineer" in role or "technical" in role:
        return "developer"
    if "intern" in role:
        return "intern"
    if role == "employee":
        return "employee"
    if "employee" in role:
        return "employee"
    return role


def allowed_domains_for_role(role_norm):
    if role_norm == "admin":
        return None
    if role_norm == "hr manager":
        return {"HR", "Training", "Public"}
    if role_norm == "finance analyst":
        return {"Finance", "Public", "Training"}
    if role_norm == "developer":
        return {"Engineering", "Public", "Training"}
    if role_norm == "intern":
        return {"Training", "Public"}
    if role_norm == "employee":
        return {"Public", "Training", "Engineering", "HR", "Finance", "Operations", "Product"}
    return {"Public", "Training"}


def infer_domains(resource_value):
    text = normalize_text(resource_value)
    domains = set()
    for domain, tokens in RESOURCE_DOMAIN_KEYWORDS.items():
        if any(token in text for token in tokens):
            domains.add(domain)
    return domains


def primary_domain(resource_value):
    domains = sorted(infer_domains(resource_value))
    return domains[0] if domains else "Unknown"


def contains_sensitive(resource_value):
    text = normalize_text(resource_value)
    return any(term in text for term in SENSITIVE_TERMS)


def policy_alignment(role_value, resource_value):
    role_norm = normalize_role(role_value)
    allowed = allowed_domains_for_role(role_norm)
    domains = infer_domains(resource_value)
    known_role = role_norm in KNOWN_ROLES

    if allowed is None:
        return {"known_role": known_role, "is_allowed": True, "is_violation": False}
    if not domains:
        return {"known_role": known_role, "is_allowed": True, "is_violation": False}

    is_allowed = any(domain in allowed for domain in domains)
    return {"known_role": known_role, "is_allowed": is_allowed, "is_violation": not is_allowed}


def policy_rule_risk(role_value, resource_value, hour_value, weekday_value):
    role_norm = normalize_role(role_value)
    alignment = policy_alignment(role_value, resource_value)
    sensitive = contains_sensitive(resource_value)
    off_hours = hour_value < OFFICE_HOURS_START or hour_value >= OFFICE_HOURS_END
    weekend = weekday_value >= 5

    risk = 0.08
    if alignment["is_violation"]:
        risk += 0.58
    if sensitive:
        risk += 0.14
    if off_hours:
        risk += 0.18
    if weekend:
        risk += 0.06

    if role_norm == "admin":
        risk *= 0.45
    elif alignment["known_role"] and alignment["is_allowed"] and not off_hours:
        risk *= 0.65

    return clamp(risk)


def hour_bucket(hour_value):
    if hour_value < 6:
        return "overnight"
    if hour_value < 9:
        return "early"
    if hour_value < 12:
        return "morning"
    if hour_value < 15:
        return "midday"
    if hour_value < 18:
        return "afternoon"
    if hour_value < 21:
        return "evening"
    return "night"


def build_feature_table(df):
    df = df.reset_index(drop=True).copy()
    parsed_ts = df["Timestamp"].apply(safe_timestamp)
    hours = parsed_ts.dt.hour.fillna(12).astype(int)
    weekdays = parsed_ts.dt.weekday.fillna(2).astype(int)

    role_norm = df["Role"].apply(normalize_role)
    domains = df["AccessedResource"].apply(primary_domain)
    sensitivity = df["AccessedResource"].apply(contains_sensitive).astype(int)
    off_hours = ((hours < OFFICE_HOURS_START) | (hours >= OFFICE_HOURS_END)).astype(int)
    weekend = (weekdays >= 5).astype(int)
    hour_buckets = hours.apply(hour_bucket)

    alignments = [
        policy_alignment(role_value, resource_value)
        for role_value, resource_value in zip(df["Role"], df["AccessedResource"])
    ]
    policy_violation = [int(item["is_violation"]) for item in alignments]
    known_role = [int(item["known_role"]) for item in alignments]

    return pd.DataFrame(
        {
            "role_norm": role_norm,
            "domain": domains,
            "hour_bucket": hour_buckets,
            "hour": hours,
            "weekday": weekdays,
            "off_hours": off_hours,
            "weekend": weekend,
            "sensitive": sensitivity,
            "policy_violation": policy_violation,
            "known_role": known_role,
        }
    )


def encode_features(feature_frame):
    categorical_cols = ["role_norm", "domain", "hour_bucket"]
    numeric_cols = ["off_hours", "weekend", "sensitive", "policy_violation", "known_role"]
    encoded_cat = pd.get_dummies(feature_frame[categorical_cols], prefix=categorical_cols)
    numeric_frame = feature_frame[numeric_cols].reset_index(drop=True).fillna(0)
    return pd.concat([encoded_cat.reset_index(drop=True), numeric_frame], axis=1)


def load_role_misuse_dataset(dataset_path=None, require_labels=True):
    resolved_path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH
    if not resolved_path.exists():
        raise FileNotFoundError(
            f"Role misuse dataset not found: {resolved_path}. "
            "Expected CSV columns: EmployeeID,Role,AccessedResource,Timestamp,label"
        )

    df = pd.read_csv(resolved_path).fillna("")
    required = {"EmployeeID", "Role", "AccessedResource", "Timestamp"}
    if require_labels:
        required.add("label")
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Role misuse dataset missing columns: {', '.join(sorted(missing))}")

    for col in ["EmployeeID", "Role", "AccessedResource", "Timestamp"]:
        df[col] = df[col].astype(str).str.strip()

    if "label" in df.columns:
        df["label"] = df["label"].apply(parse_binary_label).astype(int)

    df = df[df["EmployeeID"] != ""].reset_index(drop=True)
    if require_labels and df["label"].nunique() < 2:
        raise ValueError("Role misuse dataset must contain both label classes (0 and 1).")
    return df


def detect_role_misuse_rows(observed_df, reference_df):
    observed_df = observed_df.copy().fillna("")
    reference_df = reference_df.copy().fillna("")

    for col in ["EmployeeID", "Role", "AccessedResource", "Timestamp"]:
        if col not in observed_df.columns:
            observed_df[col] = ""
        if col not in reference_df.columns:
            reference_df[col] = ""

    observed_features = build_feature_table(observed_df)
    reference_features = build_feature_table(reference_df)

    merged_features = pd.concat(
        [
            reference_features.assign(_source="reference"),
            observed_features.assign(_source="observed"),
        ],
        ignore_index=True,
    )
    encoded_matrix = encode_features(merged_features)

    reference_mask = merged_features["_source"] == "reference"
    observed_mask = merged_features["_source"] == "observed"

    X_reference = encoded_matrix[reference_mask].to_numpy(dtype=float)
    X_observed = encoded_matrix[observed_mask].to_numpy(dtype=float)

    model = IsolationForest(n_estimators=320, contamination=0.1, random_state=42)
    model.fit(X_reference)

    raw_anomaly = -model.decision_function(X_observed)
    normalized_risk = normalize_scores(raw_anomaly)

    rows = []
    risk_scores = []
    predictions = []

    for idx, original_row in observed_df.iterrows():
        feature_row = observed_features.iloc[idx]
        raw_timestamp = str(original_row.get("Timestamp", "")).strip()
        ml_risk = clamp(normalized_risk[idx]) if len(normalized_risk) > idx else 0.2
        rule_risk = policy_rule_risk(
            original_row["Role"],
            original_row["AccessedResource"],
            int(feature_row["hour"]),
            int(feature_row["weekday"]),
        )
        alignment = policy_alignment(original_row["Role"], original_row["AccessedResource"])

        is_violation = bool(alignment["is_violation"])
        is_off_hours = bool(feature_row["off_hours"])
        is_sensitive = bool(feature_row["sensitive"])
        is_weekend = bool(feature_row["weekend"])
        role_norm = str(feature_row["role_norm"])
        hour_value = int(feature_row["hour"])

        if is_violation:
            combined_risk = clamp(max(rule_risk, (ml_risk * 0.4) + (rule_risk * 0.78)))
        else:
            combined_risk = clamp((ml_risk * 0.5) + (rule_risk * 0.45))
            if alignment["known_role"] and alignment["is_allowed"] and not is_off_hours and not is_sensitive:
                combined_risk *= 0.72

        if role_norm == "admin":
            combined_risk = min(combined_risk, 0.45)
        elif is_off_hours:
            combined_risk = clamp(max(combined_risk, 0.58 if is_sensitive else 0.52))

        if is_weekend and role_norm != "admin":
            combined_risk = clamp(max(combined_risk, 0.56))

        anomaly_extreme = ml_risk >= 0.88 and (is_off_hours or is_sensitive)
        after_hours_anomaly = is_off_hours and (is_sensitive or combined_risk >= 0.55)
        suspicious = is_violation or anomaly_extreme or after_hours_anomaly or combined_risk >= 0.68
        status = "Suspicious" if suspicious else "Normal"

        suspicious_signals = []
        if is_violation:
            suspicious_signals.append("role_policy_violation")
        if is_off_hours:
            suspicious_signals.append("after_office_hours_access")
        if is_weekend:
            suspicious_signals.append("weekend_access")
        if is_sensitive:
            suspicious_signals.append("sensitive_resource_access")
        if anomaly_extreme:
            suspicious_signals.append("model_extreme_anomaly")
        if not suspicious_signals:
            suspicious_signals.append("normal_pattern")

        work_timing = "office_hours"
        if is_weekend:
            work_timing = "weekend"
        elif is_off_hours:
            work_timing = "after_hours"

        rows.append(
            {
                "EmployeeID": str(original_row["EmployeeID"]),
                "Role": str(original_row["Role"]),
                "AccessedResource": str(original_row["AccessedResource"]),
                "Timestamp": raw_timestamp,
                "AccessHour": hour_value,
                "IsAfterOfficeHours": is_off_hours,
                "IsWeekend": is_weekend,
                "WorkTiming": work_timing,
                "SuspiciousSignals": suspicious_signals,
                "Risk Score": round(float(combined_risk), 2),
                "Status": status,
            }
        )
        risk_scores.append(float(combined_risk))
        predictions.append(1 if suspicious else 0)

    return {"rows": rows, "risk_scores": risk_scores, "predictions": predictions}


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

    observed_df = pd.DataFrame(records).fillna("")
    for col in ["EmployeeID", "Role", "AccessedResource", "Timestamp"]:
        if col not in observed_df.columns:
            observed_df[col] = ""

    dataset_path = payload.get("datasetPath")
    training_dataset = load_role_misuse_dataset(dataset_path=dataset_path, require_labels=True)
    normal_reference = training_dataset[training_dataset["label"] == 0]
    if len(normal_reference) < 20:
        normal_reference = training_dataset.copy()

    result = detect_role_misuse_rows(
        observed_df=observed_df[["EmployeeID", "Role", "AccessedResource", "Timestamp"]],
        reference_df=normal_reference[["EmployeeID", "Role", "AccessedResource", "Timestamp"]],
    )
    print(json.dumps({"rows": result["rows"]}))


if __name__ == "__main__":
    main()
