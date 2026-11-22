const { testConnection, pool } = require('../config/db');

async function runTest() {
  console.log('Testing PostgreSQL connection...');
  try {
    const result = await testConnection();
    console.log('PostgreSQL Connection Test Passed successfully:');
    console.log(`- Database Name: ${result.database}`);
    console.log(`- Server Version: ${result.version}`);
    console.log(`- Current DB Time: ${result.timestamp}`);
    process.exit(0);
  } catch (error) {
    console.error('PostgreSQL Connection Test Failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTest();
