const { query } = require('../config/db');

/**
 * Get all available grievance categories
 * GET /api/categories
 */
const getCategories = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, description FROM categories ORDER BY id ASC;'
    );
    return res.status(200).json({
      status: 'success',
      data: {
        categories: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
};
