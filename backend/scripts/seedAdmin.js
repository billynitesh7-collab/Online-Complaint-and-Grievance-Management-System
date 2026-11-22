/**
 * Secure Administrator Seeding Script
 * Usage: node backend/scripts/seedAdmin.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/db');

async function seedAdmin() {
  const adminName = process.env.ADMIN_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminName || !adminEmail || !adminPassword) {
    console.error('Error: Missing required environment variables.');
    console.error('Please configure ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in your .env file.');
    process.exit(1);
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const trimmedName = adminName.trim();

  if (adminPassword.length < 8) {
    console.error('Error: Administrator password must be at least 8 characters long.');
    process.exit(1);
  }

  try {
    console.log(`Checking if administrator account exists for: ${normalizedEmail}...`);

    // Check existing user
    const existingResult = await query('SELECT id, name, email, role FROM users WHERE email = $1', [
      normalizedEmail,
    ]);

    if (existingResult.rows.length > 0) {
      const existingUser = existingResult.rows[0];
      if (existingUser.role === 'admin') {
        console.log(`Administrator account already exists (ID: ${existingUser.id}, Name: ${existingUser.name}). No changes made.`);
        process.exit(0);
      } else {
        console.error(
          `Conflict: User with email ${normalizedEmail} exists with role "${existingUser.role}". Cannot overwrite.`
        );
        process.exit(1);
      }
    }

    // Hash admin password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // Insert new administrator
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, role, roll_number, department)
      VALUES ($1, $2, $3, 'admin', NULL, 'Administration')
      RETURNING id, name, email, role, department, created_at;
    `;

    const insertResult = await query(insertQuery, [trimmedName, normalizedEmail, passwordHash]);
    const createdAdmin = insertResult.rows[0];

    console.log('Administrator account created successfully:');
    console.log(`- ID: ${createdAdmin.id}`);
    console.log(`- Name: ${createdAdmin.name}`);
    console.log(`- Email: ${createdAdmin.email}`);
    console.log(`- Role: ${createdAdmin.role}`);
    console.log(`- Department: ${createdAdmin.department}`);
    console.log(`- Created At: ${createdAdmin.created_at}`);
  } catch (error) {
    console.error('Failed to seed administrator account:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
