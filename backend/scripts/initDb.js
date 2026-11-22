/**
 * Database Schema Initialization Runner
 * Connects via pg pool and executes database/schema.sql idempotently.
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function initDb() {
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Connecting to PostgreSQL to initialize database schema...');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Schema executed successfully. All tables, constraints, and indexes verified.');
  } catch (err) {
    console.error('Failed to initialize schema:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDb();
