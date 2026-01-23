const { db } = require('../config/database');

const Participant = {
  /**
   * Create a new participant
   */
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO participants (first_name, last_name, email, wish1, wish2, wish3)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.first_name.trim(),
      data.last_name.trim(),
      data.email.toLowerCase().trim(),
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null
    );

    return result.lastInsertRowid;
  },

  /**
   * Find participant by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM participants WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Find participant by email
   */
  findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM participants WHERE email = ?');
    return stmt.get(email.toLowerCase().trim());
  },

  /**
   * Get all participants
   */
  findAll() {
    const stmt = db.prepare('SELECT * FROM participants ORDER BY created_at DESC');
    return stmt.all();
  },

  /**
   * Count participants
   */
  count() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM participants');
    return stmt.get().count;
  },

  /**
   * Delete a participant
   */
  delete(id) {
    const stmt = db.prepare('DELETE FROM participants WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Check if email exists
   */
  emailExists(email) {
    const stmt = db.prepare('SELECT id FROM participants WHERE email = ?');
    return stmt.get(email.toLowerCase().trim()) !== undefined;
  }
};

module.exports = Participant;
