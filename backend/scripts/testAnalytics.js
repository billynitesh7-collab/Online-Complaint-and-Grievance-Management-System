/**
 * Automated Verification Script for Analytics, Reports and Chart Data
 * Covers all 10 testing requirements from Task 8.
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

const STUDENT_ANALYTICS = {
  name: 'Analytics Student',
  email: 'analytics_student@college.edu',
  password: 'Password123!',
  rollNumber: 'CS-ANALYTICS',
  department: 'Computer Science',
};

let adminCookie = null;
let studentCookie = null;
let studentId = null;

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
  console.log('=== STARTING 10-POINT ANALYTICS & REPORTS TEST SUITE ===\n');

  try {
    // Clean up prior test student records
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email = $1
      )`,
      [STUDENT_ANALYTICS.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email = $1', [STUDENT_ANALYTICS.email.toLowerCase()]);

    // Register test student
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_ANALYTICS),
    });
    const regData = await regRes.json();
    studentId = regData.data.user.id;

    // Login Admin and Student
    const loginAdm = await login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    adminCookie = loginAdm.cookie;

    const loginStu = await login(STUDENT_ANALYTICS.email, STUDENT_ANALYTICS.password);
    studentCookie = loginStu.cookie;

    // ----------------------------------------------------
    // Test 1: Admin can retrieve analytics
    // ----------------------------------------------------
    const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: adminCookie },
    });
    const statsData = await statsRes.json();

    if (
      statsRes.status === 200 &&
      statsData.status === 'success' &&
      statsData.data.overview &&
      statsData.data.byStatus &&
      statsData.data.byCategory &&
      statsData.data.byPriority &&
      statsData.data.monthlyTrends
    ) {
      recordResult(
        1,
        'Admin can retrieve analytics',
        true,
        `Status 200, returned overview, byStatus, byCategory, byPriority, and monthlyTrends.`
      );
    } else {
      recordResult(1, 'Admin can retrieve analytics', false, `Status ${statsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 2: Student receives 403
    // ----------------------------------------------------
    const studentStatsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: studentCookie },
    });
    const studentStatsData = await studentStatsRes.json();

    if (studentStatsRes.status === 403 && studentStatsData.status === 'error') {
      recordResult(
        2,
        'Student receives 403 on analytics endpoint',
        true,
        `Status 403 Forbidden: "${studentStatsData.message}"`
      );
    } else {
      recordResult(2, 'Student receives 403', false, `Expected 403, got ${studentStatsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 3: Unauthenticated user receives 401
    // ----------------------------------------------------
    const unauthStatsRes = await fetch(`${BASE_URL}/api/admin/stats`);
    const unauthStatsData = await unauthStatsRes.json();

    if (unauthStatsRes.status === 401 && unauthStatsData.status === 'error') {
      recordResult(
        3,
        'Unauthenticated user receives 401',
        true,
        `Status 401 Unauthorized: "${unauthStatsData.message}"`
      );
    } else {
      recordResult(3, 'Unauthenticated user receives 401', false, `Expected 401, got ${unauthStatsRes.status}`);
    }

    // ----------------------------------------------------
    // Test 8: Empty database returns valid zero/empty results
    // ----------------------------------------------------
    // Query stats right now before inserting complaints
    const emptyStatsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: adminCookie },
    });
    const emptyStatsData = await emptyStatsRes.json();
    const ov = emptyStatsData.data.overview;

    if (
      ov.total === 0 &&
      ov.resolved === 0 &&
      ov.unresolved === 0 &&
      ov.resolutionRate === 0
    ) {
      recordResult(
        8,
        'Empty database returns valid zero/empty results',
        true,
        `Total=0, Resolved=0, Unresolved=0, ResolutionRate=0.0%. No division by zero errors.`
      );
    } else {
      recordResult(8, 'Empty database check', false, `Total: ${ov.total}, rate: ${ov.resolutionRate}`);
    }

    // ----------------------------------------------------
    // Setup known dataset for verification of mathematical aggregates
    // ----------------------------------------------------
    // Get categories: Cat 1 (Academic), Cat 2 (Hostel), Cat 3 (Infrastructure)
    const catRes = await query('SELECT id, name FROM categories ORDER BY id ASC LIMIT 3');
    const cat1 = catRes.rows[0].id;
    const cat2 = catRes.rows[1].id;
    const cat3 = catRes.rows[2].id;

    // Insert 5 controlled complaints with distinct statuses & priorities
    await query(`
      INSERT INTO complaints (tracking_id, student_id, category_id, title, description, priority, status)
      VALUES 
        ('GRV-TEST-0001', ${studentId}, ${cat1}, 'Lab 1 WiFi', 'WiFi dropping', 'Low', 'Submitted'),
        ('GRV-TEST-0002', ${studentId}, ${cat2}, 'Mess Food', 'Food cold', 'Medium', 'Under Review'),
        ('GRV-TEST-0003', ${studentId}, ${cat1}, 'Exam Hall AC', 'AC leaking', 'High', 'In Progress'),
        ('GRV-TEST-0004', ${studentId}, ${cat3}, 'Library Desk', 'Desk fixed', 'Urgent', 'Resolved'),
        ('GRV-TEST-0005', ${studentId}, ${cat2}, 'Hostel Geyser', 'Not eligible', 'High', 'Rejected');
    `);

    // Fetch refreshed analytics
    const populatedStatsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Cookie: adminCookie },
    });
    const popData = (await populatedStatsRes.json()).data;

    // ----------------------------------------------------
    // Test 4: Status totals match actual database records
    // ----------------------------------------------------
    const pOv = popData.overview;
    const statusMatch =
      pOv.total === 5 &&
      pOv.submitted === 1 &&
      pOv.underReview === 1 &&
      pOv.inProgress === 1 &&
      pOv.resolved === 1 &&
      pOv.rejected === 1 &&
      pOv.unresolved === 4 &&
      pOv.resolutionRate === 20.0; // 1 out of 5 = 20.0%

    if (statusMatch) {
      recordResult(
        4,
        'Status totals match actual database records',
        true,
        `Total=5 (Submitted=1, Review=1, Progress=1, Resolved=1, Rejected=1, Unresolved=4, Rate=20.0%).`
      );
    } else {
      recordResult(4, 'Status totals check', false, `Overview: ${JSON.stringify(pOv)}`);
    }

    // ----------------------------------------------------
    // Test 5: Category totals match actual database records
    // ----------------------------------------------------
    const catCounts = popData.byCategory.reduce((acc, c) => {
      acc[c.id] = c.count;
      return acc;
    }, {});

    const catMatch =
      catCounts[cat1] === 2 && // 2 in Academic
      catCounts[cat2] === 2 && // 2 in Hostel
      catCounts[cat3] === 1; // 1 in Infrastructure

    if (catMatch) {
      recordResult(
        5,
        'Category totals match actual database records',
        true,
        `Cat 1=${catCounts[cat1]} (Academic), Cat 2=${catCounts[cat2]} (Hostel), Cat 3=${catCounts[cat3]} (Infrastructure).`
      );
    } else {
      recordResult(5, 'Category totals check', false, `Counts: ${JSON.stringify(catCounts)}`);
    }

    // ----------------------------------------------------
    // Test 6: Priority totals match actual database records
    // ----------------------------------------------------
    const prioCounts = popData.byPriority.reduce((acc, p) => {
      acc[p.priority] = p.count;
      return acc;
    }, {});

    const prioMatch =
      prioCounts['Low'] === 1 &&
      prioCounts['Medium'] === 1 &&
      prioCounts['High'] === 2 &&
      prioCounts['Urgent'] === 1;

    if (prioMatch) {
      recordResult(
        6,
        'Priority totals match actual database records',
        true,
        `Low=1, Medium=1, High=2, Urgent=1 (Total=5).`
      );
    } else {
      recordResult(6, 'Priority totals check', false, `Counts: ${JSON.stringify(prioCounts)}`);
    }

    // ----------------------------------------------------
    // Test 7: Monthly trends match actual database records
    // ----------------------------------------------------
    const trends = popData.monthlyTrends;
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const thisMonthTrend = trends.find((t) => t.monthKey === currentMonthKey);

    if (thisMonthTrend && thisMonthTrend.total === 5 && thisMonthTrend.resolved === 1) {
      recordResult(
        7,
        'Monthly trends match actual database records',
        true,
        `Current month "${thisMonthTrend.monthLabel}" has total=5, resolved=1.`
      );
    } else {
      recordResult(7, 'Monthly trends check', false, `Trends: ${JSON.stringify(trends)}`);
    }

    // ----------------------------------------------------
    // Test 9: Invalid filter parameters are handled correctly
    // ----------------------------------------------------
    const badYearRes = await fetch(`${BASE_URL}/api/admin/stats?year=notayear`, {
      headers: { Cookie: adminCookie },
    });
    const badStatusRes = await fetch(`${BASE_URL}/api/admin/stats?status=InvalidStatusValue`, {
      headers: { Cookie: adminCookie },
    });
    const badCatRes = await fetch(`${BASE_URL}/api/admin/stats?category_id=-10`, {
      headers: { Cookie: adminCookie },
    });

    if (
      badYearRes.status === 400 &&
      badStatusRes.status === 400 &&
      badCatRes.status === 400
    ) {
      recordResult(
        9,
        'Invalid filter parameters handled with HTTP 400',
        true,
        `Invalid year (400), invalid status (400), invalid category_id (400) all rejected cleanly.`
      );
    } else {
      recordResult(9, 'Invalid filters check', false, `Year: ${badYearRes.status}, Status: ${badStatusRes.status}, Cat: ${badCatRes.status}`);
    }

    // ----------------------------------------------------
    // Test 10: Existing admin complaint management and student APIs still work
    // ----------------------------------------------------
    const adminComplaintsRes = await fetch(`${BASE_URL}/api/admin/complaints?limit=2`, {
      headers: { Cookie: adminCookie },
    });
    const studentMyRes = await fetch(`${BASE_URL}/api/complaints/my`, {
      headers: { Cookie: studentCookie },
    });

    if (
      adminComplaintsRes.status === 200 &&
      studentMyRes.status === 200 &&
      (await studentMyRes.json()).data.complaints.length === 5
    ) {
      recordResult(
        10,
        'Existing admin and student complaint APIs intact',
        true,
        `Admin complaints API returned 200 OK; Student complaints API returned 200 OK with all 5 records.`
      );
    } else {
      recordResult(10, 'Existing APIs check', false, `Admin: ${adminComplaintsRes.status}, Student: ${studentMyRes.status}`);
    }

    // Cleanup
    console.log('\nCleaning up temporary analytics test records...');
    await query(
      `DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email = $1
      )`,
      [STUDENT_ANALYTICS.email.toLowerCase()]
    );
    await query('DELETE FROM users WHERE email = $1', [STUDENT_ANALYTICS.email.toLowerCase()]);
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
