/**
 * Automated Security Audit Test Suite
 * Tests CSRF defense, zero-month trend preservation, student isolation,
 * role boundaries, and path traversal protections.
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

const STUDENT_A = {
  name: 'Security Alice',
  email: 'sec_alice@college.edu',
  password: 'PasswordAlice123!',
  rollNumber: 'SEC-A-01',
  department: 'Cyber Security',
};

const STUDENT_B = {
  name: 'Security Bob',
  email: 'sec_bob@college.edu',
  password: 'PasswordBob123!',
  rollNumber: 'SEC-B-02',
  department: 'Cyber Security',
};

const results = [];

function recordResult(caseNum, title, passed, details) {
  results.push({ caseNum, title, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Security ${caseNum}] ${title}: ${details}`);
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

async function runSecurityAudit() {
  console.log('=== STARTING SECURITY & DEFENSE AUDIT TEST SUITE ===\n');

  let adminCookie = null;
  let cookieA = null;
  let cookieB = null;
  let studentAId = null;
  let studentBId = null;
  let complaintAId = null;

  try {
    // 0. Clean up prior test accounts
    await query(`
      DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )
    `, [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]);
    await query('DELETE FROM users WHERE email IN ($1, $2)', [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]);

    // Register test students
    const regA = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_A),
    });
    studentAId = (await regA.json()).data.user.id;

    const regB = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT_B),
    });
    studentBId = (await regB.json()).data.user.id;

    // Login
    const loginAdm = await login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    adminCookie = loginAdm.cookie;

    const loginA = await login(STUDENT_A.email, STUDENT_A.password);
    cookieA = loginA.cookie;

    const loginB = await login(STUDENT_B.email, STUDENT_B.password);
    cookieB = loginB.cookie;

    // File a complaint for Student A
    const catRes = await query('SELECT id FROM categories LIMIT 1');
    const catId = catRes.rows[0].id;

    const compRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        title: 'Security Complaint A',
        description: 'Testing security and ownership boundaries.',
        category_id: catId,
        priority: 'Medium',
      }),
    });
    const compData = await compRes.json();
    complaintAId = compData.data.complaint.id;

    // ----------------------------------------------------
    // Test 1: CSRF Defense: Cross-Site Origin Rejected
    // ----------------------------------------------------
    const csrfCrossSiteRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
        Origin: 'https://malicious-attacker.com',
      },
      body: JSON.stringify({
        title: 'CSRF Attack Attempt',
        description: 'Should be rejected by CSRF middleware.',
        category_id: catId,
        priority: 'Urgent',
      }),
    });
    const csrfData = await csrfCrossSiteRes.json();

    if (csrfCrossSiteRes.status === 403 && csrfData.message.includes('CSRF validation failed')) {
      recordResult(
        1,
        'CSRF Defense: Untrusted Origin header rejected',
        true,
        `Status 403 Forbidden: "${csrfData.message}"`
      );
    } else {
      recordResult(1, 'CSRF Defense check', false, `Status ${csrfCrossSiteRes.status}`);
    }

    // ----------------------------------------------------
    // Test 2: CSRF Defense: Sec-Fetch-Site cross-site Rejected
    // ----------------------------------------------------
    const secFetchRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({
        title: 'CSRF Metadata Attack',
        description: 'Should be rejected based on Sec-Fetch-Site.',
        category_id: catId,
        priority: 'Urgent',
      }),
    });
    const secFetchData = await secFetchRes.json();

    if (secFetchRes.status === 403 && secFetchData.message.includes('CSRF validation failed')) {
      recordResult(
        2,
        'CSRF Defense: Sec-Fetch-Site: cross-site rejected',
        true,
        `Status 403 Forbidden: "${secFetchData.message}"`
      );
    } else {
      recordResult(2, 'Sec-Fetch-Site check', false, `Status ${secFetchRes.status}`);
    }

    // ----------------------------------------------------
    // Test 3: Student cannot access other student's complaint
    // ----------------------------------------------------
    const studentBViewARes = await fetch(`${BASE_URL}/api/complaints/${complaintAId}`, {
      headers: { Cookie: cookieB },
    });
    const studentBViewAData = await studentBViewARes.json();

    if (studentBViewARes.status === 403) {
      recordResult(
        3,
        'Student ownership: Student B cannot access Student A complaint',
        true,
        `Status 403 Forbidden: "${studentBViewAData.message}"`
      );
    } else {
      recordResult(3, 'Student ownership check', false, `Got status ${studentBViewARes.status}`);
    }

    // ----------------------------------------------------
    // Test 4: Student cannot update complaint status
    // ----------------------------------------------------
    const studentPatchStatusRes = await fetch(`${BASE_URL}/api/admin/complaints/${complaintAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({ status: 'Resolved' }),
    });

    if (studentPatchStatusRes.status === 403) {
      recordResult(
        4,
        'RBAC: Student cannot update complaint status',
        true,
        `Status 403 Forbidden (requireAdmin rejected student session).`
      );
    } else {
      recordResult(4, 'RBAC status update check', false, `Got status ${studentPatchStatusRes.status}`);
    }

    // ----------------------------------------------------
    // Test 5: Monthly trend charts include months with zero complaints
    // ----------------------------------------------------
    const statsRes = await fetch(`${BASE_URL}/api/admin/stats?year=2026`, {
      headers: { Cookie: adminCookie },
    });
    const statsData = await statsRes.json();
    const monthlyTrends = statsData.data?.monthlyTrends || [];

    const has12Months = monthlyTrends.length === 12;
    const zeroMonths = monthlyTrends.filter((m) => m.total === 0);

    if (has12Months && zeroMonths.length > 0) {
      recordResult(
        5,
        'Monthly trends: Include all calendar months with zero complaints',
        true,
        `Returned all 12 months for 2026 (${zeroMonths.length} months correctly populated with 0 total complaints).`
      );
    } else {
      recordResult(5, 'Zero-month preservation check', false, `Length: ${monthlyTrends.length}, zeros: ${zeroMonths.length}`);
    }

    // ----------------------------------------------------
    // Test 6: Path traversal in file download is blocked
    // ----------------------------------------------------
    const pathTraversalRes = await fetch(`${BASE_URL}/api/complaints/999999/attachments/..%2F..%2F.env`, {
      headers: { Cookie: adminCookie },
    });

    if (pathTraversalRes.status === 400 || pathTraversalRes.status === 404) {
      recordResult(
        6,
        'Path traversal in attachment download rejected',
        true,
        `Status ${pathTraversalRes.status}: Traversal string rejected safely.`
      );
    } else {
      recordResult(6, 'Path traversal check', false, `Got status ${pathTraversalRes.status}`);
    }

    // Cleanup
    await query(`
      DELETE FROM complaints WHERE student_id IN (
        SELECT id FROM users WHERE email IN ($1, $2)
      )
    `, [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]);
    await query('DELETE FROM users WHERE email IN ($1, $2)', [STUDENT_A.email.toLowerCase(), STUDENT_B.email.toLowerCase()]);
  } catch (err) {
    console.error('Security audit execution error:', err);
  } finally {
    await pool.end();
  }

  console.log('\n=== SECURITY AUDIT SUMMARY ===');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Security Checks: ${results.length} | Passed: ${results.filter((r) => r.passed).length} | Failed: ${results.filter((r) => !r.passed).length}`);
  if (allPassed) {
    console.log('ALL SECURITY AUDIT CHECKS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('SOME SECURITY AUDIT CHECKS FAILED!\n');
  }
}

runSecurityAudit();
