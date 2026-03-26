import json
import re
import sys

import numpy as np
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
]


def build_leak_classifier():
    safe_samples = [
        "Please join the weekly standup at 10 AM in conference room B.",
        "Attached are public onboarding notes for new hires.",
        "Reminder: submit approved leave requests by Friday.",
        "Marketing campaign summary for social media engagement metrics.",
        "Team lunch tomorrow, RSVP to operations.",
        "Public product release notes and FAQ updates.",
    ]

    leak_samples = [
        "Forwarding confidential payroll data to my personal email.",
        "Sharing top secret product strategy with external contact.",
        "Sending database credentials and backup keys outside company.",
        "Exporting customer list and private records to gmail account.",
        "Please find attached internal source code and architecture secrets.",
        "Urgent transfer of proprietary financial forecast to third party.",
    ]

    texts = safe_samples + leak_samples
    labels = [0] * len(safe_samples) + [1] * len(leak_samples)

    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), stop_words="english")),
            ("clf", LogisticRegression(max_iter=500)),
        ]
    )
    pipeline.fit(texts, labels)
    return pipeline


def collect_keyword_hits(text):
    lowered = text.lower()
    hits = [keyword for keyword in SUSPICIOUS_KEYWORDS if keyword in lowered]
    return hits


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


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as file:
        payload = json.load(file)

    document_text = str(payload.get("documentText") or "")
    email_text = str(payload.get("emailText") or "")
    combined_text = f"{payload.get('subject', '')} {email_text}".strip()

    if not combined_text:
        print(
            json.dumps(
                {
                    "similarity_score": 0.0,
                    "content_risk_score": 0.1,
                    "risk_level": "LOW",
                    "suspicious_keywords": [],
                    "matched_sentences": [],
                }
            )
        )
        return

    leak_classifier = build_leak_classifier()
    leak_prob = float(leak_classifier.predict_proba([combined_text])[0][1])
    similarity_score = compute_similarity(document_text, email_text)
    keyword_hits = collect_keyword_hits(combined_text)
    keyword_boost = min(len(keyword_hits) * 0.06, 0.3)

    content_risk = float(np.clip((leak_prob * 0.52) + (similarity_score * 0.38) + keyword_boost, 0.0, 1.0))
    if content_risk >= 0.75:
        risk_level = "HIGH"
    elif content_risk >= 0.45:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    print(
        json.dumps(
            {
                "similarity_score": round(similarity_score, 2),
                "content_risk_score": round(content_risk, 2),
                "risk_level": risk_level,
                "suspicious_keywords": keyword_hits,
                "matched_sentences": extract_matched_sentences(combined_text, keyword_hits),
            }
        )
    )


if __name__ == "__main__":
    main()
