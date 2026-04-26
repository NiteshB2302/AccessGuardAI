import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import Pipeline


SUSPICIOUS_KEYWORDS = [
    "confidential",
    "top secret",
    "internal only",
    "salary",
    "payroll",
    "credential",
    "password",
    "database",
    "customer list",
    "proprietary",
    "source code",
    "trade secret",
    "strategy",
    "financial forecast",
    "private key",
    "api token",
    "unencrypted export",
    "customer pii",
    "credentials",
    "outside company",
    "personal email",
    "without approval",
    "restricted report",
    "security bypass",
]

DEFAULT_DATASET_PATH = (
    Path(__file__).resolve().parent / "datasets" / "data_exfiltration_dataset.csv"
)


def unique_keep_order(values):
    seen = set()
    output = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def parse_binary_label(value):
    token = str(value).strip().lower()
    if token in {"1", "true", "yes", "malicious", "threat", "suspicious", "leak"}:
        return 1
    return 0


def build_training_text(subject, email_text, document_text):
    return f"{subject} {email_text} {document_text}".strip()


def load_dataset(dataset_path=None):
    resolved_path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH
    if not resolved_path.exists():
        raise FileNotFoundError(
            f"Data exfiltration dataset not found: {resolved_path}. "
            "Expected CSV columns: subject,emailText,documentText,label"
        )

    df = pd.read_csv(resolved_path).fillna("")
    required = {"subject", "emailText", "documentText", "label"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(
            f"Data exfiltration dataset missing columns: {', '.join(sorted(missing))}"
        )

    df = df[["subject", "emailText", "documentText", "label"]].copy()
    df["subject"] = df["subject"].astype(str).str.strip()
    df["emailText"] = df["emailText"].astype(str).str.strip()
    df["documentText"] = df["documentText"].astype(str).str.strip()
    df["label"] = df["label"].apply(parse_binary_label)
    df["text"] = df.apply(
        lambda row: build_training_text(
            row["subject"], row["emailText"], row["documentText"]
        ),
        axis=1,
    )
    df = df[df["text"] != ""].reset_index(drop=True)

    if df["label"].nunique() < 2:
        raise ValueError("Data exfiltration dataset must contain both classes (0 and 1).")
    return df


def create_pipeline():
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    stop_words="english",
                    min_df=2,
                    sublinear_tf=True,
                ),
            ),
            ("clf", LogisticRegression(max_iter=1200, class_weight="balanced", C=1.7)),
        ]
    )


def build_leak_classifier(dataset_path=None):
    dataset = load_dataset(dataset_path=dataset_path)
    pipeline = create_pipeline()
    pipeline.fit(dataset["text"].tolist(), dataset["label"].to_numpy())
    return pipeline


def collect_keyword_hits(text):
    lowered = text.lower()
    hits = [keyword for keyword in SUSPICIOUS_KEYWORDS if keyword in lowered]
    return unique_keep_order(hits)


def extract_matched_sentences(text, hits):
    if not text.strip():
        return []
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    selected = []
    for sentence in sentences:
        lowered = sentence.lower()
        if any(keyword in lowered for keyword in hits):
            selected.append(sentence.strip())
    return selected[:6]


def compute_similarity(document_text, email_text):
    if not document_text.strip() or not email_text.strip():
        return 0.0

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words="english")
    matrix = vectorizer.fit_transform([document_text, email_text])
    sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
    return float(np.clip(sim, 0.0, 1.0))


def clamp(value, min_value=0.0, max_value=1.0):
    return float(max(min_value, min(max_value, value)))


def predict_exfiltration(document_text, email_text, subject, leak_classifier):
    document_text = str(document_text or "")
    email_text = str(email_text or "")
    subject = str(subject or "")
    combined_text = f"{subject} {email_text}".strip()

    if not combined_text:
        return {
            "similarity_score": 0.0,
            "content_risk_score": 0.1,
            "risk_level": "LOW",
            "suspicious_keywords": [],
            "matched_sentences": [],
        }

    classifier_text = build_training_text(subject, email_text, document_text)
    leak_prob = float(leak_classifier.predict_proba([classifier_text])[0][1])
    similarity_score = compute_similarity(document_text, email_text)
    keyword_hits = collect_keyword_hits(combined_text)
    keyword_boost = min(len(keyword_hits) * 0.045, 0.32)

    contextual_boost = (
        0.08
        if re.search(
            r"personal email|outside company|unauthorized|without approval|bypass|unencrypted",
            combined_text.lower(),
        )
        else 0.0
    )

    content_risk = clamp(
        (leak_prob * 0.5) + (similarity_score * 0.3) + keyword_boost + contextual_boost
    )

    if content_risk >= 0.75:
        risk_level = "HIGH"
    elif content_risk >= 0.45:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "similarity_score": round(similarity_score, 2),
        "content_risk_score": round(content_risk, 2),
        "risk_level": risk_level,
        "suspicious_keywords": keyword_hits,
        "matched_sentences": extract_matched_sentences(combined_text, keyword_hits),
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as file:
        payload = json.load(file)

    leak_classifier = build_leak_classifier(dataset_path=payload.get("datasetPath"))
    result = predict_exfiltration(
        document_text=payload.get("documentText", ""),
        email_text=payload.get("emailText", ""),
        subject=payload.get("subject", ""),
        leak_classifier=leak_classifier,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
