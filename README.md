# Online Complaint and Grievance Management System

A production-ready full-stack web application designed for educational institutions to lodge, track, manage, and resolve student grievances and complaints transparently and securely.

---

## 1. Project Title
**Online Complaint and Grievance Management System (OCGMS)**

---

## 2. Problem Statement
In traditional campus administration, student grievances concerning academic issues, hostel facilities, laboratory infrastructure, financial aid, and campus maintenance are submitted manually via paper forms or scattered email threads. This leads to:
- Lack of accountability and tracking.
- Long resolution turnarounds without visibility.
- Risk of lost physical complaints and omitted supporting evidence.
- Inability for institutional leadership to view aggregate grievance trends and performance metrics.

---

## 3. Project Objectives
1. Provide students with a centralized, mobile-responsive portal to lodge grievances, upload verified supporting evidence, and track progress via unique tracking numbers.
2. Provide college administrators with a dedicated grievance portal to review, categorize, transition statuses with mandatory audit logging, and communicate official responses.
3. Deliver aggregate analytics and visualizations (KPIs, distribution charts, monthly trends, resolution rates) computed directly in PostgreSQL.
4. Enforce strict role-based access control, cryptographic password hashing, parameterized SQL queries, CSRF defenses, and secure session management.

---

## 4. Features

### Student Portal
- **Secure Self-Registration & Authentication**: Student registration with name, college email, roll number, department, and bcrypt-hashed passwords.
- **Complaint Lodging**: File grievances with category selection, priority ranking (`Low`, `Medium`, `High`, `Urgent`), rich descriptions, and up to 3 verified attachments (PDF, JPG, PNG up to 5 MB each).
- **Automated Tracking ID**: Unpredictable tracking number generation (`GRV-YYYYMMDD-XXXXXXXX`).
- **Personal Grievance Tracking**: Filter and search through personal lodged complaints with real-time status indicators.
- **Detailed History & Official Responses**: Review status changes, administrative remarks, and official response letters.
- **Strict Data Isolation**: Students are strictly prohibited from viewing or downloading other students' complaints or attachments.

### Administrator Portal
- **Centralized Grievance Management**: Search complaints by tracking ID or title; filter by status, category, priority; sort by newest/oldest; pagination.
- **Transactional Status Transitions**: Move complaints through statuses (`Submitted`, `Under Review`, `In Progress`, `Resolved`, `Rejected`). Every status change atomically updates the complaint and records an immutable audit log entry in `complaint_logs`.
- **Official Administrative Responses**: Compose and send official replies stored in `complaint_responses` and immediately visible to the lodging student.
- **Secure Document Viewer**: Download and inspect student-submitted PDF and image evidence through authorization and path-traversal protected endpoints.
- **Analytics & Reporting Dashboard**: Real-time performance indicators and Chart.js visualizations:
  - KPI cards: Total Complaints, Resolved, Pending/Unresolved, Resolution Rate %.
  - Complaints by Status (Doughnut Chart).
  - Complaints by Category (Horizontal Bar Chart).
  - Complaints by Priority (Doughnut Chart).
  - 12-Month Submission & Resolution Trends (Line Chart with zero-month preservation).
  - Interactive multi-criteria filters (Year, Category, Status).

---

## 5. Technologies Used

- **Backend Runtime**: Node.js (v24 LTS)
- **Web Framework**: Express.js (v5)
- **Database**: PostgreSQL (v14+)
- **Database Driver**: `pg` (node-postgres connection pool)
- **Authentication & Sessions**: `express-session`, `connect-pg-simple` (PostgreSQL session store), `bcrypt` (10 salt rounds)
- **Security Middleware**: `helmet` (Strict Content Security Policy), `cors`, `express-rate-limit`, custom CSRF middleware
- **File Uploads**: `multer` with binary magic byte validation
- **Frontend Architecture**: Vanilla HTML5, CSS3 (Modern Flexbox & CSS Grid), JavaScript (Fetch API, DOM manipulation)
- **Data Visualizations**: Chart.js (v4.4.7 local UMD bundle)

---

## 6. System Architecture

