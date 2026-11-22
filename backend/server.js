const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool, testConnection } = require('./config/db');
const { csrfProtection } = require('./middleware/csrf');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// Trust first proxy if running behind reverse proxy in production (e.g., Render, Nginx)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security & Parsing Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

// Restricted CORS: Permit same-origin and explicitly whitelisted domains only
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    let isAllowed = true;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const host = req.headers.host;
        const isSameHost = host && originUrl.host.toLowerCase() === host.toLowerCase();
        const allowedOrigins = process.env.ALLOWED_ORIGINS
          ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase())
          : [];
        isAllowed = isSameHost || allowedOrigins.includes(origin.toLowerCase()) || allowedOrigins.includes(originUrl.host.toLowerCase());
      } catch (err) {
        isAllowed = false;
      }
    }
    callback(null, { origin: isAllowed, credentials: true });
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF Defense Middleware for state-modifying requests
app.use(csrfProtection);

// Server-side Session Management with PostgreSQL Store
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || 'dev_secret_key_change_in_production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Online Grievance Management System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Application API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);

// Serve frontend static assets securely
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Fallback 404 Handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API route not found',
  });
});

// Central Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

// Start the server
const server = app.listen(PORT, async () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
  try {
    const dbInfo = await testConnection();
    console.log(`Connected to PostgreSQL database: ${dbInfo.database}`);
  } catch (err) {
    console.error('PostgreSQL connection failed at startup:', err.message);
  }
});

module.exports = { app, server };
