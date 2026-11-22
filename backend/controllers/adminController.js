const { pool, query } = require('../config/db');

const ALLOWED_STATUSES = new Set([
  'Submitted',
  'Under Review',
  'In Progress',
  'Resolved',
  'Rejected',
]);

const ALLOWED_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);

/**
 * Get all complaints with filtering, searching, sorting, and pagination
 * GET /api/admin/complaints
 */
const getComplaints = async (req, res, next) => {
  try {
    const {
      status,
      category,
      category_id,
      categoryId,
      priority,
      search,
      sort,
      page = 1,
      limit = 10,
    } = req.query;

    const conditions = [];
    const values = [];

    // Filter by status
    if (status) {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid status filter. Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
        });
      }
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }

    // Filter by category
    const catId = category || category_id || categoryId;
    if (catId) {
      const parsedCatId = parseInt(catId, 10);
      if (isNaN(parsedCatId) || parsedCatId <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Category ID must be a positive integer.',
        });
      }
      values.push(parsedCatId);
      conditions.push(`c.category_id = $${values.length}`);
    }

    // Filter by priority
    if (priority) {
      if (!ALLOWED_PRIORITIES.has(priority)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid priority filter. Allowed values: ${Array.from(ALLOWED_PRIORITIES).join(', ')}.`,
        });
      }
      values.push(priority);
      conditions.push(`c.priority = $${values.length}`);
    }

    // Search by tracking ID or title
    if (search && typeof search === 'string' && search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`(c.tracking_id ILIKE $${values.length} OR c.title ILIKE $${values.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination validation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Sorting order
    const sortOrder = sort && sort.toLowerCase() === 'oldest' ? 'ASC' : 'DESC';

    // Count total matching records
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM complaints c
      ${whereClause};
    `;
    const countResult = await query(countQuery, values);
    const total = parseInt(countResult.rows[0].total, 10);

    // Query paginated complaints
    const dataValues = [...values, limitNum, offset];
    const dataQuery = `
      SELECT 
        c.id, c.tracking_id, c.title, c.description, c.priority, c.status,
        c.created_at, c.updated_at,
        cat.id AS category_id, cat.name AS category_name,
        u.id AS student_id, u.name AS student_name, u.roll_number AS student_roll_number, u.department AS student_department
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u ON c.student_id = u.id
      ${whereClause}
      ORDER BY c.created_at ${sortOrder}
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length};
    `;
    const dataResult = await query(dataQuery, dataValues);

    const complaints = dataResult.rows.map((row) => ({
      id: row.id,
      trackingId: row.tracking_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      category: {
        id: row.category_id,
        name: row.category_name,
      },
      student: {
        id: row.student_id,
        name: row.student_name,
        rollNumber: row.student_roll_number,
        department: row.student_department,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        complaints,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update complaint status with transactional audit log creation
 * PATCH /api/admin/complaints/:id/status
 */
const updateComplaintStatus = async (req, res, next) => {
  const complaintId = parseInt(req.params.id, 10);
  if (isNaN(complaintId) || complaintId <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid complaint ID.' });
  }

  const { status, newStatus, remarks } = req.body;
  const targetStatus = status || newStatus;

  if (!targetStatus || !ALLOWED_STATUSES.has(targetStatus)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid status. Must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current status with row lock
    const currentCheck = await client.query(
      'SELECT id, status FROM complaints WHERE id = $1 FOR UPDATE;',
      [complaintId]
    );

    if (currentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Complaint not found.' });
    }

    const oldStatus = currentCheck.rows[0].status;

    // 2. Update status and updated_at
    const updateQuery = `
      UPDATE complaints
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, tracking_id, title, status, updated_at;
    `;
    const updateResult = await client.query(updateQuery, [targetStatus, complaintId]);
    const updatedComplaint = updateResult.rows[0];

    // 3. Insert audit log record
    const adminId = req.session.user.id;
    const logRemark = remarks && typeof remarks === 'string' && remarks.trim()
      ? remarks.trim()
      : `Status changed from ${oldStatus} to ${targetStatus}`;

    const insertLogQuery = `
      INSERT INTO complaint_logs (complaint_id, changed_by, old_status, new_status, remarks)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, complaint_id, changed_by, old_status, new_status, remarks, created_at;
    `;
    const logResult = await client.query(insertLogQuery, [
      complaintId,
      adminId,
      oldStatus,
      targetStatus,
      logRemark,
    ]);

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'Complaint status updated successfully.',
      data: {
        complaint: {
          id: updatedComplaint.id,
          trackingId: updatedComplaint.tracking_id,
          title: updatedComplaint.title,
          status: updatedComplaint.status,
          updatedAt: updatedComplaint.updated_at,
        },
        auditLog: logResult.rows[0],
      },
    });
  } catch (txError) {
    await client.query('ROLLBACK');
    next(txError);
  } finally {
    client.release();
  }
};

/**
 * Send an official administrator response to a complaint
 * POST /api/admin/complaints/:id/responses
 */
const sendResponse = async (req, res, next) => {
  try {
    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId) || complaintId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid complaint ID.' });
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Response message cannot be empty.',
      });
    }

    if (message.trim().length > 3000) {
      return res.status(400).json({
        status: 'error',
        message: 'Response message exceeds the maximum allowed length of 3000 characters.',
      });
    }

    // Verify complaint exists
    const complaintCheck = await query('SELECT id FROM complaints WHERE id = $1', [complaintId]);
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Complaint not found.' });
    }

    const adminId = req.session.user.id;
    const adminName = req.session.user.name;

    const insertResponseQuery = `
      INSERT INTO complaint_responses (complaint_id, admin_id, message)
      VALUES ($1, $2, $3)
      RETURNING id, complaint_id, admin_id, message, created_at;
    `;
    const result = await query(insertResponseQuery, [complaintId, adminId, message.trim()]);
    const savedResponse = result.rows[0];

    return res.status(201).json({
      status: 'success',
      message: 'Official response submitted successfully.',
      data: {
        response: {
          id: savedResponse.id,
          complaintId: savedResponse.complaint_id,
          message: savedResponse.message,
          adminId: savedResponse.admin_id,
          adminName,
          createdAt: savedResponse.created_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get system-wide complaint statistics and trends for administrator dashboard & analytics
 * GET /api/admin/stats
 */
const getStats = async (req, res, next) => {
  try {
    const { year, category, category_id, categoryId, status } = req.query;
    const conditions = [];
    const values = [];

    // Filter by year if supplied
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid year parameter. Must be a valid 4-digit year (e.g. 2026).',
        });
      }
      values.push(parsedYear);
      conditions.push(`EXTRACT(YEAR FROM c.created_at) = $${values.length}`);
    }

    // Filter by category if supplied
    const catId = category || category_id || categoryId;
    if (catId) {
      const parsedCatId = parseInt(catId, 10);
      if (isNaN(parsedCatId) || parsedCatId <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid category ID parameter.',
        });
      }
      values.push(parsedCatId);
      conditions.push(`c.category_id = $${values.length}`);
    }

    // Filter by status if supplied
    if (status && status !== 'All') {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid status parameter. Must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
        });
      }
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Status aggregates & Resolution rate
    const statusQuery = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE c.status = 'Submitted') AS submitted,
        COUNT(*) FILTER (WHERE c.status = 'Under Review') AS under_review,
        COUNT(*) FILTER (WHERE c.status = 'In Progress') AS in_progress,
        COUNT(*) FILTER (WHERE c.status = 'Resolved') AS resolved,
        COUNT(*) FILTER (WHERE c.status = 'Rejected') AS rejected,
        COUNT(*) FILTER (WHERE c.status != 'Resolved') AS unresolved,
        ROUND(COALESCE(COUNT(*) FILTER (WHERE c.status = 'Resolved') * 100.0 / NULLIF(COUNT(*), 0), 0), 1) AS resolution_rate
      FROM complaints c
      ${whereClause};
    `;
    const statusResult = await query(statusQuery, values);
    const s = statusResult.rows[0];

    const total = parseInt(s.total, 10) || 0;
    const submitted = parseInt(s.submitted, 10) || 0;
    const underReview = parseInt(s.under_review, 10) || 0;
    const inProgress = parseInt(s.in_progress, 10) || 0;
    const resolved = parseInt(s.resolved, 10) || 0;
    const rejected = parseInt(s.rejected, 10) || 0;
    const unresolved = parseInt(s.unresolved, 10) || 0;
    const resolutionRate = parseFloat(s.resolution_rate) || 0.0;

    // 2. Category distribution
    // When no category filter is applied, return all master categories with their count
    const categoryJoinCondition = conditions.length > 0
      ? `AND ${conditions.join(' AND ')}`
      : '';
    const categoryQuery = `
      SELECT cat.id, cat.name, COUNT(c.id) AS count
      FROM categories cat
      LEFT JOIN complaints c ON c.category_id = cat.id ${categoryJoinCondition}
      GROUP BY cat.id, cat.name
      ORDER BY cat.id ASC;
    `;
    const categoryResult = await query(categoryQuery, values);

    // 3. Priority distribution
    const priorityQuery = `
      SELECT
        COUNT(*) FILTER (WHERE c.priority = 'Low') AS low,
        COUNT(*) FILTER (WHERE c.priority = 'Medium') AS medium,
        COUNT(*) FILTER (WHERE c.priority = 'High') AS high,
        COUNT(*) FILTER (WHERE c.priority = 'Urgent') AS urgent
      FROM complaints c
      ${whereClause};
    `;
    const priorityResult = await query(priorityQuery, values);
    const p = priorityResult.rows[0];

    // 4. Monthly complaint trends (chronological with zero-month preservation)
    let trendsQuery;
    let trendsValues;

    // Build extra conditions for complaints in monthly trends (excluding year which is handled by calendar series)
    const trendConditions = [];
    const trendValues = [];

    if (catId) {
      trendValues.push(parseInt(catId, 10));
      trendConditions.push(`c.category_id = $${trendValues.length}`);
    }

    if (status && status !== 'All') {
      trendValues.push(status);
      trendConditions.push(`c.status = $${trendValues.length}`);
    }

    const trendJoinExtra = trendConditions.length > 0 ? `AND ${trendConditions.join(' AND ')}` : '';

    if (year) {
      const parsedYear = parseInt(year, 10);
      trendsValues = [parsedYear, ...trendValues];
      const shiftedTrendJoinExtra = trendConditions.length > 0
        ? `AND ${trendConditions.map((cond, i) => cond.replace(/\$\d+/, `$${i + 2}`)).join(' AND ')}`
        : '';

      trendsQuery = `
        WITH months AS (
          SELECT 
            TO_CHAR(m, 'YYYY-MM') AS month_key,
            TO_CHAR(m, 'Mon YYYY') AS month_label,
            m AS month_date
          FROM generate_series(
            DATE_TRUNC('month', MAKE_DATE($1::int, 1, 1)),
            DATE_TRUNC('month', MAKE_DATE($1::int, 12, 1)),
            '1 month'::interval
          ) AS m
        )
        SELECT
          m.month_key,
          m.month_label,
          COUNT(c.id)::int AS total,
          COUNT(c.id) FILTER (WHERE c.status = 'Resolved')::int AS resolved
        FROM months m
        LEFT JOIN complaints c ON TO_CHAR(c.created_at, 'YYYY-MM') = m.month_key ${shiftedTrendJoinExtra}
        GROUP BY m.month_key, m.month_label, m.month_date
        ORDER BY m.month_date ASC;
      `;
    } else {
      trendsValues = trendValues;
      trendsQuery = `
        WITH months AS (
          SELECT 
            TO_CHAR(m, 'YYYY-MM') AS month_key,
            TO_CHAR(m, 'Mon YYYY') AS month_label,
            m AS month_date
          FROM generate_series(
            DATE_TRUNC('month', NOW() - INTERVAL '5 months'),
            DATE_TRUNC('month', NOW()),
            '1 month'::interval
          ) AS m
        )
        SELECT
          m.month_key,
          m.month_label,
          COUNT(c.id)::int AS total,
          COUNT(c.id) FILTER (WHERE c.status = 'Resolved')::int AS resolved
        FROM months m
        LEFT JOIN complaints c ON TO_CHAR(c.created_at, 'YYYY-MM') = m.month_key ${trendJoinExtra}
        GROUP BY m.month_key, m.month_label, m.month_date
        ORDER BY m.month_date ASC;
      `;
    }

    const trendsResult = await query(trendsQuery, trendsValues);

    return res.status(200).json({
      status: 'success',
      data: {
        overview: {
          total,
          submitted,
          underReview,
          inProgress,
          resolved,
          rejected,
          unresolved,
          resolutionRate,
        },
        byStatus: [
          { status: 'Submitted', count: submitted, color: '#3b82f6' },
          { status: 'Under Review', count: underReview, color: '#a855f7' },
          { status: 'In Progress', count: inProgress, color: '#f59e0b' },
          { status: 'Resolved', count: resolved, color: '#10b981' },
          { status: 'Rejected', count: rejected, color: '#ef4444' },
        ],
        byCategory: categoryResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          count: parseInt(r.count, 10) || 0,
        })),
        byPriority: [
          { priority: 'Low', count: parseInt(p.low, 10) || 0, color: '#94a3b8' },
          { priority: 'Medium', count: parseInt(p.medium, 10) || 0, color: '#38bdf8' },
          { priority: 'High', count: parseInt(p.high, 10) || 0, color: '#fb923c' },
          { priority: 'Urgent', count: parseInt(p.urgent, 10) || 0, color: '#f87171' },
        ],
        monthlyTrends: trendsResult.rows.map((r) => ({
          monthKey: r.month_key,
          monthLabel: r.month_label,
          total: parseInt(r.total, 10) || 0,
          resolved: parseInt(r.resolved, 10) || 0,
        })),
        resolvedVsUnresolved: {
          resolved,
          unresolved,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getComplaints,
  updateComplaintStatus,
  sendResponse,
  getStats,
};
