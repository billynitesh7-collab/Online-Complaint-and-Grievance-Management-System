/**
 * Comprehensive Automated Administrator Complaint Management Test Suite
 * Covers all 12 required test cases.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, query } = require('../config/db');

const PORT = process.env.PORT || 5001;
const BASE_AUTH_URL = `http://localhost:${PORT}/api/auth`;
const BASE_COMPLAINTS_URL = `http://localhost:${PORT}/api/complaints`;
const BASE_ADMIN_URL = `http://localhost:${PORT}/api/admin`;

const ADMIN_CREDENTIALS = {
  name: process.env.ADMIN_NAME || 'College Administrator',
  email: process.env.ADMIN_EMAIL || 'admin@college.edu',
  password: process.env.ADMIN_PASSWORD || 'AdminPass2026!',
};

const STUDENT_A = {
  name: 'AdminTest Alice',
  email: 'admintest_alice@college.edu',
  password: 'PasswordAlice123!',
  rollNumber: 'CS-ADMIN-01',
  department: 'Computer Science',
};

const STUDENT_B = {
  name: 'AdminTest Bob',
  email: 'admintest_bob@college.edu',
  password: 'PasswordBob123!',
  rollNumber: 'ME-ADMIN-02',
  department: 'Mechanical',
};

let cookieAdmin = null;
let cookieStudentA = null;
let cookieStudentB = null;

let complaintAId = null;
let complaintA2Id = null;
let complaintBId = null;

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
  console.log('=== STARTING 12-POINT ADMIN COMPLAINT MANAGEMENT TEST SUITE ===\n');

  try {
    // 0. Setup: Clean up prior test student accounts & complaints
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

    // Register Student A and Student B
    await fetch(`${BASE_AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_A),
    });
    await fetch(`${BASE_AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_B),
    });

    // Login all actors
    const loginAdm = await loginUser(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    cookieAdmin = loginAdm.cookie;

    const loginA = await loginUser(STUDENT_A.email, STUDENT_A.password);
    cookieStudentA = loginA.cookie;

    const loginB = await loginUser(STUDENT_B.email, STUDENT_B.password);
    cookieStudentB = loginB.cookie;

    // Get categories
    const catRes = await fetch(`http://localhost:${PORT}/api/categories`);
    const catData = await catRes.json();
    const categories = catData.data.categories;
    const academicCatId = categories.find((c) => c.name === 'Academic')?.id || 1;
    const hostelCatId = categories.find((c) => c.name.includes('Hostel'))?.id || 2;
    const libraryCatId = categories.find((c) => c.name === 'Library')?.id || 4;

    // Student A submits Complaint 1
    const fd1 = new FormData();
    fd1.append('title', 'Lab PC 14 display not functioning');
    fd1.append('description', 'Monitor displays black screen and power indicator blinks orange.');
    fd1.append('category_id', String(academicCatId));
    fd1.append('priority', 'High');
    const c1Res = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieStudentA },
      body: fd1,
    });
    const c1Data = await c1Res.json();
    complaintAId = c1Data.data.complaint.id;

    // Student A submits Complaint 2
    const fd2 = new FormData();
    fd2.append('title', 'Hostel Block B hot water issue');
    fd2.append('description', 'Geyser in 2nd floor bathroom not heating water in the mornings.');
    fd2.append('category_id', String(hostelCatId));
    fd2.append('priority', 'Urgent');
    const c2Res = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieStudentA },
      body: fd2,
    });
    const c2Data = await c2Res.json();
    complaintA2Id = c2Data.data.complaint.id;

    // Student B submits Complaint 3
    const fd3 = new FormData();
    fd3.append('title', 'Library quiet zone noise disturbance');
    fd3.append('description', 'Group discussion happening in designated silent study cubicles.');
    fd3.append('category_id', String(libraryCatId));
    fd3.append('priority', 'Low');
    const c3Res = await fetch(BASE_COMPLAINTS_URL, {
      method: 'POST',
      headers: { Cookie: cookieStudentB },
      body: fd3,
    });
    const c3Data = await c3Res.json();
    complaintBId = c3Data.data.complaint.id;

    // ----------------------------------------------------
    // Test 1: Admin can retrieve the complaint list
    // ----------------------------------------------------
    const listRes = await fetch(`${BASE_ADMIN_URL}/complaints`, {
      headers: { Cookie: cookieAdmin },
    });
    const listData = await listRes.json();

    if (
      listRes.status === 200 &&
      listData.status === 'success' &&
      Array.isArray(listData.data.complaints) &&
      listData.data.complaints.length >= 3 &&
      listData.data.pagination
    ) {
      recordResult(
        1,
        'Admin can retrieve the complaint list',
        true,
        `Status 200, retrieved ${listData.data.complaints.length} complaints, total count=${listData.data.pagination.total}.`
      );
    } else {
      recordResult(1, 'Admin can retrieve the complaint list', false, `Status ${listRes.status}: ${JSON.stringify(listData)}`);
    }

    // ----------------------------------------------------
    // Test 2: Unauthenticated users receive HTTP 401
    // ----------------------------------------------------
    const unauthList = await fetch(`${BASE_ADMIN_URL}/complaints`);
    const unauthStatus = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'In Progress' }),
    });

    if (unauthList.status === 401 && unauthStatus.status === 401) {
      recordResult(
        2,
        'Unauthenticated users receive HTTP 401',
        true,
        `Both GET and PATCH returned 401 Unauthorized.`
      );
    } else {
      recordResult(2, 'Unauthenticated users receive HTTP 401', false, `GET: ${unauthList.status}, PATCH: ${unauthStatus.status}`);
    }

    // ----------------------------------------------------
    // Test 3: Students receive HTTP 403 on admin routes
    // ----------------------------------------------------
    const studentAdminList = await fetch(`${BASE_ADMIN_URL}/complaints`, {
      headers: { Cookie: cookieStudentA },
    });
    const studentAdminStatus = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStudentA,
      },
      body: JSON.stringify({ status: 'Resolved' }),
    });

    if (studentAdminList.status === 403 && studentAdminStatus.status === 403) {
      recordResult(
        3,
        'Students receive HTTP 403 on admin routes',
        true,
        `Both GET and PATCH returned 403 Forbidden for Student session.`
      );
    } else {
      recordResult(3, 'Students receive HTTP 403 on admin routes', false, `GET: ${studentAdminList.status}, PATCH: ${studentAdminStatus.status}`);
    }

    // ----------------------------------------------------
    // Test 4: Status can be changed successfully
    // ----------------------------------------------------
    const statusUpdateRes = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        status: 'Under Review',
        remarks: 'Assigned to Lab In-charge for hardware inspection',
      }),
    });
    const statusUpdateData = await statusUpdateRes.json();

    if (
      statusUpdateRes.status === 200 &&
      statusUpdateData.status === 'success' &&
      statusUpdateData.data.complaint.status === 'Under Review'
    ) {
      recordResult(
        4,
        'Status changed successfully',
        true,
        `Status updated to "${statusUpdateData.data.complaint.status}".`
      );
    } else {
      recordResult(4, 'Status changed successfully', false, `Status ${statusUpdateRes.status}: ${JSON.stringify(statusUpdateData)}`);
    }

    // ----------------------------------------------------
    // Test 5: Invalid status is rejected
    // ----------------------------------------------------
    const invalidStatusRes = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        status: 'CompletedAndArchived', // Not in allowed set
      }),
    });
    const invalidStatusData = await invalidStatusRes.json();

    if (invalidStatusRes.status === 400 && invalidStatusData.status === 'error') {
      recordResult(
        5,
        'Invalid status rejected',
        true,
        `Status 400: "${invalidStatusData.message}"`
      );
    } else {
      recordResult(5, 'Invalid status rejected', false, `Expected 400, got ${invalidStatusRes.status}`);
    }

    // ----------------------------------------------------
    // Test 6: Status changes create correct audit-log entries
    // ----------------------------------------------------
    const logsDb = await query(
      `SELECT cl.old_status, cl.new_status, cl.remarks, u.role, u.name
       FROM complaint_logs cl
       JOIN users u ON cl.changed_by = u.id
       WHERE cl.complaint_id = $1
       ORDER BY cl.created_at DESC LIMIT 1`,
      [complaintAId]
    );

    const latestLog = logsDb.rows[0];
    if (
      latestLog &&
      latestLog.old_status === 'Submitted' &&
      latestLog.new_status === 'Under Review' &&
      latestLog.remarks === 'Assigned to Lab In-charge for hardware inspection' &&
      latestLog.role === 'admin'
    ) {
      recordResult(
        6,
        'Status changes create correct audit-log entries',
        true,
        `Verified log: ${latestLog.old_status} -> ${latestLog.new_status} by "${latestLog.name}" (${latestLog.role}).`
      );
    } else {
      recordResult(6, 'Status changes create correct audit-log entries', false, `Audit log check failed: ${JSON.stringify(latestLog)}`);
    }

    // ----------------------------------------------------
    // Test 7: A failed status update does not leave a partial audit log
    // ----------------------------------------------------
    const logsCountBefore = (
      await query('SELECT COUNT(*) FROM complaint_logs WHERE complaint_id = $1', [complaintAId])
    ).rows[0].count;

    // Attempt status update on non-existent complaint
    const failedUpdateRes = await fetch(`${BASE_ADMIN_URL}/complaints/999999/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({ status: 'Resolved' }),
    });

    const logsCountAfter = (
      await query('SELECT COUNT(*) FROM complaint_logs WHERE complaint_id = $1', [complaintAId])
    ).rows[0].count;

    if (failedUpdateRes.status === 404 && logsCountBefore === logsCountAfter) {
      recordResult(
        7,
        'Failed status update does not leave partial audit log',
        true,
        `Status 404 returned, audit log count unchanged (${logsCountBefore} == ${logsCountAfter}). Transaction atomic.`
      );
    } else {
      recordResult(7, 'Failed status update partial log check', false, `Failed: ${failedUpdateRes.status}, before=${logsCountBefore}, after=${logsCountAfter}`);
    }

    // ----------------------------------------------------
    // Test 8: Admin can submit an official response
    // ----------------------------------------------------
    const responseRes = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        message: 'The lab technician has verified the damaged cable and ordered a replacement monitor cable.',
      }),
    });
    const responseData = await responseRes.json();

    if (
      responseRes.status === 201 &&
      responseData.status === 'success' &&
      responseData.data.response.message.includes('replacement monitor cable') &&
      responseData.data.response.adminName
    ) {
      recordResult(
        8,
        'Admin can submit an official response',
        true,
        `Status 201, saved response ID ${responseData.data.response.id} by "${responseData.data.response.adminName}".`
      );
    } else {
      recordResult(8, 'Admin can submit official response', false, `Status ${responseRes.status}: ${JSON.stringify(responseData)}`);
    }

    // ----------------------------------------------------
    // Test 9: Empty responses are rejected
    // ----------------------------------------------------
    const emptyRespRes = await fetch(`${BASE_ADMIN_URL}/complaints/${complaintAId}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        message: '   ',
      }),
    });
    const emptyRespData = await emptyRespRes.json();

    if (emptyRespRes.status === 400 && emptyRespData.status === 'error') {
      recordResult(
        9,
        'Empty responses are rejected',
        true,
        `Status 400: "${emptyRespData.message}"`
      );
    } else {
      recordResult(9, 'Empty responses are rejected', false, `Expected 400, got ${emptyRespRes.status}`);
    }

    // ----------------------------------------------------
    // Test 10: Students can see responses to their own complaints
    // ----------------------------------------------------
    const studentViewRes = await fetch(`${BASE_COMPLAINTS_URL}/${complaintAId}`, {
      headers: { Cookie: cookieStudentA },
    });
    const studentViewData = await studentViewRes.json();

    const responsesList = studentViewData.data?.complaint?.responses || [];
    const hasAdminResponse = responsesList.some((r) =>
      r.message.includes('replacement monitor cable')
    );

    if (studentViewRes.status === 200 && hasAdminResponse) {
      recordResult(
        10,
        'Students can see responses to their own complaints',
        true,
        `Student A successfully retrieved complaint details containing ${responsesList.length} response(s).`
      );
    } else {
      recordResult(10, 'Students see responses check', false, `Status: ${studentViewRes.status}, Responses: ${JSON.stringify(responsesList)}`);
    }

    // ----------------------------------------------------
    // Test 11: Students cannot access another student's complaint history
    // ----------------------------------------------------
    const studentBViewRes = await fetch(`${BASE_COMPLAINTS_URL}/${complaintAId}`, {
      headers: { Cookie: cookieStudentB },
    });
    const studentBViewData = await studentBViewRes.json();

    if (studentBViewRes.status === 403 && studentBViewData.status === 'error') {
      recordResult(
        11,
        "Students cannot access another student's complaint history",
        true,
        `Status 403 Forbidden: "${studentBViewData.message}"`
      );
    } else {
      recordResult(11, "Student data isolation check", false, `Expected 403, got ${studentBViewRes.status}`);
    }

    // ----------------------------------------------------
    // Test 12: Search, filtering and pagination work correctly
    // ----------------------------------------------------
    // 12a. Filter by status: 'Under Review'
    const filterStatusRes = await fetch(
      `${BASE_ADMIN_URL}/complaints?status=Under%20Review`,
      { headers: { Cookie: cookieAdmin } }
    );
    const filterStatusData = await filterStatusRes.json();
    const allUnderReview = filterStatusData.data.complaints.every(
      (c) => c.status === 'Under Review'
    );

    // 12b. Search by title keyword 'PC 14'
    const searchRes = await fetch(
      `${BASE_ADMIN_URL}/complaints?search=PC%2014`,
      { headers: { Cookie: cookieAdmin } }
    );
    const searchData = await searchRes.json();
    const hasMatchedPC14 =
      searchData.data.complaints.length >= 1 &&
      searchData.data.complaints.some((c) => c.title.includes('PC 14'));

    // 12c. Pagination: limit=1, page=1
    const pageRes = await fetch(
      `${BASE_ADMIN_URL}/complaints?limit=1&page=1`,
      { headers: { Cookie: cookieAdmin } }
    );
    const pageData = await pageRes.json();
    const paginationOk =
      pageData.data.complaints.length === 1 &&
      pageData.data.pagination.limit === 1 &&
      pageData.data.pagination.page === 1 &&
      pageData.data.pagination.total >= 3;

    // 12d. Sort: oldest first
    const sortRes = await fetch(
      `${BASE_ADMIN_URL}/complaints?sort=oldest`,
      { headers: { Cookie: cookieAdmin } }
    );
    const sortData = await sortRes.json();
    const sortOk =
      sortData.data.complaints.length >= 2 &&
      new Date(sortData.data.complaints[0].createdAt).getTime() <=
        new Date(sortData.data.complaints[1].createdAt).getTime();

    if (allUnderReview && hasMatchedPC14 && paginationOk && sortOk) {
      recordResult(
        12,
        'Search, filtering and pagination work correctly',
        true,
        `Status filter verified (${filterStatusData.data.complaints.length} items); Search "PC 14" verified; Pagination (limit=1) verified; Sort oldest verified.`
      );
    } else {
      recordResult(
        12,
        'Search, filtering and pagination work correctly',
        false,
        `allUnderReview=${allUnderReview}, hasMatchedPC14=${hasMatchedPC14}, paginationOk=${paginationOk}, sortOk=${sortOk}`
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
