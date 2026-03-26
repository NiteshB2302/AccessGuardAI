# Access Guard AI

Intelligent Insider Threat, Role Misuse, Malicious Document and Email Threat Detection Platform.

## Stack
- Frontend: React, Tailwind CSS, Framer Motion, Chart.js
- Backend: Node.js, Express.js
- Database: MongoDB (real persistence with Mongoose)
- ML: Python, scikit-learn, pandas
- Auth: JWT + role-based access control (Admin, HR Manager, Employee)

## Core Features
- Role-based authentication and authorization
- Automatic `EMP###` employee ID generation
- Role/department permission enforcement on document access
- Insider threat detection with alert generation
- Role misuse anomaly detection from CSV/Excel upload (Isolation Forest)
- Malicious document detection for PDF/DOCX/TXT (TF-IDF + Logistic Regression)
- Spam/phishing/safe email classification (TF-IDF + Naive Bayes)
- Data exfiltration detection for outbound employee email (TF-IDF similarity + policy fusion)
- Employee behavior risk scoring and threat level classification
- Real-time-like monitoring UI with live activity feed and popup alerts
- Security analytics dashboard with threat/risk charts

## Project Structure
```text
access-guard-ai
├─ frontend
│  ├─ src
│  │  ├─ components
│  │  ├─ pages
│  │  ├─ dashboard
│  │  ├─ animations
│  │  └─ services
├─ backend
│  ├─ routes
│  ├─ controllers
│  ├─ middleware
│  ├─ models
│  └─ server.js
├─ ml_models
│  ├─ document_detector.py
│  ├─ data_exfiltration_detector.py
│  ├─ role_misuse_detector.py
│  └─ spam_email_detector.py
└─ database
   └─ mongodb_connection.js
```

## Prerequisites
- Node.js 18+
- MongoDB local server OR Docker Desktop
- Python 3.10+ with pip

## Setup (VS Code Terminal)

### 1) Start MongoDB
Option A: local MongoDB service

Option B: Docker
```bash
docker compose up -d
```

### 2) Configure backend environment
```bash
cd access-guard-ai/backend
cp .env.example .env
```

If `cp` is unavailable in PowerShell:
```powershell
Copy-Item .env.example .env
```

### 3) Install dependencies
```bash
cd ../backend
npm install
cd ../frontend
npm install
cd ../ml_models
pip install -r requirements.txt
```

### 4) Seed demo users/documents/events
```bash
cd ../backend
npm run seed
```

### 5) Run backend and frontend
Terminal 1:
```bash
cd access-guard-ai/backend
npm run dev
```

Terminal 2:
```bash
cd access-guard-ai/frontend
npm run dev
```

Open:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/api/health`

## Default Demo Credentials
- Admin: `admin@accessguard.ai` / `Admin@123`
- HR Manager: `hr@accessguard.ai` / `Hr@123456`
- Employee: `dev@accessguard.ai` / `Emp@123456`

## API Summary
- `POST /api/auth/bootstrap-admin`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST /api/employees` (Admin, HR Manager)
- `POST /api/employees/:employeeID/send-alert` (Admin)
- `POST /api/employees/:employeeID/block` (Admin)
- `POST /api/employees/:employeeID/unblock` (Admin)
- `GET /api/employees/me/notifications`
- `GET /api/employees/me/security-summary`
- `GET /api/employees/me/secure-share/incidents`
- `POST /api/employees/me/secure-share/analyze`
- `POST /api/employees/me/secure-share/:incidentId/decision`
- `GET /api/documents`
- `POST /api/documents/:documentId/access`
- `POST /api/documents/scan` (Admin)
- `GET /api/documents/scan-history` (Admin)
- `GET /api/threats/overview` (Admin)
- `GET /api/threats/analytics` (Admin)
- `GET /api/threats/live-feed` (Admin)
- `GET /api/threats/alerts` (Admin)
- `GET /api/threats/risk-table` (Admin)
- `POST /api/threats/email-scan` (Admin)
- `POST /api/threats/role-misuse` (Admin)
- `GET /api/threats/exfil-incidents` (Admin)
- `PATCH /api/threats/exfil-incidents/:id` (Admin)
- `GET /api/activity/me`

## Upload/Test Samples
- Role misuse sample file: `backend/sample_role_misuse_logs.csv`
- Role misuse template file: `test_samples/role_misuse_template.csv`
- Supported document scan formats: `.pdf`, `.docx`, `.txt`
- Supported role misuse upload formats: `.csv`, `.xlsx`, `.xls`

### Role Misuse CSV Format
Required headers:
- `EmployeeID`
- `Role`
- `AccessedResource`
- `Timestamp` (ISO format recommended: `YYYY-MM-DDTHH:mm:ss`)

Example:
```csv
EmployeeID,Role,AccessedResource,Timestamp
EMP001,Finance Analyst,FinancialReports,2026-03-20T09:15:00
EMP010,Intern,ConfidentialDocs,2026-03-20T23:45:00
```

## Notes
- Ensure `PYTHON_PATH` in `backend/.env` points to your Python executable.
- If Python is not on PATH in Windows, set `PYTHON_PATH` (example: `C:\\Python311\\python.exe`).
- This prototype uses open-source components only and real MongoDB storage.

## Vercel Deployment (Production)

This repo is now prepared for **two Vercel projects**:

1. **Backend project** (root directory: `backend`)
2. **Frontend project** (root directory: `frontend`)

This keeps your local backup and local MongoDB untouched unless you explicitly change local `.env`.

### Quick deploy sequence

1. Create a MongoDB Atlas database for production only.
2. Import this project into Vercel.
3. Create backend project with root directory `backend`.
4. Create frontend project with root directory `frontend`.
5. Add environment variables from:
   - `backend/.env.vercel.example`
   - `frontend/.env.vercel.example`
6. Redeploy both projects.

### Backend on Vercel

- Root directory: `backend`
- Build/Runtime config is in `backend/vercel.json`
- API handler entry: `backend/api/index.js`
- Required environment variables in Vercel backend project:
  - `MONGODB_URI` (use MongoDB Atlas for production)
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN` (example: `1d`)
  - `FRONTEND_URL` (your frontend Vercel URL, optional comma-separated list)
  - `USE_PYTHON_MODELS=false` (recommended on Vercel)
  - `ALLOW_JS_ML_FALLBACK=true`
  - `COMPANY_EMAIL_DOMAIN=accessguard.ai`

### Frontend on Vercel

- Root directory: `frontend`
- SPA rewrites config is in `frontend/vercel.json`
- Set environment variable in Vercel frontend project:
  - `VITE_API_BASE_URL=https://<your-backend-vercel-domain>/api`

### Local safety

- Your local MongoDB backup remains unchanged if Vercel uses its own Atlas URI.
- Keep `backend/.env` for local only, and do not copy your local URI into Vercel env settings.
- Local dev still uses `backend/.env` and can continue using Python ML (`USE_PYTHON_MODELS=true`).

## PWA & Mobile Support

- Frontend now ships as a Progressive Web App using `vite-plugin-pwa`.
- Service worker and manifest are generated during `npm run build`.
- Install support is enabled for Android, iOS (Add to Home Screen), and desktop browsers.
- Mobile layout now includes a sidebar drawer menu and responsive table handling for dashboards.

### PWA Verify Checklist

1. Open deployed frontend in Chrome/Edge.
2. Check install icon (`Install App`) appears in address bar.
3. Install app and open in standalone mode.
4. In DevTools -> Application, verify:
   - Manifest is valid
   - Service Worker is active
