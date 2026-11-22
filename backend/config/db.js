const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'online_grievance_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Reusable helper for executing parameterized SQL queries
 * @param {string} text - SQL query with parameter markers ($1, $2, etc.)
 * @param {Array} params - Array of parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => {
  return pool.query(text, params);
};

/**
 * Test database connectivity
 * @returns {Promise<{success: boolean, database: string, timestamp: string}>}
 */
const testConnection = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW() as current_time, current_database() as database, version() as version');
    return {
      success: true,
      database: res.rows[0].database,
      timestamp: res.rows[0].current_time,
      version: res.rows[0].version,
    };
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  testConnection,
};
