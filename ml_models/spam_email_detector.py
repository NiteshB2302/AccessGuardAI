import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


PHISHING_KEYWORDS = [
    "verify account",
    "security alert",
    "urgent payment",
    "reset password",
    "confirm credentials",
    "account suspension",
    "click secure link",
    "bank credentials",
    "invoice verification",
    "mfa disabled",
]

SPAM_KEYWORDS = [
    "limited offer",
    "free gift",
    "lottery winner",
    "click now",
    "exclusive deal",
    "urgent discount",
    "bonus reward",
    "buy now",
    "cheap price",
    "instant profit",
]

DEFAULT_DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "spam_email_dataset.csv"
VALID_LABELS = {"safe", "spam", "phishing"}


def unique_keep_order(values):
    seen = set()
    output = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def parse_email_label(value):
    token = str(value).strip().lower()
    if token in {"safe", "normal", "legit", "legitimate"}:
        return "safe"
    if token in {"spam", "junk"}:
        return "spam"
    if token in {"phishing", "phish"}:
        return "phishing"
    return token


def load_dataset(dataset_path=None):
    resolved_path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH
    if not resolved_path.exists():
        raise FileNotFoundError(
            f"Spam email dataset not found: {resolved_path}. "
            "Expected CSV columns: content,label"
        )

    df = pd.read_csv(resolved_path).fillna("")
    required = {"content", "label"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Spam email dataset missing columns: {', '.join(sorted(missing))}")

    df = df[["content", "label"]].copy()
    df["content"] = df["content"].astype(str).str.strip()
    df["label"] = df["label"].apply(parse_email_label)
    df = df[df["content"] != ""].reset_index(drop=True)
    df = df[df["label"].isin(VALID_LABELS)].reset_index(drop=True)

    if df.empty:
        raise ValueError("Spam email dataset has no valid rows after normalization.")
    if df["label"].nunique() < 3:
        raise ValueError("Spam email dataset must contain all labels: safe, spam, phishing.")
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
            (
                "clf",
                LogisticRegression(
                    max_iter=1200,
                    class_weight="balanced",
                    solver="lbfgs",
                ),
            ),
        ]
    )


def build_model(dataset_path=None):
    dataset = load_dataset(dataset_path=dataset_path)
    model = create_pipeline()
    model.fit(dataset["content"].tolist(), dataset["label"].to_numpy())
    return model


def get_keywords(content):
    lowered = content.lower()
    matched = [token for token in PHISHING_KEYWORDS + SPAM_KEYWORDS if token in lowered]
    return unique_keep_order(matched)


def predict_email(content, model):
    content = (content or "").strip()
    if not content:
        return {"prediction": "Safe", "confidence": 0.5, "suspicious_keywords": []}

    probabilities = model.predict_proba([content])[0]
    labels = model.classes_
    best_index = probabilities.argmax()
    prediction = labels[best_index]
    confidence = float(probabilities[best_index])

    suspicious_keywords = get_keywords(content)
    phishing_hit_count = sum(1 for token in PHISHING_KEYWORDS if token in content.lower())
    spam_hit_count = sum(1 for token in SPAM_KEYWORDS if token in content.lower())

    if prediction in {"spam", "phishing"}:
        confidence = min(1.0, confidence + min(len(suspicious_keywords) * 0.04, 0.2))

    if phishing_hit_count >= 2 and prediction != "phishing" and confidence < 0.8:
        prediction = "phishing"
        confidence = max(confidence, 0.8)
    elif spam_hit_count >= 2 and prediction == "safe" and confidence < 0.76:
        prediction = "spam"
        confidence = max(confidence, 0.76)

    return {
        "prediction": prediction.capitalize(),
        "confidence": round(confidence, 2),
        "suspicious_keywords": suspicious_keywords,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    content = payload.get("content")
    dataset_path = payload.get("datasetPath")
    model = build_model(dataset_path=dataset_path)
    result = predict_email(content=content, model=model)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
