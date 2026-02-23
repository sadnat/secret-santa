const { db } = require('../config/database');

const AdminLog = {
  /**
   * Log an admin action
   * @param {object} data - { adminId, adminEmail, action, targetType, targetId, details }
   */
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO admin_logs (admin_id, admin_email, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.adminId,
      data.adminEmail,
      data.action,
      data.targetType || null,
      data.targetId || null,
      data.details || null
    );
  },

  /**
   * Get all logs with pagination and optional search
   * @param {object} options - { search, page, limit }
   */
  findAll(options = {}) {
    const { search, page = 1, limit = 30 } = options;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause = `WHERE (l.action LIKE ? OR l.admin_email LIKE ? OR l.details LIKE ? OR l.target_type LIKE ?)`;
      params.push(term, term, term, term);
    }

    const stmt = db.prepare(`
      SELECT l.*
      FROM admin_logs l
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `);
    params.push(limit, offset);

    return stmt.all(...params);
  },

  /**
   * Count all logs (with optional search filter)
   * @param {string} search - Optional search term
   */
  countAll(search) {
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const stmt = db.prepare(`
        SELECT COUNT(*) as count FROM admin_logs l
        WHERE (l.action LIKE ? OR l.admin_email LIKE ? OR l.details LIKE ? OR l.target_type LIKE ?)
      `);
      return stmt.get(term, term, term, term).count;
    }
    const stmt = db.prepare('SELECT COUNT(*) as count FROM admin_logs');
    return stmt.get().count;
  }
};

module.exports = AdminLog;
