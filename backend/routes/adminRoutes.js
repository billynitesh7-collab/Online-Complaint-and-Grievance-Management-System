const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply requireAuth and requireAdmin to all administrator management routes
router.use(requireAuth, requireAdmin);

// Admin complaint listing with search, filtering, and pagination
router.get('/complaints', adminController.getComplaints);

// System-wide metrics & aggregates for dashboard
router.get('/stats', adminController.getStats);

// Update complaint status with transactional audit log creation
router.patch('/complaints/:id/status', adminController.updateComplaintStatus);

// Post an official administrator response
router.post('/complaints/:id/responses', adminController.sendResponse);

module.exports = router;
