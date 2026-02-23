const { db } = require('../config/database');
const crypto = require('crypto');

const Participant = {
  /**
   * Create a new participant for a group (auto-generates edit token)
   */
  create(data) {
    const editToken = crypto.randomBytes(16).toString('hex');
    const stmt = db.prepare(`
      INSERT INTO participants (first_name, last_name, email, wish1, wish2, wish3, group_id, edit_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.first_name.trim(),
      data.last_name.trim(),
      data.email.toLowerCase().trim(),
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null,
      data.group_id,
      editToken
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
  },

  /**
   * Find participant by edit token (with group info)
   * @param {string} token - Edit token
   * @returns {object|null} Participant with group name, or null
   */
  findByEditToken(token) {
    const stmt = db.prepare(`
      SELECT p.*, g.name as group_name, g.archived_at as group_archived_at
      FROM participants p
      JOIN groups g ON p.group_id = g.id
      WHERE p.edit_token = ?
    `);
    return stmt.get(token);
  },

  /**
   * Count all participants across all groups
   */
  countAll() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM participants');
    return stmt.get().count;
  },

  /**
   * Update participant wishes
   * @param {number} id - Participant ID
   * @param {object} data - { wish1, wish2, wish3 }
   */
  updateWishes(id, data) {
    const stmt = db.prepare('UPDATE participants SET wish1 = ?, wish2 = ?, wish3 = ? WHERE id = ?');
    return stmt.run(
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null,
      id
    );
  },

  /**
   * Update participant details (organizer edit)
   * @param {number} id - Participant ID
   * @param {object} data - { first_name, last_name, email, wish1, wish2, wish3 }
   */
  update(id, data) {
    const stmt = db.prepare(`
      UPDATE participants 
      SET first_name = ?, last_name = ?, email = ?, wish1 = ?, wish2 = ?, wish3 = ?
      WHERE id = ?
    `);
    return stmt.run(
      data.first_name.trim(),
      data.last_name.trim(),
      data.email.toLowerCase().trim(),
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null,
      id
    );
  }
};

module.exports = Participant;
