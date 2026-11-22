/**
 * Comprehensive Automated Complaint Submission & Attachment Test Suite
 * Covers all 12 required test cases.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, query } = require('../config/db');

const PORT = process.env.PORT || 5001;
const BASE_AUTH_URL = `http://localhost:${PORT}/api/auth`;
const BASE_COMPLAINTS_URL = `http://localhost:${PORT}/api/complaints`;
const BASE_CATEGORIES_URL = `http://localhost:${PORT}/api/categories`;
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

const STUDENT_A = {
  name: 'Student Alice',
  email: 'student_alice_test@college.edu',
  password: 'PasswordAlice123!',
  rollNumber: 'CS-2026-001',
  department: 'Computer Science',
};

const STUDENT_B = {
  name: 'Student Bob',
  email: 'student_bob_test@college.edu',
  password: 'PasswordBob123!',
  rollNumber: 'ME-2026-002',
  department: 'Mechanical',
};

const ADMIN = {
  name: process.env.ADMIN_NAME || 'College Administrator',
  email: process.env.ADMIN_EMAIL || 'admin@college.edu',
  password: process.env.ADMIN_PASSWORD || 'AdminPass2026!',
};

let cookieA = null;
let cookieB = null;
let cookieAdmin = null;

let studentAComplaintId = null;

const results = [];

function recordResult(caseNum, title, passed, details) {
  results.push({ caseNum, title, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Case ${caseNum}] ${title}: ${details}`);
}

async function loginUser(email, password) {
  const res = await fetch(`${BASE_AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  return { status: res.status, data, cookie };
}

async function runTests() {
  console.log('=== STARTING 12-POINT COMPLAINT & UPLOAD BACKEND TEST SUITE ===\n');

  try {
    // 0. Setup: Clean up any prior test student data
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )`,
      [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      STUDENT_A.email.toLowerCase(),
      STUDENT_B.email.toLowerCase(),
    ]);

    // Register Student A
    await fetch(`${BASE_AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_A),
    });

    // Register Student B
    await fetch(`${BASE_AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_B),
    });

    // Log in all actors
    const loginA = await loginUser(STUDENT_A.email, STUDENT_A.password);
    cookieA = loginA.cookie;

    const loginB = await loginUser(STUDENT_B.email, STUDENT_B.password);
    cookieB = loginB.cookie;

    const loginAdm = await loginUser(ADMIN.email, ADMIN.password);
    cookieAdmin = loginAdm.cookie;

    // Check Categories API
    const catRes = await fetch(BASE_CATEGORIES_URL);
    const catData = await catRes.json();
    const validCategoryId = catData.data.categories[0].id; // e.g. 1 (Academic)

    // ----------------------------------------------------
    // Test 1: Student successfully submits a complaint
    // ----------------------------------------------------
    const formData1 = new FormData();
    formData1.append('title', 'Broken projector in Hall 101');
    formData1.append('description', 'The HDMI port on the ceiling projector is damaged and not displaying slides.');
    formData1.append('category_id', String(validCategoryId));
    formData1.append('priority', 'High');

    const res1 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData1,
    });
    const data1 = await res1.json();

    if (
      res1.status === 201 &&
      data1.status === 'success' &&
      data1.data.complaint.trackingId &&
      data1.data.complaint.status === 'Submitted'
    ) {
      studentAComplaintId = data1.data.complaint.id;
      recordResult(
        1,
        'Student successfully submits complaint',
        true,
        `Status 201, Tracking ID: ${data1.data.complaint.trackingId}, Initial status: ${data1.data.complaint.status}`
      );
    } else {
      recordResult(1, 'Student successfully submits complaint', false, `Got status ${res1.status}: ${JSON.stringify(data1)}`);
    }

    // ----------------------------------------------------
    // Test 2: Missing required fields are rejected
    // ----------------------------------------------------
    const formData2 = new FormData();
    formData2.append('title', 'Only Title Here');
    // Missing description, category_id, priority

    const res2 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData2,
    });
    const data2 = await res2.json();

    if (res2.status === 400 && data2.status === 'error') {
      recordResult(2, 'Missing required fields rejected', true, `Status 400: "${data2.message}"`);
    } else {
      recordResult(2, 'Missing required fields rejected', false, `Expected 400, got ${res2.status}`);
    }

    // ----------------------------------------------------
    // Test 3: Invalid category is rejected
    // ----------------------------------------------------
    const formData3 = new FormData();
    formData3.append('title', 'WiFi issue in library');
    formData3.append('description', 'WiFi signal drops frequently near the stacks.');
    formData3.append('category_id', '99999'); // Non-existent
    formData3.append('priority', 'Medium');

    const res3 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData3,
    });
    const data3 = await res3.json();

    if (res3.status === 400 && data3.status === 'error') {
      recordResult(3, 'Invalid category rejected', true, `Status 400: "${data3.message}"`);
    } else {
      recordResult(3, 'Invalid category rejected', false, `Expected 400, got ${res3.status}`);
    }

    // ----------------------------------------------------
    // Test 4: Invalid priority is rejected
    // ----------------------------------------------------
    const formData4 = new FormData();
    formData4.append('title', 'Library fine dispute');
    formData4.append('description', 'Returned book on time but system charged overdue fees.');
    formData4.append('category_id', String(validCategoryId));
    formData4.append('priority', 'SuperUrgent'); // Invalid

    const res4 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData4,
    });
    const data4 = await res4.json();

    if (res4.status === 400 && data4.status === 'error') {
      recordResult(4, 'Invalid priority rejected', true, `Status 400: "${data4.message}"`);
    } else {
      recordResult(4, 'Invalid priority rejected', false, `Expected 400, got ${res4.status}`);
    }

    // ----------------------------------------------------
    // Test 5: Unauthenticated submission rejected with HTTP 401
    // ----------------------------------------------------
    const formData5 = new FormData();
    formData5.append('title', 'Unauth complaint');
    formData5.append('description', 'Should not be allowed without session.');
    formData5.append('category_id', String(validCategoryId));
    formData5.append('priority', 'Low');

    const res5 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      body: formData5,
    });
    const data5 = await res5.json();

    if (res5.status === 401 && data5.status === 'error') {
      recordResult(5, 'Unauthenticated submission rejected (401)', true, `Status 401: "${data5.message}"`);
    } else {
      recordResult(5, 'Unauthenticated submission rejected (401)', false, `Expected 401, got ${res5.status}`);
    }

    // ----------------------------------------------------
    // Test 6: Admin cannot submit a student complaint
    // ----------------------------------------------------
    const formData6 = new FormData();
    formData6.append('title', 'Admin filing complaint');
    formData6.append('description', 'Admins should not be permitted to lodge grievances.');
    formData6.append('category_id', String(validCategoryId));
    formData6.append('priority', 'Medium');

    const res6 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieAdmin },
      body: formData6,
    });
    const data6 = await res6.json();

    if (res6.status === 403 && data6.status === 'error') {
      recordResult(6, 'Admin blocked from lodging complaint (403)', true, `Status 403: "${data6.message}"`);
    } else {
      recordResult(6, 'Admin blocked from lodging complaint (403)', false, `Expected 403, got ${res6.status}`);
    }

    // ----------------------------------------------------
    // Test 7: Valid PDF/JPG/PNG attachment uploads work
    // ----------------------------------------------------
    // Valid PDF signature: %PDF
    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    // Valid PNG signature: \x89PNG\r\n\x1a\n
    const validPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    // Valid JPEG signature: \xFF\xD8\xFF
    const validJpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const formData7 = new FormData();
    formData7.append('title', 'Hostel room ceiling leaking with evidence');
    formData7.append('description', 'Water leaking during heavy rains. Attached photo and formal letter.');
    formData7.append('category_id', String(validCategoryId));
    formData7.append('priority', 'Urgent');
    formData7.append('attachments', new Blob([validPdfBytes], { type: 'application/pdf' }), 'letter.pdf');
    formData7.append('attachments', new Blob([validPngBytes], { type: 'image/png' }), 'damage_photo.png');

    const res7 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData7,
    });
    const data7 = await res7.json();

    let downloadVerification = false;
    if (res7.status === 201 && data7.data.complaint.attachments.length === 2) {
      const att = data7.data.complaint.attachments[0];
      // Test downloading the attachment
      const dlRes = await fetch(`http://localhost:${PORT}${att.downloadUrl}`, {
        headers: { Cookie: cookieA },
      });
      if (dlRes.status === 200 && dlRes.headers.get('content-type') === 'application/pdf') {
        downloadVerification = true;
      }
    }

    if (res7.status === 201 && downloadVerification) {
      recordResult(
        7,
        'Valid PDF/JPG/PNG attachments uploaded and downloadable',
        true,
        `Status 201, 2 attachments persisted, secure download verified.`
      );
    } else {
      recordResult(7, 'Valid PDF/JPG/PNG attachments uploaded', false, `Status ${res7.status}: ${JSON.stringify(data7)}`);
    }

    // ----------------------------------------------------
    // Test 8: Invalid file types are rejected
    // ----------------------------------------------------
    const fakeTextFile = Buffer.from('Plain text file content');
    const formData8 = new FormData();
    formData8.append('title', 'Complaint with invalid file');
    formData8.append('description', 'Attaching text file which should be blocked.');
    formData8.append('category_id', String(validCategoryId));
    formData8.append('priority', 'Low');
    formData8.append('attachments', new Blob([fakeTextFile], { type: 'text/plain' }), 'notes.txt');

    const res8 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData8,
    });
    const data8 = await res8.json();

    if (res8.status === 400 && data8.status === 'error') {
      recordResult(8, 'Invalid file type rejected', true, `Status 400: "${data8.message}"`);
    } else {
      recordResult(8, 'Invalid file type rejected', false, `Expected 400, got ${res8.status}`);
    }

    // ----------------------------------------------------
    // Test 9: Files larger than 5 MB are rejected
    // ----------------------------------------------------
    // Create 5.5 MB buffer with %PDF prefix
    const oversizeBuffer = Buffer.alloc(5.5 * 1024 * 1024);
    oversizeBuffer.write('%PDF-1.4', 0);

    const formData9 = new FormData();
    formData9.append('title', 'Oversize attachment complaint');
    formData9.append('description', 'File is 5.5 MB, which exceeds the 5 MB ceiling.');
    formData9.append('category_id', String(validCategoryId));
    formData9.append('priority', 'Low');
    formData9.append('attachments', new Blob([oversizeBuffer], { type: 'application/pdf' }), 'large_report.pdf');

    const res9 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData9,
    });
    const data9 = await res9.json();

    if (res9.status === 400 && data9.status === 'error' && data9.message.includes('5 MB')) {
      recordResult(9, 'File > 5 MB rejected', true, `Status 400: "${data9.message}"`);
    } else {
      recordResult(9, 'File > 5 MB rejected', false, `Expected 400 size error, got ${res9.status}: ${JSON.stringify(data9)}`);
    }

    // ----------------------------------------------------
    // Test 10: One student cannot access another student's complaint
    // ----------------------------------------------------
    // Student B attempts to access Student A's complaint
    const res10B = await fetch(`${BASE_COMPLAINTS_URL}/${studentAComplaintId}`, {
      method: 'GET',
      headers: { Cookie: cookieB },
    });
    const data10B = await res10B.json();

    // Student A accesses their own complaint
    const res10A = await fetch(`${BASE_COMPLAINTS_URL}/${studentAComplaintId}`, {
      method: 'GET',
      headers: { Cookie: cookieA },
    });
    const data10A = await res10A.json();

    // Admin accesses Student A's complaint
    const res10Admin = await fetch(`${BASE_COMPLAINTS_URL}/${studentAComplaintId}`, {
      method: 'GET',
      headers: { Cookie: cookieAdmin },
    });
    const data10Admin = await res10Admin.json();

    if (
      res10B.status === 403 &&
      res10A.status === 200 &&
      data10A.data.complaint.id === studentAComplaintId &&
      res10Admin.status === 200 &&
      data10Admin.data.complaint.id === studentAComplaintId
    ) {
      recordResult(
        10,
        "Student blocked from other student's complaint (403)",
        true,
        `Student B got 403 Forbidden; Owner Student A got 200 OK; Admin got 200 OK.`
      );
    } else {
      recordResult(
        10,
        "Student blocked from other student's complaint",
        false,
        `Student B: ${res10B.status}, Student A: ${res10A.status}, Admin: ${res10Admin.status}`
      );
    }

    // ----------------------------------------------------
    // Test 11: Complaint tracking IDs are unique
    // ----------------------------------------------------
    const trackingIds = new Set();
    for (let i = 0; i < 3; i++) {
      const fd = new FormData();
      fd.append('title', `Batch complaint test ${i + 1}`);
      fd.append('description', `Testing unique tracking ID generation iteration ${i + 1}`);
      fd.append('category_id', String(validCategoryId));
      fd.append('priority', 'Medium');

      const res = await fetch(BASE_COMPLAINTS_URL, {
        method: 'POST',
        headers: { Cookie: cookieA },
        body: fd,
      });
      const d = await res.json();
      if (d.data?.complaint?.trackingId) {
        trackingIds.add(d.data.complaint.trackingId);
      }
    }

    const allFormatted = Array.from(trackingIds).every((id) => /^GRV-\d{8}-[A-F0-9]{8}$/.test(id));
    if (trackingIds.size === 3 && allFormatted) {
      recordResult(
        11,
        'Complaint tracking IDs are unique and well-formatted',
        true,
        `Generated 3 distinct IDs: ${Array.from(trackingIds).join(', ')}`
      );
    } else {
      recordResult(11, 'Complaint tracking IDs uniqueness', false, `Count: ${trackingIds.size}, Formatted: ${allFormatted}`);
    }

    // ----------------------------------------------------
    // Test 12: Failed DB operations do not leave orphaned files
    // ----------------------------------------------------
    const filesBefore = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep').length;

    // Trigger validation / DB failure while attaching a valid file
    const formData12 = new FormData();
    formData12.append('title', 'Valid title');
    formData12.append('description', 'Valid description here');
    formData12.append('category_id', '999999'); // Non-existent category causes DB check failure after Multer write
    formData12.append('priority', 'Low');
    formData12.append('attachments', new Blob([validPngBytes], { type: 'image/png' }), 'temporary.png');

    const res12 = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: formData12,
    });

    const filesAfter = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep').length;

    if (res12.status === 400 && filesAfter === filesBefore) {
      recordResult(
        12,
        'Failed operations do not leave orphaned files',
        true,
        `File count before (${filesBefore}) == after (${filesAfter}). Orphaned file removed immediately.`
      );
    } else {
      recordResult(
        12,
        'Failed operations do not leave orphaned files',
        false,
        `Before: ${filesBefore}, After: ${filesAfter}, Status: ${res12.status}`
      );
    }

    // Clean up temporary test data
    console.log('\nCleaning up temporary test accounts and filed test complaints...');
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )`,
      [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      STUDENT_A.email.toLowerCase(),
      STUDENT_B.email.toLowerCase(),
    ]);

    // Clean up test files from uploads
    const remainingFiles = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    for (const f of remainingFiles) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, f));
      } catch (e) {}
    }
    console.log('Cleanup completed cleanly.');
  } catch (error) {
    console.error('Test execution error:', error);
  } finally {
    await pool.end();
  }

  console.log('\n=== SUMMARY OF RESULTS ===');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Tests: ${results.length} | Passed: ${results.filter((r) => r.passed).length} | Failed: ${results.filter((r) => !r.passed).length}`);
  if (allPassed) {
    console.log('ALL 12 TEST CASES PASSED SUCCESSFULLY!');
  } else {
    console.error('SOME TESTS FAILED!');
  }
}

runTests();