```mermaid
flowchart TD
    Client["Browser Client (Vanilla HTML/CSS/JS)"]
    Proxy["Reverse Proxy / SSL (Render / Nginx)"]
    Express["Express.js Server (Port 5001)"]
    Security["Security Layer (Helmet, CORS, CSRF, RateLimit)"]
    SessionMgr["Session Manager (express-session)"]
    AuthMW["RBAC Middleware (requireAuth, requireAdmin)"]
    UploadMW["Upload Engine (Multer + Magic Byte Check)"]
    Controllers["Application Controllers (Auth, Complaint, Admin, Analytics)"]
    PgPool["PostgreSQL Connection Pool (pg.Pool)"]
    PostgresDB[("PostgreSQL Database (online_grievance_db)")]
    DiskStore["Local Disk / Persistent Storage (uploads/)"]

    Client -->|HTTPS / Requests| Proxy
    Proxy -->|Forward| Express
    Express --> Security
    Security --> SessionMgr
    SessionMgr --> AuthMW
    AuthMW --> UploadMW
    UploadMW --> Controllers
    UploadMW -->|Store Validated Files| DiskStore
    Controllers --> PgPool
    PgPool --> PostgresDB
    SessionMgr -->|Persist Sessions| PostgresDB
```

---

## 7. Project Folder Structure

```text
OnlineGrievanceSystem/
├── .env.example                  # Environment variable template
├── .gitignore                    # Git ignore file (excludes secrets, node_modules, uploads)
├── package.json                  # NPM dependencies and operational scripts
├── PROJECT_PLAN.md               # 3-day development blueprint and design specification
├── README.md                     # Comprehensive project documentation
├── database/
│   └── schema.sql                # Complete PostgreSQL DDL schema & table constraints
├── backend/
│   ├── server.js                 # Express server configuration, middleware, and entry point
│   ├── config/
│   │   └── db.js                 # Reusable PostgreSQL connection pool & query helper
│   ├── middleware/
│   │   ├── auth.js               # RBAC middleware (requireAuth, requireStudent, requireAdmin)
│   │   ├── csrf.js               # Custom CSRF defense middleware (Origin / Sec-Fetch-Site)
│   │   └── upload.js             # Multer upload handler with file signature validation
│   ├── controllers/
│   │   ├── authController.js     # Student registration, login, logout, session profile
│   │   ├── categoryController.js # Category master listing
│   │   ├── complaintController.js# Complaint submission, my complaints, details, secure downloads
│   │   └── adminController.js    # Admin complaint management, status transitions, responses, stats
│   ├── routes/
│   │   ├── authRoutes.js         # Authentication endpoints with rate limiting
│   │   ├── categoryRoutes.js     # Category endpoints
│   │   ├── complaintRoutes.js    # Student complaint endpoints
│   │   └── adminRoutes.js        # Admin management & analytics endpoints
│   └── scripts/
│       ├── initDb.js             # Automated database schema initialization script
│       ├── seedAdmin.js          # Idempotent admin account creation script
│       ├── testDbConnection.js   # DB connection test
│       ├── testAuth.js           # Authentication & RBAC test suite
│       ├── testComplaints.js     # Complaint submission & attachment test suite
│       ├── testAdminComplaints.js# Admin complaint management test suite
│       ├── testStudentFrontend.js# Student frontend integration test suite
│       ├── testAdminFrontend.js  # Admin frontend integration test suite
│       ├── testAnalytics.js      # Analytics and PostgreSQL aggregation test suite
│       ├── testSecurityAudit.js  # Security, CSRF, and isolation test suite
│       └── runAllTests.js        # Master regression test runner
├── frontend/
│   ├── index.html                # Public landing page
│   ├── login.html                # Portal login page (students & administrators)
│   ├── register.html             # Student account registration page
│   ├── css/
│   │   ├── styles.css            # Base design system, typography, colors, forms, alerts
│   │   └── dashboard.css         # Sidebar layouts, KPI cards, tables, timeline styles
│   ├── js/
│   │   ├── api.js                # Reusable fetch client, session guards, HTML escaping
│   │   ├── auth.js               # Login and registration form controllers
│   │   ├── student.js            # Student dashboard, submission, and complaint viewer
│   │   ├── admin.js              # Admin dashboard, complaint management, status updater
│   │   ├── analytics.js          # Chart.js visualization manager and filter toolbar
│   │   └── chart.min.js          # Local bundled Chart.js library
│   ├── student/
│   │   ├── dashboard.html        # Student dashboard with quick metrics and recent complaints
│   │   ├── submit-complaint.html # Multi-file complaint submission form
│   │   ├── my-complaints.html    # Filterable listing of lodged complaints
│   │   └── complaint-details.html# Comprehensive complaint details, timeline, and responses
│   └── admin/
│       ├── dashboard.html        # Administrative overview dashboard
│       ├── complaints.html       # Paginated complaint management grid with search/filters
│       ├── complaint-details.html# Administrative resolution panel with status updates
│       └── analytics.html        # Interactive analytics, metrics cards, and Chart.js graphs
└── uploads/                      # Dedicated directory for binary-validated complaint attachments
    └── .gitkeep                  # Preserves empty folder structure in version control
```

