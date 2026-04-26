# Access Guard AI - ML Dataset and Evaluation Guide

This project now uses dataset-driven ML workflows for both prediction and evaluation.

## Dataset Files

Default datasets are stored in:

- `ml_models/datasets/document_detector_dataset.csv`
- `ml_models/datasets/spam_email_dataset.csv`
- `ml_models/datasets/data_exfiltration_dataset.csv`
- `ml_models/datasets/role_misuse_dataset.csv`

Expected schema:

- Document detector: `text,label`
- Spam email detector: `content,label` where `label` in `safe,spam,phishing`
- Data exfiltration detector: `subject,emailText,documentText,label` where `label` in `0,1`
- Role misuse detector: `EmployeeID,Role,AccessedResource,Timestamp,label` where `label` in `0,1`

## Evaluate All Models

Run from project root:

```bash
python ml_models/evaluate_models.py
```

Optional custom CSV files:

```bash
python ml_models/evaluate_models.py \
  --document-csv "path/to/document.csv" \
  --email-csv "path/to/email.csv" \
  --exfil-csv "path/to/exfil.csv" \
  --role-csv "path/to/role.csv" \
  --json-out "ml_models/reports/eval_metrics.json"
```

## Evaluation Rules

- Train/test split: `80/20`
- `random_state=42`
- Stratified split for class balance where applicable
- Includes an additional challenge layer with hard negatives/hard positives
- Includes controlled binary test-label uncertainty to simulate annotation disagreement:
  - Document detector: `9%`
  - Data exfiltration detector: `11%`
- Metrics:
  - Document detector: Accuracy, Precision, Recall, F1, ROC-AUC, Confusion Matrix
  - Spam detector: Accuracy, Macro F1, Per-class metrics, Confusion Matrix
  - Data exfiltration detector: Accuracy, Precision, Recall, F1, ROC-AUC, PR-AUC, Confusion Matrix
  - Role misuse detector: Precision, Recall, F1, PR-AUC, Confusion Matrix

## Notes

- Backend integration remains unchanged: model scripts still return the same JSON response fields.
- If you want to use alternate datasets at runtime, pass `datasetPath` in model payloads.
