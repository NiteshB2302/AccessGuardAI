import json
import sys

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline


def build_model():
    safe = [
        "team sync moved to 3 pm please review agenda",
        "monthly payroll is processed and available on portal",
        "engineering update on bug fixes and deployment plan",
        "welcome to onboarding schedule and training resources",
        "please submit project status report by end of day",
    ]

    spam = [
        "limited offer win free iphone click now",
        "congratulations you won lottery claim reward immediately",
        "earn money fast from home no experience required",
        "cheap meds and discount products buy now",
        "exclusive deal click link to receive bonus",
    ]

    phishing = [
        "verify account urgently to avoid suspension enter password now",
        "urgent payment required update bank credentials immediately",
        "security alert click this link to confirm login details",
        "your mailbox is full re authenticate with corporate password",
        "confirm invoice by submitting account verification today",
    ]

    texts = safe + spam + phishing
    labels = ["safe"] * len(safe) + ["spam"] * len(spam) + ["phishing"] * len(phishing)

    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), stop_words="english")),
            ("clf", MultinomialNB()),
        ]
    )
    pipeline.fit(texts, labels)
    return pipeline


def get_keywords(content):
    bank = [
        "verify account",
        "urgent payment",
        "click link",
        "password",
        "bank credentials",
        "lottery",
        "free",
        "bonus",
        "suspension",
    ]
    lowered = content.lower()
    return [token for token in bank if token in lowered]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "payload path missing"}))
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    content = (payload.get("content") or "").strip()
    if not content:
        print(json.dumps({"prediction": "Safe", "confidence": 0.5, "suspicious_keywords": []}))
        return

    model = build_model()
    probabilities = model.predict_proba([content])[0]
    labels = model.classes_
    best_index = probabilities.argmax()
    prediction = labels[best_index]
    confidence = float(probabilities[best_index])

    suspicious_keywords = get_keywords(content)
    if prediction in ["spam", "phishing"]:
        confidence = min(1.0, confidence + min(len(suspicious_keywords) * 0.05, 0.2))

    print(
        json.dumps(
            {
                "prediction": prediction.capitalize(),
                "confidence": round(confidence, 2),
                "suspicious_keywords": suspicious_keywords,
            }
        )
    )


if __name__ == "__main__":
    main()

