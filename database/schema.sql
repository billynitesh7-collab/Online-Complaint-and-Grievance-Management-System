-- ============================================================
-- Online Complaint and Grievance Management System
-- PostgreSQL Database Schema
-- ============================================================

-- 1. Users Table (Students and Administrators)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    roll_number VARCHAR(50),
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Complaint Categories Master Table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- 3. Core Complaints Table
CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY,
    tracking_id VARCHAR(32) UNIQUE NOT NULL,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium' 
        CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status VARCHAR(30) NOT NULL DEFAULT 'Submitted' 
        CHECK (status IN ('Submitted', 'Under Review', 'In Progress', 'Resolved', 'Rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Complaint Supporting Attachments (PDFs & Images)
CREATE TABLE IF NOT EXISTS complaint_attachments (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Complaint Status History & Audit Logs
CREATE TABLE IF NOT EXISTS complaint_logs (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    changed_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Dedicated Complaint Responses (Official Admin Responses)
CREATE TABLE IF NOT EXISTS complaint_responses (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    admin_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Express Session Store Table (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL COLLATE "default",
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

-- Indexes for Fast Query Lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_complaints_tracking_id ON complaints(tracking_id);
CREATE INDEX IF NOT EXISTS idx_complaints_student_id ON complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_complaints_category_id ON complaints(category_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints(priority);
CREATE INDEX IF NOT EXISTS idx_attachments_complaint_id ON complaint_attachments(complaint_id);
CREATE INDEX IF NOT EXISTS idx_logs_complaint_id ON complaint_logs(complaint_id);
CREATE INDEX IF NOT EXISTS idx_responses_complaint_id ON complaint_responses(complaint_id);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Initial Master Seed: Complaint Categories
INSERT INTO categories (name, description) VALUES
    ('Academic', 'Issues regarding lectures, faculty, syllabus, grading, and examinations'),
    ('Hostel & Mess', 'Room maintenance, sanitation, water supply, electricity, and mess food quality'),
    ('Infrastructure', 'Classrooms, laboratory equipment, sports grounds, and campus electrical/civil works'),
    ('Library', 'Book availability, digital access, study spaces, and borrowing cards'),
    ('Finance & Accounts', 'Fee payments, receipts, scholarship disbursements, and caution deposit refunds'),
    ('General Grievance', 'Administrative matters, student welfare, transport, and other campus concerns')
ON CONFLICT (name) DO NOTHING;
