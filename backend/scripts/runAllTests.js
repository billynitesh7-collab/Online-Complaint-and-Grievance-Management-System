/**
 * Master Automated Regression Test Runner
 * Executes all test suites sequentially and reports consolidated results.
 * Usage: npm test
 */
const { execSync } = require('child_process');
const path = require('path');

const testSuites = [
  { name: '1. Database Connection & Pool', file: 'testDbConnection.js' },
  { name: '2. Authentication & RBAC', file: 'testAuth.js' },
  { name: '3. Complaint Submission & Attachments', file: 'testComplaints.js' },
  { name: '4. Administrator Complaint Management', file: 'testAdminComplaints.js' },
  { name: '5. Student Frontend Integration', file: 'testStudentFrontend.js' },
  { name: '6. Administrator Frontend Integration', file: 'testAdminFrontend.js' },
  { name: '7. Analytics & PostgreSQL Aggregations', file: 'testAnalytics.js' },
  { name: '8. Security, CSRF & Access Boundaries', file: 'testSecurityAudit.js' },
];

console.log('===============================================================');
console.log('  ONLINE GRIEVANCE MANAGEMENT SYSTEM - MASTER TEST RUNNER');
console.log('===============================================================\n');

let totalPassed = 0;
let totalFailed = 0;
const summary = [];

for (const suite of testSuites) {
  const filePath = path.resolve(__dirname, suite.file);
  console.log(`>>> RUNNING: ${suite.name} (${suite.file})`);
  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 30000,
    });
    console.log(output);
    summary.push({ name: suite.name, status: 'PASSED' });
    totalPassed++;
  } catch (err) {
    console.error(`FAILED: ${suite.name}`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    summary.push({ name: suite.name, status: 'FAILED' });
    totalFailed++;
  }
  console.log('---------------------------------------------------------------\n');
}

console.log('===============================================================');
console.log('                 CONSOLIDATED TEST RESULTS');
console.log('===============================================================');
for (const res of summary) {
  console.log(`${res.status === 'PASSED' ? '✓' : '✗'} [${res.status}] ${res.name}`);
}
console.log(`\nTotal Test Suites: ${testSuites.length}`);
console.log(`Passed: ${totalPassed} | Failed: ${totalFailed}`);
console.log('===============================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL REGRESSION SUITES PASSED CLEANLY!\n');
  process.exit(0);
}
