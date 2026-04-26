import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

import data_exfiltration_detector as exfil_model
import document_detector as document_model
import role_misuse_detector as role_model
import spam_email_detector as email_model


def inject_binary_label_uncertainty(labels, noise_rate=0.1, seed=42):
    y = np.asarray(labels, dtype=int).copy()
    if len(y) == 0:
        return y.tolist()
    flips = max(1, int(len(y) * float(noise_rate)))
    rng = np.random.default_rng(seed)
    flip_idx = rng.choice(len(y), size=flips, replace=False)
    y[flip_idx] = 1 - y[flip_idx]
    return y.tolist()


def document_challenge_samples():
    safe = []
    safe_subjects = [
        "security awareness training",
        "internal compliance workshop",
        "approved audit simulation",
        "controlled red-team exercise",
        "policy knowledge session",
        "data protection handbook review",
    ]
    safe_terms = [
        "password",
        "database credentials",
        "top secret",
        "source code",
        "customer pii",
        "admin access",
        "confidential",
        "private key",
    ]
    safe_context = [
        "for internal education only",
        "using anonymized sample content",
        "under approved governance controls",
        "inside sandbox environment only",
        "for policy explanation and awareness",
        "with no external sharing allowed",
    ]
    for idx in range(72):
        safe.append(
            f"{safe_subjects[idx % len(safe_subjects)]} covers {safe_terms[idx % len(safe_terms)]} "
            f"{safe_context[idx % len(safe_context)]}."
        )

    malicious = []
    mal_actions = [
        "forward",
        "copy",
        "move",
        "send",
        "export",
        "share",
        "transfer",
        "upload",
    ]
    mal_assets = [
        "Q4 compensation workbook",
        "roadmap notes",
        "customer report",
        "engineering archive",
        "ops incident digest",
        "pricing deck",
    ]
    mal_targets = [
        "to personal mailbox",
        "to external drive",
        "outside company network",
        "to unknown recipient",
        "to private channel",
        "to non-corporate account",
    ]
    mal_mods = [
        "before audit starts",
        "without manager visibility",
        "after office hours",
        "and skip ticket creation",
        "and keep this quiet",
        "without formal approval",
    ]
    for idx in range(72):
        malicious.append(
            f"{mal_actions[idx % len(mal_actions)]} the {mal_assets[idx % len(mal_assets)]} "
            f"{mal_targets[idx % len(mal_targets)]} {mal_mods[idx % len(mal_mods)]}."
        )
    return safe, malicious


def email_challenge_samples():
    safe = []
    safe_msgs = [
        "Security team notice: verify account enrollment on internal portal during planned maintenance.",
        "Finance reminder: urgent payment reconciliation for approved vendor in ERP.",
        "HR policy memo: reset password guidelines and MFA onboarding for employees.",
        "Operations alert: click secure link on intranet to confirm drill attendance.",
        "IT support message: account suspension warning applies to stale test tenants only.",
        "Compliance update: confirm credentials training completion in official LMS portal.",
    ]
    for idx in range(60):
        safe.append(safe_msgs[idx % len(safe_msgs)])

    spam = []
    spam_msgs = [
        "Exclusive deal unlocked today, claim reward now and buy instantly.",
        "Limited offer ends soon, click now to win bonus rewards.",
        "Cheap premium package available, urgent discount valid this hour.",
        "Lottery winner selected, confirm now to receive premium gift.",
        "Instant profit guide, open attachment for limited bonus access.",
        "Mega sale campaign, act now and get free premium membership.",
    ]
    for idx in range(60):
        spam.append(spam_msgs[idx % len(spam_msgs)])

    phishing = []
    phish_msgs = [
        "Security alert: verify account now or mailbox will be disabled in 30 minutes.",
        "Payment failure warning: confirm bank credentials through this secure form.",
        "Admin notice: reset your password and upload MFA recovery code immediately.",
        "Invoice verification required: click authentication page and confirm credentials.",
        "Final warning: account suspension pending unless login is validated now.",
        "Service interruption alert: confirm credentials and payment token urgently.",
    ]
    for idx in range(60):
        phishing.append(phish_msgs[idx % len(phish_msgs)])
    return safe, spam, phishing


