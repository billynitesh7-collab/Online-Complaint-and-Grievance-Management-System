/**
 * Automated Verification Script for Student Frontend Integration
 * Covers the 10 testing requirements from Task 6.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, query } = require('../config/db');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

const TEST_STUDENT = {
  name: 'FrontEnd Sarah',
  email: 'frontend_sarah@college.edu',
  password: 'PasswordSarah123!',
  rollNumber: 'CS-FE-2026',
  department: 'Computer Science',
};

const results = [];

function recordResult(caseNum, title, passed, details) {
  results.push({ caseNum, title, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Case ${caseNum}] ${title}: ${details}`);
}

async function runTests() {
  console.log('=== STARTING 10-POINT STUDENT FRONTEND INTEGRATION TEST SUITE ===\n');

  try {
    // 0. Cleanup prior data
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email = $1
      )`,
      [TEST_STUDENT.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email = $1', [TEST_STUDENT.email.toLowerCase()]);

    // 1. Verify frontend static file delivery
    const indexRes = await fetch(`${BASE_URL}/`);
    const indexHtml = await indexRes.text();
    const loginRes = await fetch(`${BASE_URL}/login.html`);
    const regRes = await fetch(`${BASE_URL}/register.html`);
    const dashRes = await fetch(`${BASE_URL}/student/dashboard.html`);

    const staticDeliveryOk =
      indexRes.status === 200 &&
      indexHtml.includes('College Grievance Portal') &&
      loginRes.status === 200 &&
      regRes.status === 200 &&
      dashRes.status === 200;

    // ----------------------------------------------------
    // Test 1: Student can register and log in
    // ----------------------------------------------------
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_STUDENT),
    });
    const regData = await registerRes.json();

    const loginRes2 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
      }),
    });
    const loginData = await loginRes2.json();
    const cookie = loginRes2.headers.get('set-cookie')?.split(';')[0];

    if (
      staticDeliveryOk &&
      registerRes.status === 201 &&
      loginRes2.status === 200 &&
      loginData.data.user.role === 'student' &&
      cookie
    ) {
      recordResult(
        1,
        'Student can register and log in',
        true,
        `Static HTML served (200), registered ID ${regData.data.user.id}, logged in (role=student), session cookie set.`
      );
    } else {
      recordResult(1, 'Student can register and log in', false, `Reg: ${registerRes.status}, Login: ${loginRes2.status}`);
    }

    // ----------------------------------------------------
    // Test 2: Dashboard displays real user information
    // ----------------------------------------------------
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const meData = await meRes.json();

    const myComplaintsRes = await fetch(`${BASE_URL}/api/complaints/my`, {
      headers: { Cookie: cookie },
    });
    const myData = await myComplaintsRes.json();

    if (
      meRes.status === 200 &&
      meData.data.user.name === TEST_STUDENT.name &&
      myComplaintsRes.status === 200 &&
      typeof myData.data.summary.total === 'number'
    ) {
      recordResult(
        2,
        'Dashboard displays real user information',
        true,
        `Current user verified ("${meData.data.user.name}", Roll: "${meData.data.user.rollNumber}"), initial DB total=${myData.data.summary.total}.`
      );
    } else {
      recordResult(2, 'Dashboard displays real user information', false, `Me: ${meRes.status}, MyComplaints: ${myComplaintsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 3 & 4: Category dropdown loads from PostgreSQL & Complaint submission works
    // ----------------------------------------------------
    const catRes = await fetch(`${BASE_URL}/api/categories`);
    const catData = await catRes.json();
    const categories = catData.data.categories;
    const catLoaded = Array.isArray(categories) && categories.length >= 6;

    if (catLoaded) {
      recordResult(4, 'Category dropdown loads from PostgreSQL', true, `Loaded ${categories.length} categories from DB.`);
    } else {
      recordResult(4, 'Category dropdown loads from PostgreSQL', false, `Categories not loaded.`);
    }

    // ----------------------------------------------------
    // Test 5 & 3: Attachments upload successfully & Complaint submission works
    // ----------------------------------------------------
    const testPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const fd = new FormData();
    fd.append('title', 'Water filtration unit not working in library 2nd floor');
    fd.append('description', 'Filter light is blinking red and water has a noticeable taste. Needs cartridge replacement.');
    fd.append('category_id', String(categories[0].id));
    fd.append('priority', 'Medium');
    fd.append('attachments', new Blob([testPdfBytes], { type: 'application/pdf' }), 'water_test_report.pdf');

    const submitRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: fd,
    });
    const submitData = await submitRes.json();
    const submittedComplaint = submitData.data?.complaint;

    if (submitRes.status === 201 && submittedComplaint?.trackingId) {
      recordResult(
        3,
        'Complaint submission works',
        true,
        `Status 201, generated Tracking ID: ${submittedComplaint.trackingId}.`
      );
    } else {
      recordResult(3, 'Complaint submission works', false, `Submit failed: ${submitRes.status}`);
    }

    if (submittedComplaint?.attachments?.length === 1 && submittedComplaint.attachments[0].originalName === 'water_test_report.pdf') {
      recordResult(
        5,
        'Attachments upload successfully',
        true,
        `Attachment "${submittedComplaint.attachments[0].originalName}" saved with download URL "${submittedComplaint.attachments[0].downloadUrl}".`
      );
    } else {
      recordResult(5, 'Attachments upload successfully', false, `Attachment metadata missing.`);
    }

    // ----------------------------------------------------
    // Test 6: My Complaints displays the student's records
    // ----------------------------------------------------
    const myUpdatedRes = await fetch(`${BASE_URL}/api/complaints/my`, {
      headers: { Cookie: cookie },
    });
    const myUpdatedData = await myUpdatedRes.json();
    const studentComplaints = myUpdatedData.data.complaints;
    const hasSubmittedComplaint = studentComplaints.some(
      (c) => c.trackingId === submittedComplaint.trackingId
    );

    if (myUpdatedRes.status === 200 && hasSubmittedComplaint && myUpdatedData.data.summary.total >= 1) {
      recordResult(
        6,
        "My Complaints displays the student's records",
        true,
        `Retrieved ${studentComplaints.length} complaint(s); tracking ID matched; summary total=${myUpdatedData.data.summary.total}.`
      );
    } else {
      recordResult(6, "My Complaints displays student's records", false, `Status: ${myUpdatedRes.status}`);
    }

    // ----------------------------------------------------
    // Test 7: Complaint details display history and responses
    // ----------------------------------------------------
    // Let admin post a status update & response so details page has full data
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@college.edu',
        password: process.env.ADMIN_PASSWORD || 'AdminPass2026!',
      }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0];

    // Admin updates status to Under Review
    await fetch(`${BASE_URL}/api/admin/complaints/${submittedComplaint.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Under Review', remarks: 'Plumbing contractor notified' }),
    });

    // Admin sends response
    await fetch(`${BASE_URL}/api/admin/complaints/${submittedComplaint.id}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ message: 'Technician scheduled for inspection tomorrow 10 AM.' }),
    });

    // Student fetches details
    const detailsRes = await fetch(`${BASE_URL}/api/complaints/${submittedComplaint.id}`, {
      headers: { Cookie: cookie },
    });
    const detailsData = await detailsRes.json();
    const details = detailsData.data?.complaint;

    const hasHistory = details?.history?.length >= 2; // initial 'Submitted' + 'Under Review'
    const hasResponses = details?.responses?.length >= 1;

    if (detailsRes.status === 200 && hasHistory && hasResponses) {
      recordResult(
        7,
        'Complaint details display history and responses',
        true,
        `Status 200, history entries=${details.history.length}, responses=${details.responses.length}.`
      );
    } else {
      recordResult(7, 'Complaint details display history and responses', false, `Status: ${detailsRes.status}, hist=${details?.history?.length}, resp=${details?.responses?.length}`);
    }

    // ----------------------------------------------------
    // Test 8: Attachment downloads work
    // ----------------------------------------------------
    const attId = details.attachments[0].id;
    const dlRes = await fetch(`${BASE_URL}/api/complaints/${submittedComplaint.id}/attachments/${attId}`, {
      headers: { Cookie: cookie },
    });
    const dlBuffer = await dlRes.arrayBuffer();

    if (dlRes.status === 200 && dlRes.headers.get('content-type') === 'application/pdf' && dlBuffer.byteLength > 0) {
      recordResult(
        8,
        'Attachment downloads work',
        true,
        `Status 200, Content-Type="application/pdf", downloaded ${dlBuffer.byteLength} bytes.`
      );
    } else {
      recordResult(8, 'Attachment downloads work', false, `Status ${dlRes.status}`);
    }

    // ----------------------------------------------------
    // Test 9: Logout works
    // ----------------------------------------------------
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    const postLogoutMe = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookie },
    });

    if (logoutRes.status === 200 && postLogoutMe.status === 401) {
      recordResult(
        9,
        'Logout works',
        true,
        `Logout returned 200, subsequent /api/auth/me with old cookie returned 401 Unauthorized.`
      );
    } else {
      recordResult(9, 'Logout works', false, `Post logout check: ${postLogoutMe.status}`);
    }

    // ----------------------------------------------------
    // Test 10: Unauthenticated users cannot access protected student APIs
    // ----------------------------------------------------
    const unauthMyRes = await fetch(`${BASE_URL}/api/complaints/my`);
    const unauthSubmitRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      body: new FormData(),
    });

    if (unauthMyRes.status === 401 && unauthSubmitRes.status === 401) {
      recordResult(
        10,
        'Unauthenticated users cannot access protected student APIs',
        true,
        `Both GET /api/complaints/my and POST /api/complaints returned 401 Unauthorized.`
      );
    } else {
      recordResult(10, 'Unauthenticated users access check', false, `My: ${unauthMyRes.status}, Submit: ${unauthSubmitRes.status}`);
    }

    // Clean up temporary test data
    console.log('\nCleaning up temporary test student data...');
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email = $1
      )`,
      [TEST_STUDENT.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email = $1', [TEST_STUDENT.email.toLowerCase()]);
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
    console.log('ALL 10 TEST CASES PASSED SUCCESSFULLY!');
  } else {
    console.error('SOME TESTS FAILED!');
  }
}

runTests();
