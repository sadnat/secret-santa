const { db, generateGroupCode } = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

const Organizer = {
  /**
   * Create a new organizer
   */
  async create(data) {
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    // Legacy support: generate a code to satisfy NOT NULL constraint
    const legacyCode = generateGroupCode(); 
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const stmt = db.prepare(`
      INSERT INTO organizers (email, password_hash, first_name, last_name, group_name, group_code, is_verified, verification_token)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);

    const result = stmt.run(
      data.email.toLowerCase().trim(),
      passwordHash,
      data.first_name.trim(),
      data.last_name.trim(),
      'Legacy Placeholder', // Placeholder
      legacyCode,
      verificationToken
    );

    return {
      id: Number(result.lastInsertRowid),
      verificationToken
    };
  },

  /**
   * Verify email with token
   */
  verifyEmail(token) {
    const stmt = db.prepare('SELECT id FROM organizers WHERE verification_token = ?');
    const organizer = stmt.get(token);
    
    if (!organizer) {
      return false;
    }

    const update = db.prepare('UPDATE organizers SET is_verified = 1, verification_token = NULL WHERE id = ?');
    update.run(organizer.id);
    return true;
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
   * Check if email exists
   */
  emailExists(email) {
    const stmt = db.prepare('SELECT id FROM organizers WHERE email = ?');
    return stmt.get(email.toLowerCase().trim()) !== undefined;
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

    if (updates.length === 0) return;

    values.push(id);
    const stmt = db.prepare(`UPDATE organizers SET ${updates.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  /**
   * Delete organizer and all associated data
   */
  delete(id) {
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
