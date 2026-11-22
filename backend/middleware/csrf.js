/**
 * CSRF Protection Middleware
 * Defends against Cross-Site Request Forgery (CSRF) attacks on session-authenticated endpoints.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Validates Origin and Referer against the host and any configured trusted origins
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const csrfProtection = (req, res, next) => {
  // Safe read-only HTTP methods are exempt from CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 1. Check Fetch Metadata (Sec-Fetch-Site)
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({
      status: 'error',
      message: 'CSRF validation failed: Cross-site request rejected.',
    });
  }

  // Allowed external origins from environment (comma-separated if any)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase())
    : [];

  const host = req.headers.host;

  // 2. Validate Origin header
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isSameHost = originUrl.host.toLowerCase() === host.toLowerCase();
      const isExplicitlyAllowed = allowedOrigins.includes(origin.toLowerCase()) || allowedOrigins.includes(originUrl.host.toLowerCase());

      if (!isSameHost && !isExplicitlyAllowed) {
        return res.status(403).json({
          status: 'error',
          message: 'CSRF validation failed: Untrusted request origin.',
        });
      }
      return next();
    } catch (err) {
      return res.status(403).json({
        status: 'error',
        message: 'CSRF validation failed: Malformed Origin header.',
      });
    }
  }

  // 3. Validate Referer header when Origin is absent
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const isSameHost = refererUrl.host.toLowerCase() === host.toLowerCase();
      const isExplicitlyAllowed = allowedOrigins.includes(refererUrl.origin.toLowerCase()) || allowedOrigins.includes(refererUrl.host.toLowerCase());

      if (!isSameHost && !isExplicitlyAllowed) {
        return res.status(403).json({
          status: 'error',
          message: 'CSRF validation failed: Untrusted request referer.',
        });
      }
      return next();
    } catch (err) {
      return res.status(403).json({
        status: 'error',
        message: 'CSRF validation failed: Malformed Referer header.',
      });
    }
  }

  // If both Origin and Referer are absent (typical of automated test scripts / non-browser clients),
  // permit the request unless it explicitly identifies as an untrusted browser context.
  next();
};

module.exports = { csrfProtection };
