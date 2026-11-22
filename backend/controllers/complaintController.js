const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, query } = require('../config/db');

const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);

/**
 * Clean up uploaded files in case of validation or database failure
 * @param {Array<Express.Multer.File>} files
 */
async function cleanupFiles(files) {
  if (files && files.length > 0) {
    for (const file of files) {
      try {
        if (fs.existsSync(file.path)) {
          await fs.promises.unlink(file.path);
        }
      } catch (err) {
        console.error('Failed to unlink file during cleanup:', err.message);
      }
    }
  }
}

/**
 * Submit a new complaint
 * POST /api/complaints
 */
const submitComplaint = async (req, res, next) => {
  const files = req.files || [];

  try {
    const { title, description, category_id, categoryId, priority } = req.body;
    const catId = category_id || categoryId;

    // 1. Validate required fields
    if (!title || typeof title !== 'string' || !title.trim()) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Complaint title is required.' });
    }
    if (title.trim().length < 3 || title.trim().length > 200) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Complaint title must be between 3 and 200 characters.' });
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Complaint description is required.' });
    }
    if (description.trim().length < 5) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Complaint description must be at least 5 characters long.' });
    }

    if (!catId) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Category ID is required.' });
    }

    const parsedCategoryId = parseInt(catId, 10);
    if (isNaN(parsedCategoryId) || parsedCategoryId <= 0) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Category ID must be a valid positive integer.' });
    }

    if (!priority || !VALID_PRIORITIES.has(priority)) {
      await cleanupFiles(files);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid priority. Must be one of: Low, Medium, High, or Urgent.',
      });
    }

    // 2. Verify category exists in database
    const categoryCheck = await query('SELECT id, name FROM categories WHERE id = $1', [parsedCategoryId]);
    if (categoryCheck.rows.length === 0) {
      await cleanupFiles(files);
      return res.status(400).json({ status: 'error', message: 'Selected category does not exist.' });
    }

    // 3. Obtain student ID exclusively from the authenticated session
    const studentId = req.session.user.id;

    // 4. Generate unique, unpredictable tracking ID
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const trackingId = `GRV-${datePrefix}-${randomSuffix}`;

    // 5. Execute database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert core complaint record
      const insertComplaintQuery = `
        INSERT INTO complaints (
          tracking_id, student_id, category_id, title, description, priority, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'Submitted')
        RETURNING id, tracking_id, student_id, category_id, title, description, priority, status, created_at, updated_at;
      `;
      const complaintRes = await client.query(insertComplaintQuery, [
        trackingId,
        studentId,
        parsedCategoryId,
        title.trim(),
        description.trim(),
        priority,
      ]);
      const newComplaint = complaintRes.rows[0];

      // Insert attachment metadata
      const savedAttachments = [];
      for (const file of files) {
        const insertAttachQuery = `
          INSERT INTO complaint_attachments (
            complaint_id, original_name, stored_name, file_path, mime_type, file_size
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, original_name, mime_type, file_size, uploaded_at;
        `;
        const attachRes = await client.query(insertAttachQuery, [
          newComplaint.id,
          file.originalname,
          file.filename,
          file.path,
          file.mimetype,
          file.size,
        ]);

        savedAttachments.push({
          id: attachRes.rows[0].id,
          originalName: attachRes.rows[0].original_name,
          mimeType: attachRes.rows[0].mime_type,
          fileSize: attachRes.rows[0].file_size,
          uploadedAt: attachRes.rows[0].uploaded_at,
          downloadUrl: `/api/complaints/${newComplaint.id}/attachments/${attachRes.rows[0].id}`,
        });
      }

      // Insert initial history log entry
      const insertLogQuery = `
        INSERT INTO complaint_logs (
          complaint_id, changed_by, old_status, new_status, remarks
        )
        VALUES ($1, $2, NULL, 'Submitted', 'Complaint submitted by student');
      `;
      await client.query(insertLogQuery, [newComplaint.id, studentId]);

      await client.query('COMMIT');

      return res.status(201).json({
        status: 'success',
        message: 'Complaint submitted successfully.',
        data: {
          complaint: {
            id: newComplaint.id,
            trackingId: newComplaint.tracking_id,
            title: newComplaint.title,
            description: newComplaint.description,
            category: {
              id: categoryCheck.rows[0].id,
              name: categoryCheck.rows[0].name,
            },
            priority: newComplaint.priority,
            status: newComplaint.status,
            createdAt: newComplaint.created_at,
            updatedAt: newComplaint.updated_at,
            attachments: savedAttachments,
          },
        },
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      await cleanupFiles(files);
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    await cleanupFiles(files);
    next(error);
  }
};

