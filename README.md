# FairShift

Fair work. Clear pay. Safer workplaces.

FairShift is a modern workforce management platform built to provide transparent work records, explainable pay estimates, and a confidential grievance reporting channel for workers, alongside actionable operational insights and workload monitors for employers.

Inspired by UN Sustainable Development Goal 8 (Decent Work and Economic Growth), FairShift serves employee-intensive sectors that traditionally rely on paper attendance registers, spreadsheets, or informal messaging groups. It natively supports multiple industry sectors (such as Construction Operations and Higher Education) within a single codebase through organization-level policy configuration.

---

## Architecture Overview

FairShift is designed with a clean separation of concerns, strict tenant isolation, and a server-verified security boundary:

1. Frontend (SPA):
   - Built with React 19, TypeScript, Vite, React Router, and Tailwind CSS.
   - Communicates with the backend exclusively via JSON REST APIs under `/api`.
   - Never accesses Firestore directly from the browser. Client-side Firestore rules are locked (`allow read, write: if false`).

2. Backend (API):
   - Built with Node.js, Express, TypeScript, and Zod validation.
   - Deployed on Vercel as a Serverless Function through `api/index.ts` and `vercel.json`.
   - Verifies Firebase Authentication Bearer ID tokens on every protected route.
   - Loads user role and organization membership server-side from Firestore. Client-supplied headers, IDs, or parameters are never trusted for authorization.

3. Database and Identity:
   - Firebase Authentication handles email and password identity verification.
   - Cloud Firestore handles persistent storage using the Firebase Admin SDK.
   - Deterministic active-shift guards and atomic Firestore transactions prevent duplicate check-ins.
   - Hourly rates, shift thresholds, and overtime multipliers are snapshotted at shift creation so past earnings estimates remain immutable when policies change.

---

## Core Features and Full Walkthrough

### 1. Worker Journey
- Check-in and Check-out: Workers check in at the start of a shift and record break minutes at check-out. Active shifts are guarded transactionally.
- Transparent Earnings Breakdown: Calculates worked minutes, regular hours, overtime hours, and itemized estimated gross earnings in integer paise with controlled rounding.
- Confidential Incident Reporting: Workers can submit safety hazards or grievances under specific organization categories (for example PPE equipment, site safety, campus maintenance).
- Case Progress Tracking: Workers can view the real-time status of their submitted concerns (Open, In Progress, Resolved) along with administrator resolution notes.
- Bilingual Support: Instant toggle between English and Tamil for core navigation, actions, and status updates.

### 2. Employer and Admin Journey
- Command Center: Live dashboard displaying present workers, completed shift counts, open confidential reports, and resolved cases.
- Explainable Fairness Monitor: Flags operational concerns based on configured rules, such as shifts exceeding regular limits, insufficient rest between consecutive shifts, or cases open beyond SLA.
- Confidential Case Resolution: Admins review cases without exposure of the reporter identity in default DTO lists. Admins progress cases through a strict lifecycle (Open -> In Progress -> Resolved) with mandatory resolution notes and audit history.
- Roster and Shift Logs: Search and inspect shifts, break records, and snapshotted wage calculations across departments.

### 3. Multi-Sector Data Configuration
FairShift demonstrates multi-industry adaptability using the exact same application engine:
- Construction (Buildwell Construction): Site operations and equipment departments, PPE safety categories, 8-hour regular shift limits, and ₹125/hr base wage rate.
- College (Greenfield College): Housekeeping, maintenance, and security departments, campus hazard categories, 7-hour regular shift limits, and ₹110/hr base wage rate.

### 4. Account Settings and Profile Modal
- Accessible via the top-right user pill or the sidebar user profile card.
- Displays full user identity, employee code, department, base wage rate, and organization policy rules.
- Includes language switcher, active session verification, and a prominent Sign Out action.

---

## Demo Accounts

The login screen includes quick auto-fill buttons for all synthetic demo accounts. All demo accounts use the password: `Fastforward1`

| Role | Sector | Email |
| :--- | :--- | :--- |
| Worker | Construction | `worker.construction@fairshift.example` |
| Worker 2 | Construction | `worker2.construction@fairshift.example` |
| Employer / Admin | Construction | `admin.construction@fairshift.example` |
| Worker | College | `worker.college@fairshift.example` |
| Employer / Admin | College | `admin.college@fairshift.example` |