---

## 8. Database Tables and Relationships

The database consists of 7 relational tables defined in `database/schema.sql`:

1. **`users`**: Stores student and administrator credentials and department details.
   - Primary Key: `id`
   - Constraints: `email` UNIQUE, `role` CHECK IN (`'student'`, `'admin'`).
2. **`categories`**: Master list of grievance categories (e.g., Academic, Hostel & Mess, Infrastructure).
   - Primary Key: `id`
   - Constraints: `name` UNIQUE.
3. **`complaints`**: Core grievance records.
   - Primary Key: `id`
   - Foreign Keys: `student_id` REFERENCES `users(id)` ON DELETE CASCADE, `category_id` REFERENCES `categories(id)` ON DELETE RESTRICT.
   - Constraints: `tracking_id` UNIQUE, `priority` CHECK IN (`'Low'`, `'Medium'`, `'High'`, `'Urgent'`), `status` CHECK IN (`'Submitted'`, `'Under Review'`, `'In Progress'`, `'Resolved'`, `'Rejected'`).
4. **`complaint_attachments`**: Metadata for uploaded supporting documents.
   - Primary Key: `id`
   - Foreign Key: `complaint_id` REFERENCES `complaints(id)` ON DELETE CASCADE.
5. **`complaint_logs`**: Immutable audit log of every grievance status transition.
   - Primary Key: `id`
   - Foreign Keys: `complaint_id` REFERENCES `complaints(id)` ON DELETE CASCADE, `changed_by` REFERENCES `users(id)` ON DELETE RESTRICT.
6. **`complaint_responses`**: Official replies communicated by college administrators.
   - Primary Key: `id`
   - Foreign Keys: `complaint_id` REFERENCES `complaints(id)` ON DELETE CASCADE, `admin_id` REFERENCES `users(id)` ON DELETE RESTRICT.
7. **`session`**: Server-side PostgreSQL session store managed by `connect-pg-simple`.
   - Primary Key: `sid` (with index on `expire`).

---

## 9. Application Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Student
    actor Admin
    participant Frontend as Browser UI
    participant Backend as Express Server
    participant DB as PostgreSQL DB

    Note over Student,Frontend: Registration & Submission
    Student->>Frontend: Register student account
    Frontend->>Backend: POST /api/auth/register (Forces student role)
    Backend->>DB: INSERT into users (bcrypt password)
    Student->>Frontend: Log in
    Frontend->>Backend: POST /api/auth/login
    Backend->>DB: Verify bcrypt hash & regenerate session
    Backend-->>Frontend: Set session cookie (connect.sid)
    Student->>Frontend: Submit complaint + PDF/JPG files
    Frontend->>Backend: POST /api/complaints (multipart/form-data)
    Backend->>Backend: Check binary magic bytes & max 5 MB
    Backend->>DB: BEGIN Transaction
    Backend->>DB: INSERT into complaints (Tracking ID)
    Backend->>DB: INSERT into complaint_attachments
    Backend->>DB: INSERT initial complaint_logs ('Submitted')
    Backend->>DB: COMMIT Transaction
    Backend-->>Frontend: 201 Created (Tracking ID returned)

    Note over Admin,Frontend: Administrative Resolution
    Admin->>Frontend: Log in as administrator
    Frontend->>Backend: POST /api/auth/login
    Backend-->>Frontend: Admin session cookie
    Admin->>Frontend: Review complaint & update status to 'In Progress'
    Frontend->>Backend: PATCH /api/admin/complaints/:id/status
    Backend->>DB: BEGIN Transaction
    Backend->>DB: UPDATE complaints SET status = 'In Progress'
    Backend->>DB: INSERT into complaint_logs (old, new, remarks, admin_id)
    Backend->>DB: COMMIT Transaction
    Admin->>Frontend: Send official response
    Frontend->>Backend: POST /api/admin/complaints/:id/responses
    Backend->>DB: INSERT into complaint_responses
    Backend-->>Frontend: 201 Created

    Note over Student,Frontend: Verification
    Student->>Frontend: Open complaint details
    Frontend->>Backend: GET /api/complaints/:id
    Backend-->>Frontend: Return details, full timeline & admin responses