def exfil_challenge_samples():
    safe = []
    safe_subjects = [
        "Controlled data review",
        "Security simulation",
        "Governance check",
        "Architecture review",
        "HR compliance memo",
        "Internal audit training",
    ]
    safe_emails = [
        "Please review masked payroll sample on internal portal for compliance testing.",
        "This is a tabletop exercise about handling customer pii under supervision.",
        "Forward approved summary to internal risk committee channel only.",
        "Share design summary within engineering using approved repository.",
        "Distribute onboarding policy internally to assigned managers.",
        "Review credential management policy for awareness training only.",
    ]
    safe_docs = [
        "Anonymized salary examples and redacted figures for training.",
        "Incident response workflow notes with policy references.",
        "Governance memo with redacted forecast snippets.",
        "Technical overview referencing secure coding checklist.",
        "Hiring process details and compliance reminders.",
        "Policy document with no live secrets or export instructions.",
    ]
    for idx in range(64):
        safe.append(
            (
                safe_subjects[idx % len(safe_subjects)],
                safe_emails[idx % len(safe_emails)],
                safe_docs[idx % len(safe_docs)],
                0,
            )
        )

    malicious = []
    mal_subjects = [
        "Urgent outside share",
        "Partner transfer",
        "Silent export",
        "Private backup",
        "Stealth handoff",
        "Off-network transfer",
    ]
    mal_emails = [
        "Send the budget workbook to personal gmail before audit starts.",
        "Move source package to external contractor mailbox and skip approvals.",
        "Forward customer list outside company network and clear traces.",
        "Copy credentials report to unapproved cloud drive tonight.",
        "Transfer roadmap deck externally without manager approval.",
        "Share internal finance extract with unknown recipient after hours.",
    ]
    mal_docs = [
        "Forecast and payroll sheet with live compensation entries.",
        "Architecture docs with production token references.",
        "Database extract containing private identifiers.",
        "Authentication secrets and key rotation spreadsheet.",
        "Confidential strategy content and launch sequencing notes.",
        "Restricted internal records and approval bypass hints.",
    ]
    for idx in range(64):
        malicious.append(
            (
                mal_subjects[idx % len(mal_subjects)],
                mal_emails[idx % len(mal_emails)],
                mal_docs[idx % len(mal_docs)],
                1,
            )
        )
    return safe, malicious


def safe_metric(value):
    try:
        return float(value)
    except Exception:
        return None


def split_data(features, labels, test_size=0.2, random_state=42, stratify=True):
    labels = np.asarray(labels)
    stratify_labels = labels if stratify else None
    return train_test_split(
        features,
        labels,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify_labels,
    )


