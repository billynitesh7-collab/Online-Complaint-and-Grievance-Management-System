/**
 * Authentication and Role-Based Access Control Middleware
 */

/**
 * Requires user to be authenticated via active session
 */
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please log in.',
    });
  }
  next();
};

/**
 * Restricts access to authenticated Students only
 */
const requireStudent = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please log in.',
    });
  }

  if (req.session.user.role !== 'student') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: Student access required.',
    });
  }

  next();
};

/**
 * Restricts access to authenticated Administrators only
 */
const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please log in.',
    });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: Administrator access required.',
    });
  }

  next();
};

module.exports = {
  requireAuth,
  requireStudent,
  requireAdmin,
};
