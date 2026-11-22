const express = require('express');
const complaintController = require('../controllers/complaintController');
const { requireAuth, requireStudent } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/upload');

const router = express.Router();

// Student-only complaint submission with Multer attachment handling
router.post('/', requireAuth, requireStudent, uploadMiddleware, complaintController.submitComplaint);

// List logged-in student's complaints with filters and summary metrics
router.get('/my', requireAuth, requireStudent, complaintController.getMyComplaints);

// Complaint details with ownership enforcement
router.get('/:id', requireAuth, complaintController.getComplaintById);

// Secure attachment access with ownership enforcement and path-traversal prevention
router.get('/:id/attachments/:attachmentId', requireAuth, complaintController.downloadAttachment);

module.exports = router;