```

---

## 10. API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public (Rate-limited) | Register a student account (role forced to `student`) |
| `POST` | `/api/auth/login` | Public (Rate-limited) | Authenticate user, regenerate session, set cookie |
| `POST` | `/api/auth/logout` | Authenticated | Destroy server-side session and clear cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user profile |

### Categories (`/api/categories`)
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories` | Public / Authenticated | List all grievance categories |

### Complaints (`/api/complaints`)
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/complaints` | Student Only | Lodge complaint with optional file attachments (up to 3) |
| `GET` | `/api/complaints/my` | Student Only | List logged-in student's complaints with summary counters |
| `GET` | `/api/complaints/:id` | Student (Owner) / Admin | Retrieve full complaint details, history, responses, and attachments |
| `GET` | `/api/complaints/:id/attachments/:attachmentId` | Student (Owner) / Admin | Stream/download verified attachment file |

### Administrator Management (`/api/admin`)
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/complaints` | Admin Only | List all grievances with search, filter, sort, and pagination |
| `PATCH`| `/api/admin/complaints/:id/status` | Admin Only | Atomic status update and audit log creation |
| `POST` | `/api/admin/complaints/:id/responses` | Admin Only | Submit official administrative response |
| `GET` | `/api/admin/stats` | Admin Only | Retrieve aggregated metrics, status/category/priority breakdown, monthly trends |

---

## 11. Installation Prerequisites
Ensure the following tools are installed:
- **Node.js**: `v24 LTS` or higher (verified with Node `v24.22.3`)
- **NPM**: `v10` or `v11` (verified with npm `11.19.1`)
- **PostgreSQL**: `v14` or higher (verified with PostgreSQL `18.7`)

---

## 12. Local Setup Instructions

```bash
# 1. Clone or navigate to the repository
cd OnlineGrievanceSystem

# 2. Install dependencies
npm install

# 3. Create .env configuration from template
cp .env.example .env
```

---

## 13. Environment Variable Configuration

Edit `.env` with your local settings:

```ini
# Server Configuration
PORT=5001
NODE_ENV=development

# Security & CORS / CSRF Allowed Origins (comma-separated, optional)
ALLOWED_ORIGINS=http://localhost:5001

# Option A: Discrete PostgreSQL Parameters (Local Development)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=online_grievance_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_SSL=false

# Option B: Single Connection String (Render / Cloud Deployment)
# DATABASE_URL=postgres://user:password@hostname:5432/online_grievance_db?sslmode=require

# Session Secret (Generate a strong random key in production)
SESSION_SECRET=dev_grievance_secret_key_2026

# Upload Configuration
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=5

# Initial Administrator Seed Credentials
ADMIN_NAME=College Administrator
ADMIN_EMAIL=admin@college.edu
ADMIN_PASSWORD=AdminPass2026!
```

---

## 14. Database Setup Instructions

Ensure your local PostgreSQL server is active, create the database, and execute the schema runner:

```bash
# Create database (via psql or terminal)
createdb online_grievance_db

# Run automated schema initialization
npm run db:init
```

The script idempotently creates all 7 tables, sets foreign key constraints, checks, and builds performance indexes.

---

## 15. Admin Account Creation

Seed the initial administrator account using the configured credentials in `.env`:

```bash
npm run seed:admin
```

This creates the initial admin (`admin@college.edu`) with a secure bcrypt hash. The script is idempotent and will not duplicate or overwrite existing accounts.

---

## 16. How to Run the Application

```bash
# Start in production mode
npm start

# Start in development mode with auto-reload (nodemon)
npm run dev
```

Open your browser at:
`http://localhost:5001`

- **Public Landing**: `http://localhost:5001/index.html`
- **Login**: `http://localhost:5001/login.html`
- **Student Registration**: `http://localhost:5001/register.html`
- **Default Admin Account**: `admin@college.edu` / `AdminPass2026!`

---

## 17. Test Execution Instructions

Execute the master regression test suite covering all 8 modules and 71 individual automated test cases:

```bash
npm test
```

Or run individual module test suites:

```bash
node backend/scripts/testDbConnection.js    # DB connectivity test
node backend/scripts/testAuth.js            # Authentication & RBAC (10 cases)
node backend/scripts/testComplaints.js      # Complaint submission & uploads (12 cases)
node backend/scripts/testAdminComplaints.js # Admin complaint management (12 cases)
node backend/scripts/testStudentFrontend.js # Student frontend integration (10 cases)
node backend/scripts/testAdminFrontend.js   # Admin frontend integration (10 cases)
node backend/scripts/testAnalytics.js       # PostgreSQL aggregations & metrics (10 cases)
node backend/scripts/testSecurityAudit.js   # CSRF, zero-month & isolation audit (6 cases)
```

