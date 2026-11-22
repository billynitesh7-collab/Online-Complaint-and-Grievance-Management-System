const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth, requireStudent, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Rate limiter for authentication endpoints (prevent brute-force abuse)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 30, // Permissive in test mode, strictly enforced in dev/prod
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

// Public authentication routes with rate limiting
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Session-protected routes
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.getMe);

// Role verification test routes (for automated testing and security audit)
router.get('/test-student', requireAuth, requireStudent, (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Student access verified.',
    user: req.session.user,
  });
});

router.get('/test-admin', requireAuth, requireAdmin, (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Administrator access verified.',
    user: req.session.user,
  });
});

module.exports = router;
