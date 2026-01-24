const { db, generateGroupCode } = require('../config/database');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const Organizer = {
  /**
   * Create a new organizer
   */
  async create(data) {
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const groupCode = generateGroupCode();

    const stmt = db.prepare(`
      INSERT INTO organizers (email, password_hash, first_name, last_name, group_name, group_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.email.toLowerCase().trim(),
      passwordHash,
      data.first_name.trim(),
      data.last_name.trim(),
      data.group_name.trim(),
      groupCode
    );

    return {
      id: Number(result.lastInsertRowid),
      groupCode
    };
  },

  /**
   * Verify password and return organizer if valid
   */
  async verifyPassword(email, password) {
    const organizer = this.findByEmail(email);
    if (!organizer) {
      return null;
    }

    const isValid = await bcrypt.compare(password, organizer.password_hash);
    if (!isValid) {
      return null;
    }

    // Don't return password hash
    const { password_hash, ...safeOrganizer } = organizer;
    return safeOrganizer;
  },

  /**
   * Find organizer by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM organizers WHERE id = ?');
    const organizer = stmt.get(id);
    if (organizer) {
      const { password_hash, ...safeOrganizer } = organizer;
      return safeOrganizer;
    }
    return null;
  },

  /**
   * Find organizer by email
   */
  findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM organizers WHERE email = ?');
    return stmt.get(email.toLowerCase().trim());
  },

  /**
   * Find organizer by group code
   */
  findByCode(code) {
    const stmt = db.prepare('SELECT * FROM organizers WHERE group_code = ?');
    const organizer = stmt.get(code.toUpperCase().trim());
    if (organizer) {
      const { password_hash, ...safeOrganizer } = organizer;
      return safeOrganizer;
    }
    return null;
  },

  /**
   * Check if email exists
   */
  emailExists(email) {
    const stmt = db.prepare('SELECT id FROM organizers WHERE email = ?');
    return stmt.get(email.toLowerCase().trim()) !== undefined;
  },

  /**
   * Regenerate group code for an organizer
   */
  updateGroupCode(id) {
    const newCode = generateGroupCode();
    const stmt = db.prepare('UPDATE organizers SET group_code = ? WHERE id = ?');
    stmt.run(newCode, id);
    return newCode;
  },

  /**
   * Update organizer profile
   */
  update(id, data) {
    const updates = [];
    const values = [];

    if (data.first_name) {
      updates.push('first_name = ?');
      values.push(data.first_name.trim());
    }
    if (data.last_name) {
      updates.push('last_name = ?');
      values.push(data.last_name.trim());
    }
    if (data.group_name) {
      updates.push('group_name = ?');
      values.push(data.group_name.trim());
    }

    if (updates.length === 0) return;

    values.push(id);
    const stmt = db.prepare(`UPDATE organizers SET ${updates.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  /**
   * Archive a group
   */
  archive(id) {
    const stmt = db.prepare('UPDATE organizers SET archived_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Unarchive a group
   */
  unarchive(id) {
    const stmt = db.prepare('UPDATE organizers SET archived_at = NULL WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Check if organizer is archived
   */
  isArchived(id) {
    const stmt = db.prepare('SELECT archived_at FROM organizers WHERE id = ?');
    const result = stmt.get(id);
    return result && result.archived_at !== null;
  },

  /**
   * Delete organizer and all associated data
   */
  delete(id) {
    // Delete in order due to foreign key constraints
    // 1. Delete assignments for participants of this organizer
    db.prepare(`
      DELETE FROM assignments
      WHERE giver_id IN (SELECT id FROM participants WHERE organizer_id = ?)
    `).run(id);

    // 2. Delete exclusions for participants of this organizer
    db.prepare(`
      DELETE FROM exclusions
      WHERE giver_id IN (SELECT id FROM participants WHERE organizer_id = ?)
    `).run(id);

    // 3. Delete participants
    db.prepare('DELETE FROM participants WHERE organizer_id = ?').run(id);

    // 4. Delete organizer
    db.prepare('DELETE FROM organizers WHERE id = ?').run(id);

    return true;
  },

  /**
   * Verify password for an organizer by ID
   */
  async verifyPasswordById(id, password) {
    const stmt = db.prepare('SELECT password_hash FROM organizers WHERE id = ?');
    const organizer = stmt.get(id);
    if (!organizer) {
      return false;
    }
    return bcrypt.compare(password, organizer.password_hash);
  }
};

module.exports = Organizer;