/**
 * Get complaint details with attachments, responses, and audit history
 * GET /api/complaints/:id
 */
const getComplaintById = async (req, res, next) => {
  try {
    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId) || complaintId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid complaint ID.' });
    }

    // Query complaint details with category and student info
    const complaintQuery = `
      SELECT 
        c.id, c.tracking_id, c.student_id, c.title, c.description, c.priority, c.status,
        c.created_at, c.updated_at,
        cat.id AS category_id, cat.name AS category_name, cat.description AS category_description,
        u.name AS student_name, u.email AS student_email, u.roll_number AS student_roll_number, u.department AS student_department
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u ON c.student_id = u.id
      WHERE c.id = $1;
    `;
    const complaintResult = await query(complaintQuery, [complaintId]);

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Complaint not found.' });
    }

    const complaint = complaintResult.rows[0];

    // Authorization & Ownership Check
    // Students can access ONLY their own complaints
    if (req.session.user.role === 'student' && complaint.student_id !== req.session.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: You are not authorized to view this complaint.',
      });
    }

    // Query attachments (without exposing internal server paths)
    const attachmentsQuery = `
      SELECT id, original_name, mime_type, file_size, uploaded_at
      FROM complaint_attachments
      WHERE complaint_id = $1
      ORDER BY id ASC;
    `;
    const attachmentsResult = await query(attachmentsQuery, [complaintId]);
    const attachments = attachmentsResult.rows.map((att) => ({
      id: att.id,
      originalName: att.original_name,
      mimeType: att.mime_type,
      fileSize: att.file_size,
      uploadedAt: att.uploaded_at,
      downloadUrl: `/api/complaints/${complaintId}/attachments/${att.id}`,
    }));

    // Query status history logs
    const logsQuery = `
      SELECT 
        cl.id, cl.old_status, cl.new_status, cl.remarks, cl.created_at,
        u.name AS changed_by_name, u.role AS changed_by_role
      FROM complaint_logs cl
      JOIN users u ON cl.changed_by = u.id
      WHERE cl.complaint_id = $1
      ORDER BY cl.created_at ASC;
    `;
    const logsResult = await query(logsQuery, [complaintId]);

    // Query official administrator responses
    const responsesQuery = `
      SELECT 
        cr.id, cr.message, cr.created_at,
        u.name AS admin_name
      FROM complaint_responses cr
      JOIN users u ON cr.admin_id = u.id
      WHERE cr.complaint_id = $1
      ORDER BY cr.created_at ASC;
    `;
    const responsesResult = await query(responsesQuery, [complaintId]);

    return res.status(200).json({
      status: 'success',
      data: {
        complaint: {
          id: complaint.id,
          trackingId: complaint.tracking_id,
          title: complaint.title,
          description: complaint.description,
          priority: complaint.priority,
          status: complaint.status,
          category: {
            id: complaint.category_id,
            name: complaint.category_name,
            description: complaint.category_description,
          },
          student: req.session.user.role === 'admin'
            ? {
                id: complaint.student_id,
                name: complaint.student_name,
                email: complaint.student_email,
                rollNumber: complaint.student_roll_number,
                department: complaint.student_department,
              }
            : {
                name: complaint.student_name,
                rollNumber: complaint.student_roll_number,
              },
          createdAt: complaint.created_at,
          updatedAt: complaint.updated_at,
          attachments,
          history: logsResult.rows.map((log) => ({
            id: log.id,
            oldStatus: log.old_status,
            newStatus: log.new_status,
            remarks: log.remarks,
            changedBy: log.changed_by_name,
            role: log.changed_by_role,
            createdAt: log.created_at,
          })),
          responses: responsesResult.rows.map((resp) => ({
            id: resp.id,
            message: resp.message,
            adminName: resp.admin_name,
            createdAt: resp.created_at,
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Securely download or view an attachment
 * GET /api/complaints/:id/attachments/:attachmentId
 */
const downloadAttachment = async (req, res, next) => {
  try {
    const complaintId = parseInt(req.params.id, 10);
    const attachmentId = parseInt(req.params.attachmentId, 10);

    if (isNaN(complaintId) || isNaN(attachmentId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ID parameters.' });
    }

    // Verify complaint exists and check ownership
    const complaintResult = await query(
      'SELECT id, student_id FROM complaints WHERE id = $1',
      [complaintId]
    );

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Complaint not found.' });
    }

    const complaint = complaintResult.rows[0];

    // Students can access ONLY attachments for their own complaints
    if (req.session.user.role === 'student' && complaint.student_id !== req.session.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: You are not authorized to view this attachment.',
      });
    }

    // Fetch attachment metadata
    const attachResult = await query(
      'SELECT id, original_name, stored_name, file_path, mime_type FROM complaint_attachments WHERE id = $1 AND complaint_id = $2',
      [attachmentId, complaintId]
    );

    if (attachResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Attachment not found.' });
    }

    const attachment = attachResult.rows[0];

    // Prevent path traversal: ensure file path stays within configured uploads folder
    const safeUploadsDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    const resolvedFilePath = path.resolve(attachment.file_path);

    if (!resolvedFilePath.startsWith(safeUploadsDir)) {
      return res.status(403).json({ status: 'error', message: 'Invalid file access path.' });
    }

    if (!fs.existsSync(resolvedFilePath)) {
      return res.status(404).json({ status: 'error', message: 'Attachment file not found on disk.' });
    }

    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.original_name)}"`
    );
    return res.sendFile(resolvedFilePath);
  } catch (error) {
    next(error);
  }
};

/**
 * Get logged-in student's complaints and summary counters
 * GET /api/complaints/my
 */
const getMyComplaints = async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const { status, search } = req.query;

    const conditions = ['c.student_id = $1'];
    const values = [studentId];

    if (status && status !== 'All') {
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }

    if (search && typeof search === 'string' && search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`(c.tracking_id ILIKE $${values.length} OR c.title ILIKE $${values.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const complaintsQuery = `
      SELECT 
        c.id, c.tracking_id, c.title, c.description, c.priority, c.status,
        c.created_at, c.updated_at,
        cat.id AS category_id, cat.name AS category_name,
        (SELECT COUNT(*) FROM complaint_attachments ca WHERE ca.complaint_id = c.id) AS attachment_count
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      ${whereClause}
      ORDER BY c.created_at DESC;
    `;
    const result = await query(complaintsQuery, values);

    // Compute summary metrics for the student across all their complaints
    const summaryQuery = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'Submitted') AS submitted,
        COUNT(*) FILTER (WHERE status = 'Under Review') AS under_review,
        COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'Rejected') AS rejected
      FROM complaints
      WHERE student_id = $1;
    `;
    const summaryResult = await query(summaryQuery, [studentId]);
    const summaryRow = summaryResult.rows[0];

    const summary = {
      total: parseInt(summaryRow.total, 10) || 0,
      submitted: parseInt(summaryRow.submitted, 10) || 0,
      underReview: parseInt(summaryRow.under_review, 10) || 0,
      inProgress: parseInt(summaryRow.in_progress, 10) || 0,
      resolved: parseInt(summaryRow.resolved, 10) || 0,
      rejected: parseInt(summaryRow.rejected, 10) || 0,
    };

    return res.status(200).json({
      status: 'success',
      data: {
        complaints: result.rows.map((r) => ({
          id: r.id,
          trackingId: r.tracking_id,
          title: r.title,
          description: r.description,
          priority: r.priority,
          status: r.status,
          category: {
            id: r.category_id,
            name: r.category_name,
          },
          attachmentCount: parseInt(r.attachment_count, 10) || 0,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitComplaint,
  getComplaintById,
  downloadAttachment,
  getMyComplaints,
};
