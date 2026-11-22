const bcrypt = require('bcrypt');
const { query } = require('../config/db');

// Basic email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Register a new student account
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, rollNumber, roll_number, department } = req.body;
    const studentRollNumber = rollNumber || roll_number;

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ status: 'error', message: 'Full name is required.' });
    }
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ status: 'error', message: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters long.' });
    }
    if (!studentRollNumber || typeof studentRollNumber !== 'string' || !studentRollNumber.trim()) {
      return res.status(400).json({ status: 'error', message: 'Roll number is required for student registration.' });
    }
    if (!department || typeof department !== 'string' || !department.trim()) {
      return res.status(400).json({ status: 'error', message: 'Department is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedRollNumber = studentRollNumber.trim();
    const trimmedDepartment = department.trim();

    // Check email uniqueness using parameterized query
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'An account with this email address already exists.',
      });
    }

    // Hash password using bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Hardcode role to 'student' - server never trusts client-supplied roles
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, role, roll_number, department)
      VALUES ($1, $2, $3, 'student', $4, $5)
      RETURNING id, name, email, role, roll_number, department, created_at;
    `;
    const insertResult = await query(insertQuery, [
      trimmedName,
      normalizedEmail,
      passwordHash,
      trimmedRollNumber,
      trimmedDepartment,
    ]);

    const newUser = insertResult.rows[0];

    return res.status(201).json({
      status: 'success',
      message: 'Student account registered successfully. Please log in.',
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          rollNumber: newUser.roll_number,
          department: newUser.department,
          createdAt: newUser.created_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log in student or administrator
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Fetch user by email
    const userResult = await query(
      'SELECT id, name, email, password_hash, role, roll_number, department FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // Use generic error message to prevent account enumeration
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      });
    }

    const user = userResult.rows[0];

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      });
    }

    // Regenerate session to protect against session fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      // Store authenticated user profile in server-side session
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.roll_number,
        department: user.department,
      };

      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        return res.status(200).json({
          status: 'success',
          message: 'Login successful.',
          data: {
            user: req.session.user,
          },
        });
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log out and destroy session
 * POST /api/auth/logout
 */
const logout = (req, res, next) => {
  if (!req.session) {
    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  }

  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  });
};

/**
 * Get current session user profile
 * GET /api/auth/me
 */
const getMe = (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Not authenticated.',
    });
  }

  return res.status(200).json({
    status: 'success',
    data: {
      user: req.session.user,
    },
  });
};

module.exports = {
  register,
  login,
  logout,
  getMe,
};
