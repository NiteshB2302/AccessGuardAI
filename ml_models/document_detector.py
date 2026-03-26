import json
import re
import sys

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def build_model():
    benign_samples = [
        "meeting notes and team collaboration agenda",
        "engineering sprint retrospective and planning details",
        "public onboarding training guide for all departments",
        "general policy update and internal communication memo",
        "technical architecture overview with api documentation",
        "finance report summary for internal audit and compliance",
    ]

    malicious_samples = [
        "download database credentials and admin password urgently",
        "confidential payroll dump send to external account now",
        "top secret product plan leak to unauthorized partner",
        "disable monitoring and exfiltrate customer records",
        "steal internal strategy document and sensitive secrets",
        "urgent bypass security controls and extract private data",
    ]

    train_texts = benign_samples + malicious_samples
    labels = [0] * len(benign_samples) + [1] * len(malicious_samples)

    model = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), stop_words="english")),
            ("clf", LogisticRegression(max_iter=500)),
        ]
    )
    model.fit(train_texts, labels)
    return model


def extract_suspicious_sentences(text, keywords):
    sentences = re.split(r"(?<=[.!?])\s+", text)
    selected = []
    for sentence in sentences:
        lower_sentence = sentence.lower()
        if any(keyword in lower_sentence for keyword in keywords):
            selected.append(sentence.strip())
    return selected[:6]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    text = payload.get("text", "") or ""
    if not text.strip():
        print(
            json.dumps(
                {
                    "risk_level": "LOW",
                    "risk_score": 0.05,
                    "suspicious_keywords": [],
                    "suspicious_sentences": [],
                }
            )
        )
        return

    model = build_model()
    probability = float(model.predict_proba([text])[0][1])

    suspicious_keywords_bank = [
        "confidential",
        "password",
        "database",
        "credentials",
        "top secret",
        "leak",
        "exfiltrate",
        "bypass",
        "private data",
    ]

    lower_text = text.lower()
    suspicious_keywords = [token for token in suspicious_keywords_bank if token in lower_text]
    suspicious_sentences = extract_suspicious_sentences(text, suspicious_keywords_bank)

    keyword_boost = min(len(suspicious_keywords) * 0.07, 0.25)
    final_score = max(0.0, min(1.0, probability + keyword_boost))

    if final_score >= 0.75:
        risk_level = "HIGH"
    elif final_score >= 0.45:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    print(
        json.dumps(
            {
                "risk_level": risk_level,
                "risk_score": round(final_score, 2),
                "suspicious_keywords": suspicious_keywords,
                "suspicious_sentences": suspicious_sentences,
            }
        )
    )


if __name__ == "__main__":
    main()

