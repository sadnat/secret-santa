const { db } = require('../config/database');

const Participant = {
  /**
   * Create a new participant for a group
   */
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO participants (first_name, last_name, email, wish1, wish2, wish3, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.first_name.trim(),
      data.last_name.trim(),
      data.email.toLowerCase().trim(),
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null,
      data.group_id
    );

    return Number(result.lastInsertRowid);
  },

  /**
   * Find participant by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM participants WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Find participant by ID and verify group ownership
   */
  findByIdAndGroup(id, groupId) {
    const stmt = db.prepare('SELECT * FROM participants WHERE id = ? AND group_id = ?');
    return stmt.get(id, groupId);
  },

  /**
   * Get all participants for a specific group
   */
  findAllByGroup(groupId) {
    const stmt = db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY created_at DESC');
    return stmt.all(groupId);
  },

  /**
   * Count participants for a specific group
   */
  countByGroup(groupId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM participants WHERE group_id = ?');
    return stmt.get(groupId).count;
  },

  /**
   * Delete a participant (verifies group ownership)
   */
  delete(id, groupId) {
    if (groupId) {
      const stmt = db.prepare('DELETE FROM participants WHERE id = ? AND group_id = ?');
      return stmt.run(id, groupId);
    }
    const stmt = db.prepare('DELETE FROM participants WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Check if email exists for a specific group
   */
  emailExistsForGroup(email, groupId) {
    const stmt = db.prepare('SELECT id FROM participants WHERE email = ? AND group_id = ?');
    return stmt.get(email.toLowerCase().trim(), groupId) !== undefined;
  },
  
  /**
   * Find participant by email (global)
   */
  findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM participants WHERE email = ?');
    return stmt.get(email.toLowerCase().trim());
  }
};

module.exports = Participant;
