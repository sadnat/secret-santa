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

    // Token expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO organizers (email, password_hash, first_name, last_name, group_name, group_code, is_verified, verification_token, verification_token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const result = stmt.run(
      data.email.toLowerCase().trim(),
      passwordHash,
      data.first_name.trim(),
      data.last_name.trim(),
      'Legacy Placeholder', // Placeholder
      legacyCode,
      verificationToken,
      expiresAt
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
    const stmt = db.prepare('SELECT id, verification_token_expires_at FROM organizers WHERE verification_token = ?');
    const organizer = stmt.get(token);
    
    if (!organizer) {
      return false;
    }

    // Check token expiration (24h)
    if (organizer.verification_token_expires_at) {
      const expiresAt = new Date(organizer.verification_token_expires_at);
      if (expiresAt < new Date()) {
        return false;
      }
    }

    const update = db.prepare('UPDATE organizers SET is_verified = 1, verification_token = NULL, verification_token_expires_at = NULL WHERE id = ?');
    update.run(organizer.id);
    return true;
  },

  /**
   * Verify password and return organizer if valid
   */
  async verifyPassword(email, password) {
    const organizer = this.findByEmail(email);
    if (!organizer) {
      // Dummy bcrypt compare to prevent timing-based user enumeration
      await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012');
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
   * Update organizer email (requires re-verification)
   * @param {number} id - Organizer ID
   * @param {string} newEmail - New email address
   * @returns {string} Verification token
   */
  updateEmail(id, newEmail) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      UPDATE organizers 
      SET email = ?, is_verified = 0, verification_token = ?, verification_token_expires_at = ?
      WHERE id = ?
    `);
    stmt.run(newEmail.toLowerCase().trim(), verificationToken, expiresAt, id);

    return verificationToken;
  },

  /**
   * Check if email exists for another organizer (excluding given id)
   * @param {string} email - Email to check
   * @param {number} excludeId - Organizer ID to exclude
   * @returns {boolean}
   */
  emailExistsForOther(email, excludeId) {
    const stmt = db.prepare('SELECT id FROM organizers WHERE email = ? AND id != ?');
    return stmt.get(email.toLowerCase().trim(), excludeId) !== undefined;
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
  },

  // ===== Password Reset Methods =====

  /**
   * Set a password reset token for an organizer (1 hour expiry)
   * @param {string} email - Organizer email
   * @returns {string|null} The reset token, or null if email not found
   */
  setResetToken(email) {
    const organizer = this.findByEmail(email);
    if (!organizer) {
      return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const stmt = db.prepare('UPDATE organizers SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?');
    stmt.run(token, expiresAt, organizer.id);

    return token;
  },

  /**
   * Find organizer by valid (non-expired) reset token
   * @param {string} token - Reset token
   * @returns {object|null} Organizer object or null
   */
  findByResetToken(token) {
    const stmt = db.prepare('SELECT id, email, first_name, last_name, reset_token_expires_at FROM organizers WHERE reset_token = ?');
    const organizer = stmt.get(token);

    if (!organizer) {
      return null;
    }

    // Check expiration
    if (organizer.reset_token_expires_at) {
      const expiresAt = new Date(organizer.reset_token_expires_at);
      if (expiresAt < new Date()) {
        return null;
      }
    }

    return organizer;
  },

  /**
   * Update password and clear reset token
   * @param {number} id - Organizer ID
   * @param {string} newPassword - New plain text password
   */
  async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const stmt = db.prepare('UPDATE organizers SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?');
    stmt.run(passwordHash, id);
  },

  /**
   * Clear reset token for an organizer
   * @param {number} id - Organizer ID
   */
  clearResetToken(id) {
    const stmt = db.prepare('UPDATE organizers SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?');
    stmt.run(id);
  },

  // ===== Admin Methods =====

  /**
   * Get all organizers (for admin panel)
   */
  findAll() {
    const stmt = db.prepare(`
      SELECT id, email, first_name, last_name, is_verified, is_admin, created_at
      FROM organizers
      ORDER BY created_at DESC
    `);
    return stmt.all();
  },

  /**
   * Count all organizers
   */
  countAll() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM organizers');
    return stmt.get().count;
  },

  /**
   * Set admin status for an organizer
   */
  setAdmin(id, isAdmin) {
    const stmt = db.prepare('UPDATE organizers SET is_admin = ? WHERE id = ?');
    return stmt.run(isAdmin ? 1 : 0, id);
  },

  /**
   * Check if an organizer is admin
   */
  isAdmin(id) {
    const stmt = db.prepare('SELECT is_admin FROM organizers WHERE id = ?');
    const result = stmt.get(id);
    return result ? result.is_admin === 1 : false;
  }
};

module.exports = Organizer;
