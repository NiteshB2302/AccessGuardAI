import json
import re
import sys
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


SUSPICIOUS_KEYWORDS_BANK = [
    "confidential",
    "password",
    "database",
    "credentials",
    "top secret",
    "leak",
    "exfiltrate",
    "bypass",
    "private data",
    "disable monitoring",
    "admin access",
    "customer pii",
    "source code",
    "payment card",
    "unauthorized",
    "secret key",
]

DEFAULT_DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "document_detector_dataset.csv"


def parse_binary_label(value):
    token = str(value).strip().lower()
    if token in {"1", "true", "yes", "malicious", "threat", "suspicious"}:
        return 1
    return 0


def unique_keep_order(values):
    seen = set()
    output = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def load_dataset(dataset_path=None):
    resolved_path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH
    if not resolved_path.exists():
        raise FileNotFoundError(
            f"Document detector dataset not found: {resolved_path}. "
            "Expected CSV columns: text,label"
        )

    df = pd.read_csv(resolved_path).fillna("")
    required = {"text", "label"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(
            f"Document detector dataset missing columns: {', '.join(sorted(missing))}"
        )

    df = df[["text", "label"]].copy()
    df["text"] = df["text"].astype(str).str.strip()
    df["label"] = df["label"].apply(parse_binary_label)
    df = df[df["text"] != ""].reset_index(drop=True)

    if df["label"].nunique() < 2:
        raise ValueError("Document detector dataset must contain both classes (0 and 1).")

    return df


def create_pipeline():
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 3),
                    stop_words="english",
                    min_df=2,
                    sublinear_tf=True,
                ),
            ),
            ("clf", LogisticRegression(max_iter=1200, class_weight="balanced", C=1.8)),
        ]
    )


def build_model(dataset_path=None):
    dataset = load_dataset(dataset_path=dataset_path)
    model = create_pipeline()
    model.fit(dataset["text"].tolist(), dataset["label"].to_numpy())
    return model


def extract_suspicious_sentences(text, keywords):
    sentences = re.split(r"(?<=[.!?])\s+", text)
    selected = []
    for sentence in sentences:
        lower_sentence = sentence.lower()
        if any(keyword in lower_sentence for keyword in keywords):
            selected.append(sentence.strip())
    return selected[:6]


def clamp(value, min_value=0.0, max_value=1.0):
    return max(min_value, min(max_value, float(value)))


def predict_document_risk(text, model):
    if not text.strip():
        return {
            "risk_level": "LOW",
            "risk_score": 0.05,
            "suspicious_keywords": [],
            "suspicious_sentences": [],
        }

    probability = float(model.predict_proba([text])[0][1])
    lower_text = text.lower()

    suspicious_keywords = [
        token for token in SUSPICIOUS_KEYWORDS_BANK if token in lower_text
    ]
    suspicious_keywords = unique_keep_order(suspicious_keywords)
    suspicious_sentences = extract_suspicious_sentences(text, SUSPICIOUS_KEYWORDS_BANK)

    keyword_boost = min(len(suspicious_keywords) * 0.045, 0.24)
    sentence_boost = min(len(suspicious_sentences) * 0.03, 0.12)
    behavior_boost = (
        0.08
        if re.search(r"disable monitoring|bypass|exfiltrat|dump|steal|unauthorized", lower_text)
        else 0.0
    )

    final_score = clamp((probability * 0.82) + keyword_boost + sentence_boost + behavior_boost)

    if final_score >= 0.75:
        risk_level = "HIGH"
    elif final_score >= 0.45:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "risk_level": risk_level,
        "risk_score": round(final_score, 2),
        "suspicious_keywords": suspicious_keywords,
        "suspicious_sentences": suspicious_sentences,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    text = payload.get("text", "") or ""
    dataset_path = payload.get("datasetPath")

    model = build_model(dataset_path=dataset_path)
    result = predict_document_risk(text=text, model=model)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