---

## 18. Deployment Instructions (Render + PostgreSQL)

### Step 1: Provision a PostgreSQL Database on Render
1. Create a **New PostgreSQL** instance on [Render](https://render.com).
2. Note the **Internal Database URL** provided by Render.

### Step 2: Deploy the Web Service
1. Create a **New Web Service** pointing to your repository.
2. Select **Node** environment.
3. Configure settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add the following **Environment Variables** in Render's dashboard:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: Your Render PostgreSQL Internal Database URL.
   - `SESSION_SECRET`: A secure, random 32+ character string.
   - `ADMIN_NAME`: `College Administrator`
   - `ADMIN_EMAIL`: `admin@college.edu`
   - `ADMIN_PASSWORD`: A secure production administrator password.
   - `UPLOAD_DIR`: `uploads`
   - `MAX_FILE_SIZE_MB`: `5`

### Step 3: Run Database Initialization on Render
In Render's **Shell** tab for the Web Service, run:
```bash
npm run db:init
npm run seed:admin
```

Your service is now fully operational with HTTPS, secure cookies, and PostgreSQL session persistence.

---

## 19. Security Measures

- **SQL Injection Defense**: 100% of database queries use parameterized SQL markers (`$1, $2, ...`). Direct string interpolation into SQL queries is strictly avoided.
- **Password Protection**: Passwords are never stored in plaintext. Passwords are salted and hashed using `bcrypt` (10 rounds).
- **Session Security**: Server-side sessions are stored in PostgreSQL via `connect-pg-simple`. Session IDs are regenerated upon authentication to defend against session fixation attacks. Session cookies use `httpOnly: true`, `sameSite: 'lax'`, and dynamic `secure: true` in production.
- **Cross-Site Request Forgery (CSRF)**:
  - Custom CSRF middleware rejects cross-site requests (`Sec-Fetch-Site: cross-site`).
  - `Origin` and `Referer` headers are strictly validated against `req.headers.host` and whitelisted domains.
- **Cross-Origin Resource Sharing (CORS)**: Restricted to same-origin and explicitly allowed origins; arbitrary credentialed cross-origin requests are blocked.
- **HTTP Security Headers**: Powered by `helmet` with a strict Content Security Policy (`script-src 'self'`), `X-Frame-Options: SAMEORIGIN`, `nosniff`, and `no-referrer`.
- **Brute-Force Rate Limiting**: Authentication routes (`/api/auth/register` and `/api/auth/login`) are protected by `express-rate-limit` (30 requests per 15-minute window per IP in development/production).
- **File Upload Hardening**:
  - Whitelist restricted to `.pdf`, `.jpg`, `.jpeg`, `.png`.
  - Binary signature inspection (magic bytes `%PDF`, `PNG`, `JPEG`) ensures disguised scripts or executables are discarded immediately.
  - File size restricted to 5 MB per file; maximum 3 files per complaint.
  - Filenames are randomized with 16-byte cryptographic hex strings.
- **Path Traversal Protection**: Attachment downloads verify `path.resolve(filePath).startsWith(safeUploadsDir)` and validate complaint student ownership prior to streaming.
- **XSS Prevention**: Frontend templates strictly escape dynamic content using `api.escapeHTML()` before rendering into the DOM.

---

## 20. Known Limitations & Recommendations

1. **Ephemeral Local Storage on Free PaaS**:
   - Render's standard web service containers use an ephemeral filesystem. Any files uploaded to `uploads/` will be reset on application restart or redeployment.
   - *Production Recommendation*: For high-scale or persistent production deployments, attach a **Render Persistent Disk** to the `/uploads` path, or stream attachment uploads directly to a cloud object store such as **Amazon S3** or **Cloudinary**.
2. **Email Notifications**:
   - Email dispatch (e.g. SMTP via Nodemailer or SendGrid) for automated status change alerts is not included in this release.
   - *Recommendation*: Introduce an asynchronous background worker using `nodemailer` to notify students when an administrator updates complaint status or posts an official reply.
3. **Automated Visual Browser Verification**:
   - Automated visual browser driving using the Chrome DevTools protocol was disabled because the headless Chrome driver was not configured on the local host. All UI/UX flows and DOM behaviors are verified via HTTP end-to-end integration test suites simulating authenticated browser cookie sessions.
