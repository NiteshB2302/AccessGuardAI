Access Guard AI model test samples

Document detector (upload in Admin -> AI Detection Modules):
- document_safe_1.txt
- document_malicious_1.txt
- document_malicious_2.txt

Email detector (paste content in Admin -> AI Detection Modules):
- email_safe_1.txt
- email_spam_1.txt
- email_phishing_1.txt

Secure Share / Data Exfiltration detector (Employee -> Secure Share Guard):
- exfil_document_confidential.txt (use as selected document)
- exfil_email_high_risk.txt (paste as message body + external email recipient)
- exfil_email_safe_internal.txt (paste as message body + internal email recipient)

Expected behavior:
- document_safe_1.txt -> LOW/MEDIUM risk
- document_malicious_1.txt -> HIGH risk
- document_malicious_2.txt -> HIGH risk
- email_safe_1.txt -> Safe
- email_spam_1.txt -> Spam
- email_phishing_1.txt -> Phishing
- exfil_email_high_risk.txt + external recipient -> Warning/High risk, override or approval required
- exfil_email_safe_internal.txt + internal recipient -> Safe/low risk
