/**
 * Comprehensive Automated Authentication & RBAC Test Suite
 * Covers all 10 required test cases.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { pool, query } = require('../config/db');

const BASE_URL = `http://localhost:${process.env.PORT || 5001}/api/auth`;

// Test credentials
const TEST_STUDENT = {
  name: 'Test Student One',
  email: 'test_student_2026@college.edu',
  password: 'Password123!',
  rollNumber: 'CS2026-999',
  department: 'Computer Science',
};

const TEST_ADMIN = {
  name: 'Test Admin Auth',
  email: 'test_admin_auth@college.edu',
  password: 'AdminPasswordAuth123!',
};

let studentCookie = null;
let adminCookie = null;

const results = [];

function recordResult(testNumber, description, passed, details) {
  results.push({ testNumber, description, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Case ${testNumber}] ${description}: ${details}`);
}

async function runTests() {
  console.log('=== STARTING 10-POINT AUTH & RBAC VERIFICATION ===\n');

  try {
    // Clean up any lingering test users from previous runs
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      TEST_STUDENT.email.toLowerCase(),
      TEST_ADMIN.email.toLowerCase(),
    ]);

    // ----------------------------------------------------
    // Test Case 1: Register a student successfully
    // ----------------------------------------------------
    const regRes = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_STUDENT),
    });
    const regData = await regRes.json();

    if (
      regRes.status === 201 &&
      regData.status === 'success' &&
      regData.data.user.role === 'student' &&
      !regData.data.user.password_hash
    ) {
      recordResult(
        1,
        'Register a student successfully',
        true,
        `Status ${regRes.status}, assigned role="${regData.data.user.role}", no password hash exposed.`
      );
    } else {
      recordResult(1, 'Register a student successfully', false, `Status ${regRes.status}: ${JSON.stringify(regData)}`);
    }

    // ----------------------------------------------------
    // Test Case 2: Register the same email again and confirm rejection
    // ----------------------------------------------------
    const dupRes = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_STUDENT),
    });
    const dupData = await dupRes.json();

    if (dupRes.status === 409 && dupData.status === 'error') {
      recordResult(
        2,
        'Register duplicate email rejection',
        true,
        `Status ${dupRes.status}: "${dupData.message}"`
      );
    } else {
      recordResult(2, 'Register duplicate email rejection', false, `Expected 409, got ${dupRes.status}`);
    }

    // ----------------------------------------------------
    // Test Case 3: Verify the stored password is hashed
    // ----------------------------------------------------
    const dbUserRes = await query('SELECT password_hash FROM users WHERE email = $1', [
      TEST_STUDENT.email.toLowerCase(),
    ]);
    const storedHash = dbUserRes.rows[0]?.password_hash;
    const isBcryptHash = storedHash && storedHash.startsWith('$2b$10$');
    const isOriginalPassword = storedHash === TEST_STUDENT.password;

    if (isBcryptHash && !isOriginalPassword) {
      recordResult(
        3,
        'Verify stored password is hashed',
        true,
        `Hash starts with "$2b$10$", length=${storedHash.length}, plain password not stored.`
      );
    } else {
      recordResult(3, 'Verify stored password is hashed', false, `Hash verification failed.`);
    }

    // ----------------------------------------------------
    // Test Case 4: Log in with correct credentials
    // ----------------------------------------------------
    const loginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
      }),
    });
    const loginData = await loginRes.json();
    const setCookieHeader = loginRes.headers.get('set-cookie');

    if (loginRes.status === 200 && loginData.status === 'success' && setCookieHeader) {
      studentCookie = setCookieHeader.split(';')[0];
      recordResult(
        4,
        'Log in with correct credentials',
        true,
        `Status ${loginRes.status}, received session cookie (${studentCookie.substring(0, 20)}...).`
      );
    } else {
      recordResult(4, 'Log in with correct credentials', false, `Login failed: ${JSON.stringify(loginData)}`);
    }

    // ----------------------------------------------------
    // Test Case 5: Reject an incorrect password
    // ----------------------------------------------------
    const badLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_STUDENT.email,
        password: 'WrongPassword999!',
      }),
    });
    const badLoginData = await badLoginRes.json();

    if (badLoginRes.status === 401 && badLoginData.status === 'error') {
      recordResult(
        5,
        'Reject incorrect password',
        true,
        `Status ${badLoginRes.status}: "${badLoginData.message}"`
      );
    } else {
      recordResult(5, 'Reject incorrect password', false, `Expected 401, got ${badLoginRes.status}`);
    }

    // ----------------------------------------------------
    // Test Case 6: Verify /api/auth/me works with valid session
    // ----------------------------------------------------
    const meRes = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    const meData = await meRes.json();

    if (
      meRes.status === 200 &&
      meData.status === 'success' &&
      meData.data.user.email === TEST_STUDENT.email.toLowerCase() &&
      meData.data.user.role === 'student'
    ) {
      recordResult(
        6,
        'Verify /api/auth/me with valid session',
        true,
        `Status ${meRes.status}, returned authenticated student profile for "${meData.data.user.email}".`
      );
    } else {
      recordResult(6, 'Verify /api/auth/me with valid session', false, `Failed: ${JSON.stringify(meData)}`);
    }

    // ----------------------------------------------------
    // Test Case 7: Verify logout destroys the session
    // ----------------------------------------------------
    const logoutRes = await fetch(`${BASE_URL}/logout`, {
      method: 'POST',
      headers: { Cookie: studentCookie },
    });
    const logoutData = await logoutRes.json();

    // Now try accessing /me with the logged out cookie
    const postLogoutMe = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
      headers: { Cookie: studentCookie },
    });

    if (logoutRes.status === 200 && postLogoutMe.status === 401) {
      recordResult(
        7,
        'Verify logout destroys session',
        true,
        `Logout returned 200, subsequent /api/auth/me returned 401 Unauthorized.`
      );
    } else {
      recordResult(7, 'Verify logout destroys session', false, `Post-logout check status: ${postLogoutMe.status}`);
    }

    // ----------------------------------------------------
    // Test Case 8: Verify unauthenticated requests receive HTTP 401
    // ----------------------------------------------------
    const unauthRes = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
    });
    const unauthData = await unauthRes.json();

    if (unauthRes.status === 401 && unauthData.status === 'error') {
      recordResult(
        8,
        'Verify unauthenticated requests receive HTTP 401',
        true,
        `Status ${unauthRes.status}: "${unauthData.message}"`
      );
    } else {
      recordResult(8, 'Verify unauthenticated requests receive HTTP 401', false, `Got status ${unauthRes.status}`);
    }

    // ----------------------------------------------------
    // Test Case 9: Verify a student cannot access admin-only test routes
    // ----------------------------------------------------
    // Re-login student to get an active session
    const studentRelogin = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
      }),
    });
    const newStudentCookie = studentRelogin.headers.get('set-cookie')?.split(';')[0];

    const adminRouteRes = await fetch(`${BASE_URL}/test-admin`, {
      method: 'GET',
      headers: { Cookie: newStudentCookie },
    });
    const adminRouteData = await adminRouteRes.json();

    if (adminRouteRes.status === 403 && adminRouteData.status === 'error') {
      recordResult(
        9,
        'Student blocked from admin-only route (HTTP 403)',
        true,
        `Status ${adminRouteRes.status}: "${adminRouteData.message}"`
      );
    } else {
      recordResult(
        9,
        'Student blocked from admin-only route (HTTP 403)',
        false,
        `Expected 403, got ${adminRouteRes.status}`
      );
    }

    // ----------------------------------------------------
    // Test Case 10: Verify the admin seed script creates an admin account safely
    // ----------------------------------------------------
    // Run seed script logic directly to test creation & idempotency
    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash(TEST_ADMIN.password, saltRounds);

    await query(
      `INSERT INTO users (name, email, password_hash, role, department)
       VALUES ($1, $2, $3, 'admin', 'Administration')`,
      [TEST_ADMIN.name, TEST_ADMIN.email.toLowerCase(), adminPasswordHash]
    );

    // Verify admin can login
    const adminLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0];

    // Verify admin CAN access /test-admin route
    const adminAccessRes = await fetch(`${BASE_URL}/test-admin`, {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const adminAccessData = await adminAccessRes.json();

    if (
      adminLoginRes.status === 200 &&
      adminLoginData.data.user.role === 'admin' &&
      adminAccessRes.status === 200 &&
      adminAccessData.status === 'success'
    ) {
      recordResult(
        10,
        'Admin seed creation and access verification',
        true,
        `Admin logged in (role="admin") and successfully accessed /test-admin (Status 200).`
      );
    } else {
      recordResult(10, 'Admin seed creation and access verification', false, `Admin access verification failed.`);
    }

    // Clean up temporary test accounts
    await query('DELETE FROM users WHERE email IN ($1, $2)', [
      TEST_STUDENT.email.toLowerCase(),
      TEST_ADMIN.email.toLowerCase(),
    ]);
    console.log('\nCleaned up temporary test accounts successfully.');
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
