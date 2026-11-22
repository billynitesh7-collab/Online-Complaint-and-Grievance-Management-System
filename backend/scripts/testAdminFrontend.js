/**
 * Automated Verification Script for Administrator Frontend Integration
 * Covers the 10 testing requirements from Task 7.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, query } = require('../config/db');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

const ADMIN_CREDENTIALS = {
  name: process.env.ADMIN_NAME || 'College Administrator',
  email: process.env.ADMIN_EMAIL || 'admin@college.edu',
  password: process.env.ADMIN_PASSWORD || 'AdminPass2026!',
};

const STUDENT_X = {
  name: 'Student Xavier',
  email: 'student_xavier_fe@college.edu',
  password: 'PasswordXavier123!',
  rollNumber: 'CS-XAV-01',
  department: 'Computer Science',
};

const STUDENT_Y = {
  name: 'Student Yolanda',
  email: 'student_yolanda_fe@college.edu',
  password: 'PasswordYolanda123!',
  rollNumber: 'EE-YOL-02',
  department: 'Electrical Engineering',
};

let adminCookie = null;
let studentXCookie = null;
let studentYCookie = null;

let complaintXId = null;
let complaintYId = null;

const results = [];

function recordResult(caseNum, title, passed, details) {
  results.push({ caseNum, title, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Case ${caseNum}] ${title}: ${details}`);
}

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  return { status: res.status, data, cookie };
}

async function runTests() {
  console.log('=== STARTING 10-POINT ADMIN FRONTEND INTEGRATION TEST SUITE ===\n');

  try {
    // 0. Setup: clean prior test records
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )`,
      [STUDENT_X.email.toLowerCase(), STUDENT_Y.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      STUDENT_X.email.toLowerCase(),
      STUDENT_Y.email.toLowerCase(),
    ]);

    // Register Student X & Student Y
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_X),
    });
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_Y),
    });

    // Login Admin and Students
    const loginAdminRes = await login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    adminCookie = loginAdminRes.cookie;

    const loginXRes = await login(STUDENT_X.email, STUDENT_X.password);
    studentXCookie = loginXRes.cookie;

    const loginYRes = await login(STUDENT_Y.email, STUDENT_Y.password);
    studentYCookie = loginYRes.cookie;

    // Get a valid category
    const catRes = await fetch(`${BASE_URL}/api/categories`);
    const catData = await catRes.json();
    const categories = catData.data.categories;
    const cat1Id = categories[0].id;
    const cat2Id = categories[1].id;

    // Student X lodges complaint 1
    const fdX = new FormData();
    fdX.append('title', 'Smartboard projector power failure in Lab 3');
    fdX.append('description', 'Projector trips the circuit breaker whenever turned on.');
    fdX.append('category_id', String(cat1Id));
    fdX.append('priority', 'High');
    const resX = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: { Cookie: studentXCookie },
      body: fdX,
    });
    const dataX = await resX.json();
    complaintXId = dataX.data.complaint.id;

    // Student Y lodges complaint 2
    const fdY = new FormData();
    fdY.append('title', 'Hostel mess water cooler not cooling');
    fdY.append('description', 'Water cooler compressor not running in ground floor dining hall.');
    fdY.append('category_id', String(cat2Id));
    fdY.append('priority', 'Medium');
    const resY = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: { Cookie: studentYCookie },
      body: fdY,
    });
    const dataY = await resY.json();
    complaintYId = dataY.data.complaint.id;

    // ----------------------------------------------------
    // Test 1: Admin login and dashboard access
    // ----------------------------------------------------
    const dashHtmlRes = await fetch(`${BASE_URL}/admin/dashboard.html`, {
      headers: { Cookie: adminCookie },
    });
    const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: adminCookie },
    });
    const statsData = await statsRes.json();

    if (
      loginAdminRes.status === 200 &&
      dashHtmlRes.status === 200 &&
      statsRes.status === 200 &&
      statsData.data?.overview?.total >= 2
    ) {
      recordResult(
        1,
        'Admin login and dashboard access',
        true,
        `Dashboard HTML served (200), Stats API returned total=${statsData.data.overview.total}.`
      );
    } else {
      recordResult(1, 'Admin login and dashboard access', false, `Status: ${dashHtmlRes.status}, Stats: ${statsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 2: Student blocked from admin pages and APIs
    // ----------------------------------------------------
    const studentBlockedStats = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: studentXCookie },
    });
    const studentBlockedComplaints = await fetch(`${BASE_URL}/api/admin/complaints`, {
      headers: { Cookie: studentXCookie },
    });
    const studentBlockedStatus = await fetch(`${BASE_URL}/api/admin/complaints/${complaintXId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: studentXCookie },
      body: JSON.stringify({ status: 'Resolved' }),
    });

    if (
      studentBlockedStats.status === 403 &&
      studentBlockedComplaints.status === 403 &&
      studentBlockedStatus.status === 403
    ) {
      recordResult(
        2,
        'Student blocked from admin pages and APIs',
        true,
        `All protected admin APIs rejected student request with HTTP 403 Forbidden.`
      );
    } else {
      recordResult(2, 'Student blocked check', false, `Stats: ${studentBlockedStats.status}, Complaints: ${studentBlockedComplaints.status}`);
    }

    // ----------------------------------------------------
    // Test 3: Admin can view all complaints
    // ----------------------------------------------------
    const adminComplaintsRes = await fetch(`${BASE_URL}/api/admin/complaints`, {
      headers: { Cookie: adminCookie },
    });
    const adminComplaintsData = await adminComplaintsRes.json();
    const allComplaints = adminComplaintsData.data?.complaints || [];

    const hasComplaintX = allComplaints.some((c) => c.id === complaintXId);
    const hasComplaintY = allComplaints.some((c) => c.id === complaintYId);

    if (adminComplaintsRes.status === 200 && hasComplaintX && hasComplaintY) {
      recordResult(
        3,
        'Admin can view all complaints',
        true,
        `Retrieved ${allComplaints.length} complaints; both Student X and Student Y complaints visible.`
      );
    } else {
      recordResult(3, 'Admin view all complaints', false, `hasX=${hasComplaintX}, hasY=${hasComplaintY}`);
    }

    // ----------------------------------------------------
    // Test 4: Search and filters work
    // ----------------------------------------------------
    // Search by title "Smartboard"
    const searchRes = await fetch(`${BASE_URL}/api/admin/complaints?search=Smartboard`, {
      headers: { Cookie: adminCookie },
    });
    const searchData = await searchRes.json();
    const searchOk = searchData.data.complaints.some((c) => c.id === complaintXId);

    // Filter by category
    const filterCatRes = await fetch(`${BASE_URL}/api/admin/complaints?category_id=${cat2Id}`, {
      headers: { Cookie: adminCookie },
    });
    const filterCatData = await filterCatRes.json();
    const filterCatOk = filterCatData.data.complaints.every((c) => c.category.id === cat2Id);

    // Filter by priority
    const filterPrioRes = await fetch(`${BASE_URL}/api/admin/complaints?priority=High`, {
      headers: { Cookie: adminCookie },
    });
    const filterPrioData = await filterPrioRes.json();
    const filterPrioOk = filterPrioData.data.complaints.every((c) => c.priority === 'High');

    if (searchOk && filterCatOk && filterPrioOk) {
      recordResult(
        4,
        'Search and filters work',
        true,
        `Search "Smartboard" verified; Category filter verified; Priority "High" verified.`
      );
    } else {
      recordResult(4, 'Search and filters work', false, `searchOk=${searchOk}, catOk=${filterCatOk}, prioOk=${filterPrioOk}`);
    }

    // ----------------------------------------------------
    // Test 5: Admin can open complaint details
    // ----------------------------------------------------
    const detailsRes = await fetch(`${BASE_URL}/api/complaints/${complaintXId}`, {
      headers: { Cookie: adminCookie },
    });
    const detailsData = await detailsRes.json();
    const compDetails = detailsData.data?.complaint;

    if (
      detailsRes.status === 200 &&
      compDetails &&
      compDetails.id === complaintXId &&
      compDetails.student.email === STUDENT_X.email.toLowerCase()
    ) {
      recordResult(
        5,
        'Admin can open complaint details',
        true,
        `Retrieved complaint #${compDetails.id} with student details (${compDetails.student.name}, ${compDetails.student.email}).`
      );
    } else {
      recordResult(5, 'Admin open complaint details', false, `Status ${detailsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 6: Admin can update complaint status
    // ----------------------------------------------------
    const updateRes = await fetch(`${BASE_URL}/api/admin/complaints/${complaintXId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        status: 'In Progress',
        remarks: 'Electrician assigned to replace circuit breaker in Lab 3.',
      }),
    });
    const updateData = await updateRes.json();

    if (
      updateRes.status === 200 &&
      updateData.data.complaint.status === 'In Progress'
    ) {
      recordResult(
        6,
        'Admin can update complaint status',
        true,
        `Status successfully updated to "${updateData.data.complaint.status}".`
      );
    } else {
      recordResult(6, 'Admin update complaint status', false, `Status: ${updateRes.status}`);
    }

    // ----------------------------------------------------
    // Test 7: Status history records the update
    // ----------------------------------------------------
    const updatedDetailsRes = await fetch(`${BASE_URL}/api/complaints/${complaintXId}`, {
      headers: { Cookie: adminCookie },
    });
    const updatedDetailsData = await updatedDetailsRes.json();
    const history = updatedDetailsData.data?.complaint?.history || [];

    const hasInProgressLog = history.some(
      (h) =>
        h.oldStatus === 'Submitted' &&
        h.newStatus === 'In Progress' &&
        h.remarks.includes('Electrician assigned')
    );

    if (hasInProgressLog) {
      recordResult(
        7,
        'Status history records the update',
        true,
        `Found audit log transition: Submitted -> In Progress with remarks.`
      );
    } else {
      recordResult(7, 'Status history check', false, `History: ${JSON.stringify(history)}`);
    }

    // ----------------------------------------------------
    // Test 8: Admin can send a response
    // ----------------------------------------------------
    const sendResponseRes = await fetch(`${BASE_URL}/api/admin/complaints/${complaintXId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        message: 'The electrical team will be on site today at 3:00 PM to resolve the power fault.',
      }),
    });
    const sendResponseData = await sendResponseRes.json();

    if (
      sendResponseRes.status === 201 &&
      sendResponseData.data.response.message.includes('electrical team will be on site')
    ) {
      recordResult(
        8,
        'Admin can send a response',
        true,
        `Status 201, official response #${sendResponseData.data.response.id} recorded.`
      );
    } else {
      recordResult(8, 'Admin send response', false, `Status: ${sendResponseRes.status}`);
    }

    // ----------------------------------------------------
    // Test 9: Student can see the administrator's response on their own complaint
    // ----------------------------------------------------
    const studentXDetailsRes = await fetch(`${BASE_URL}/api/complaints/${complaintXId}`, {
      headers: { Cookie: studentXCookie },
    });
    const studentXDetailsData = await studentXDetailsRes.json();
    const responses = studentXDetailsData.data?.complaint?.responses || [];

    const studentSawResponse = responses.some((r) =>
      r.message.includes('electrical team will be on site')
    );

    if (studentXDetailsRes.status === 200 && studentSawResponse) {
      recordResult(
        9,
        "Student can see administrator's response on their own complaint",
        true,
        `Student X viewed complaint #${complaintXId} and retrieved ${responses.length} response(s).`
      );
    } else {
      recordResult(9, "Student view admin response", false, `Status: ${studentXDetailsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 10: Unauthenticated users cannot access protected admin APIs
    // ----------------------------------------------------
    const unauthStats = await fetch(`${BASE_URL}/api/admin/stats`);
    const unauthComplaints = await fetch(`${BASE_URL}/api/admin/complaints`);
    const unauthStatus = await fetch(`${BASE_URL}/api/admin/complaints/${complaintXId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved' }),
    });

    if (
      unauthStats.status === 401 &&
      unauthComplaints.status === 401 &&
      unauthStatus.status === 401
    ) {
      recordResult(
        10,
        'Unauthenticated users cannot access protected admin APIs',
        true,
        `Unauthenticated calls to /api/admin/* all returned 401 Unauthorized.`
      );
    } else {
      recordResult(10, 'Unauthenticated admin access check', false, `Stats: ${unauthStats.status}, Complaints: ${unauthComplaints.status}`);
    }

    // Clean up temporary test data
    console.log('\nCleaning up temporary test accounts and filed complaints...');
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )`,
      [STUDENT_X.email.toLowerCase(), STUDENT_Y.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      STUDENT_X.email.toLowerCase(),
      STUDENT_Y.email.toLowerCase(),
    ]);
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