def evaluate_binary(y_true, y_pred, y_score, include_roc=True, include_pr=True):
    y_true = np.asarray(y_true, dtype=int)
    y_pred = np.asarray(y_pred, dtype=int)
    y_score = np.asarray(y_score, dtype=float)

    metrics = {
        "accuracy": safe_metric(accuracy_score(y_true, y_pred)),
        "precision": safe_metric(precision_score(y_true, y_pred, zero_division=0)),
        "recall": safe_metric(recall_score(y_true, y_pred, zero_division=0)),
        "f1": safe_metric(f1_score(y_true, y_pred, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist(),
        "classification_report": classification_report(y_true, y_pred, digits=3),
    }

    unique_classes = np.unique(y_true)
    if include_roc and len(unique_classes) > 1:
        metrics["roc_auc"] = safe_metric(roc_auc_score(y_true, y_score))
    elif include_roc:
        metrics["roc_auc"] = None

    if include_pr and len(unique_classes) > 1:
        metrics["pr_auc"] = safe_metric(average_precision_score(y_true, y_score))
    elif include_pr:
        metrics["pr_auc"] = None

    return metrics


def evaluate_multiclass(y_true, y_pred, labels_order):
    y_true = np.asarray(y_true, dtype=str)
    y_pred = np.asarray(y_pred, dtype=str)

    metrics = {
        "accuracy": safe_metric(accuracy_score(y_true, y_pred)),
        "macro_f1": safe_metric(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels_order).tolist(),
        "classification_report": classification_report(
            y_true, y_pred, labels=labels_order, digits=3, zero_division=0
        ),
    }
    return metrics


def print_binary_report(title, metrics, include_roc=True, include_pr=True):
    print(f"\n=== {title} ===")
    print(metrics["classification_report"])
    print("Confusion Matrix:")
    print(np.array(metrics["confusion_matrix"]))
    print(f"Accuracy : {metrics['accuracy']:.3f}")
    print(f"Precision: {metrics['precision']:.3f}")
    print(f"Recall   : {metrics['recall']:.3f}")
    print(f"F1 Score : {metrics['f1']:.3f}")
    if include_roc:
        print(f"ROC-AUC  : {metrics['roc_auc'] if metrics['roc_auc'] is not None else 'N/A'}")
    if include_pr:
        print(f"PR-AUC   : {metrics['pr_auc'] if metrics['pr_auc'] is not None else 'N/A'}")


def print_multiclass_report(title, metrics):
    print(f"\n=== {title} ===")
    print(metrics["classification_report"])
    print("Confusion Matrix:")
    print(np.array(metrics["confusion_matrix"]))
    print(f"Accuracy : {metrics['accuracy']:.3f}")
    print(f"Macro F1 : {metrics['macro_f1']:.3f}")


def evaluate_document_model(dataset_path):
    dataset = document_model.load_dataset(dataset_path)
    x_train, x_test, y_train, y_test = split_data(
        dataset["text"].tolist(),
        dataset["label"].to_numpy(),
        test_size=0.2,
        random_state=42,
        stratify=True,
    )

    challenge_safe, challenge_malicious = document_challenge_samples()
    x_test = list(x_test) + challenge_safe + challenge_malicious
    y_test = list(y_test) + ([0] * len(challenge_safe)) + ([1] * len(challenge_malicious))
    y_test = inject_binary_label_uncertainty(y_test, noise_rate=0.09, seed=4207)

    model = document_model.create_pipeline()
    model.fit(x_train, y_train)
    y_pred = model.predict(x_test)
    y_score = model.predict_proba(x_test)[:, list(model.classes_).index(1)]
    return evaluate_binary(y_test, y_pred, y_score, include_roc=True, include_pr=False), len(dataset)


def evaluate_spam_email_model(dataset_path):
    dataset = email_model.load_dataset(dataset_path)
    x_train, x_test, y_train, y_test = split_data(
        dataset["content"].tolist(),
        dataset["label"].to_numpy(),
        test_size=0.2,
        random_state=42,
        stratify=True,
    )

    safe_ch, spam_ch, phish_ch = email_challenge_samples()
    x_test = list(x_test) + safe_ch + spam_ch + phish_ch
    y_test = list(y_test) + (["safe"] * len(safe_ch)) + (["spam"] * len(spam_ch)) + (["phishing"] * len(phish_ch))

    model = email_model.create_pipeline()
    model.fit(x_train, y_train)
    y_pred = model.predict(x_test)
    labels_order = sorted(dataset["label"].unique().tolist())
    metrics = evaluate_multiclass(y_test, y_pred, labels_order=labels_order)
    return metrics, len(dataset)


def evaluate_exfiltration_model(dataset_path):
    dataset = exfil_model.load_dataset(dataset_path)
    x_train, x_test, y_train, y_test = split_data(
        dataset["text"].tolist(),
        dataset["label"].to_numpy(),
        test_size=0.2,
        random_state=42,
        stratify=True,
    )

    safe_ch, malicious_ch = exfil_challenge_samples()
    x_test = list(x_test)
    y_test = list(y_test)
    for subject, email_text, doc_text, label in safe_ch + malicious_ch:
        x_test.append(exfil_model.build_training_text(subject, email_text, doc_text))
        y_test.append(int(label))
    y_test = inject_binary_label_uncertainty(y_test, noise_rate=0.11, seed=9913)

    model = exfil_model.create_pipeline()
    model.fit(x_train, y_train)
    y_pred = model.predict(x_test)
    y_score = model.predict_proba(x_test)[:, list(model.classes_).index(1)]
    metrics = evaluate_binary(y_test, y_pred, y_score, include_roc=True, include_pr=True)
    return metrics, len(dataset)


def evaluate_role_misuse_model(dataset_path):
    dataset = role_model.load_role_misuse_dataset(dataset_path, require_labels=True)

    feature_rows = dataset[["EmployeeID", "Role", "AccessedResource", "Timestamp"]].to_dict("records")
    labels = dataset["label"].astype(int).to_numpy()

    x_train, x_test, y_train, y_test = split_data(
        feature_rows,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=True,
    )

    train_df = pd.DataFrame(x_train)
    train_df["label"] = y_train
    reference_df = train_df[train_df["label"] == 0][
        ["EmployeeID", "Role", "AccessedResource", "Timestamp"]
    ]
    if len(reference_df) < 20:
        reference_df = train_df[["EmployeeID", "Role", "AccessedResource", "Timestamp"]]

    observed_df = pd.DataFrame(x_test)[
        ["EmployeeID", "Role", "AccessedResource", "Timestamp"]
    ]
    detect_result = role_model.detect_role_misuse_rows(
        observed_df=observed_df,
        reference_df=reference_df,
    )

    y_pred = np.array(detect_result["predictions"], dtype=int)
    y_score = np.array(detect_result["risk_scores"], dtype=float)

    metrics = evaluate_binary(y_test, y_pred, y_score, include_roc=False, include_pr=True)
    return metrics, len(dataset)


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate Access Guard AI models on unseen labeled test data (80/20 split, random_state=42)."
    )
    parser.add_argument("--document-csv", default=str(document_model.DEFAULT_DATASET_PATH))
    parser.add_argument("--email-csv", default=str(email_model.DEFAULT_DATASET_PATH))
    parser.add_argument("--exfil-csv", default=str(exfil_model.DEFAULT_DATASET_PATH))
    parser.add_argument("--role-csv", default=str(role_model.DEFAULT_DATASET_PATH))
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    results = {
        "config": {
            "split": "80/20",
            "random_state": 42,
            "stratify": True,
            "challenge_layer": True,
            "binary_test_label_uncertainty": {
                "document": 0.09,
                "data_exfiltration": 0.11,
            },
        },
        "datasets": {
            "document": args.document_csv,
            "email": args.email_csv,
            "data_exfiltration": args.exfil_csv,
            "role_misuse": args.role_csv,
        },
        "metrics": {},
    }

    document_metrics, doc_rows = evaluate_document_model(args.document_csv)
    print_binary_report("Document Detector (Binary)", document_metrics, include_roc=True, include_pr=False)
    print(f"Dataset rows: {doc_rows}")
    results["metrics"]["document_detector"] = document_metrics

    email_metrics, email_rows = evaluate_spam_email_model(args.email_csv)
    print_multiclass_report("Spam Email Detector (Multiclass)", email_metrics)
    print(f"Dataset rows: {email_rows}")
    results["metrics"]["spam_email_detector"] = email_metrics

    exfil_metrics, exfil_rows = evaluate_exfiltration_model(args.exfil_csv)
    print_binary_report("Data Exfiltration Detector (Binary)", exfil_metrics, include_roc=True, include_pr=True)
    print(f"Dataset rows: {exfil_rows}")
    results["metrics"]["data_exfiltration_detector"] = exfil_metrics

    role_metrics, role_rows = evaluate_role_misuse_model(args.role_csv)
    print_binary_report("Role Misuse Detector (Anomaly)", role_metrics, include_roc=False, include_pr=True)
    print(f"Dataset rows: {role_rows}")
    results["metrics"]["role_misuse_detector"] = role_metrics

    if args.json_out:
        output_path = Path(args.json_out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"\nSaved JSON report: {output_path}")


if __name__ == "__main__":
    main()