---

## Firebase Setup Guide

FairShift requires Firebase Authentication and Cloud Firestore.

### Step 1: Create a Project
1. Go to the Firebase Console: https://console.firebase.google.com/
2. Click Add Project and create a project (for example, `fair-shift-f3953`).

### Step 2: Enable Authentication
1. Navigate to Build > Authentication.
2. Click Get Started.
3. Under the Sign-in method tab, select Email/Password.
4. Enable the first toggle (Email/Password) and click Save.

### Step 3: Create Firestore Database
1. Navigate to Build > Firestore Database.
2. Click Create database.
3. Select your location (such as `asia-south1` or `us-central1`).
4. Choose Start in production mode and click Create.

### Step 4: Register Web App
1. Go to Project Settings (gear icon in the top left).
2. Under Your apps, click the Web icon (`</>`).
3. Set the nickname (for example, `FairShift Web`) and register.
4. Note your public web keys:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `appId`

### Step 5: Generate Admin Service Account
1. Go to Project Settings > Service accounts.
2. Under Firebase Admin SDK, click Generate new private key.
3. Download the JSON file securely. Keep this file private and never commit it to source control.

---

## Deployment on Vercel

FairShift is pre-configured for Vercel deployment with `vercel.json` and a serverless entrypoint at `api/index.ts`.

### 1. Push Code to GitHub
1. Initialize git and commit your files:
   ```sh
   git init
   git add .
   git commit -m "Initial commit for FairShift"
   ```
2. Push your repository to GitHub.

### 2. Import into Vercel
1. Log in to your Vercel account at https://vercel.com/
2. Click Add New... > Project.
3. Import your GitHub repository.

### 3. Add Environment Variables in Vercel
Under the Environment Variables section in the Vercel project configuration, add the following variables:

| Variable Name | Value Description |
| :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<your-project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Your Firebase Project ID |
| `VITE_FIREBASE_APP_ID` | Public Firebase Web App ID |
| `GCLOUD_PROJECT` | Your Firebase Project ID |
| `FIREBASE_SERVICE_ACCOUNT` | The full raw JSON string from your downloaded private key file |
| `NODE_ENV` | `production` |

### 4. Deploy
Click Deploy. Vercel will build the frontend assets using Vite and set up the Express API under `/api`.

---

## Seeding the Production Database

To populate the initial organizations, policy rules, and demo accounts into your live Firestore database:

1. In PowerShell:
   ```powershell
   $env:GCLOUD_PROJECT = "your-project-id"
   $env:CONFIRM_SEED_PROJECT = "your-project-id"
   $env:FIREBASE_SERVICE_ACCOUNT = Get-Content "path\to\service-account.json" -Raw
   $env:SEED_PASSWORD = "YourChosenPassword12"
   npm run seed
   Remove-Item env:SEED_PASSWORD
   ```

2. In Linux / macOS:
   ```sh
   export GCLOUD_PROJECT="your-project-id"
   export CONFIRM_SEED_PROJECT="your-project-id"
   export FIREBASE_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
   export SEED_PASSWORD="YourChosenPassword12"
   npm run seed
   unset SEED_PASSWORD
   ```

---

## Local Development

1. Install dependencies:
   ```sh
   npm ci
   ```

2. Run type checking and production build:
   ```sh
   npm run typecheck
   npm run build
   ```

3. Start local development:
   ```sh
   npm run dev
   ```

---

## Security Boundaries and Clarifications

- Estimates, Not Statutory Payroll: Calculations provide estimated gross figures based on snapshotted base rates, recorded minutes, and break deductions. FairShift does not calculate tax deductions, statutory contributions, paid leave, or execute direct payments.
- Confidential, Not Anonymous: Reporting is authenticated and confidential. Reporter identity is omitted from standard employer lists, but privileged system administrators have access to database records. Workers are advised that freeform descriptions may inadvertently identify them.
- Operational Fairness Alerts: Workplace warnings (such as shift duration or rest intervals) reflect operational scheduling rules and demo policies, not medical conclusions or clinical fatigue diagnoses.
- Locked Firestore Rules: Client-side rules deny all direct browser reads and writes. All requests must pass through verified backend APIs.
