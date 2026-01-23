const { db } = require('../config/database');

const Participant = {
  /**
   * Create a new participant for an organizer
   */
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO participants (first_name, last_name, email, wish1, wish2, wish3, organizer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.first_name.trim(),
      data.last_name.trim(),
      data.email.toLowerCase().trim(),
      data.wish1 || null,
      data.wish2 || null,
      data.wish3 || null,
      data.organizer_id
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
   * Find participant by ID and verify organizer ownership
   */
  findByIdAndOrganizer(id, organizerId) {
    const stmt = db.prepare('SELECT * FROM participants WHERE id = ? AND organizer_id = ?');
    return stmt.get(id, organizerId);
  },

  /**
   * Find participant by email (global - for backwards compatibility)
   */
  findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM participants WHERE email = ?');
    return stmt.get(email.toLowerCase().trim());
  },

  /**
   * Find participant by email for a specific organizer
   */
  findByEmailAndOrganizer(email, organizerId) {
    const stmt = db.prepare('SELECT * FROM participants WHERE email = ? AND organizer_id = ?');
    return stmt.get(email.toLowerCase().trim(), organizerId);
  },

  /**
   * Get all participants (global - for backwards compatibility)
   */
  findAll() {
    const stmt = db.prepare('SELECT * FROM participants ORDER BY created_at DESC');
    return stmt.all();
  },

  /**
   * Get all participants for a specific organizer
   */
  findAllByOrganizer(organizerId) {
    const stmt = db.prepare('SELECT * FROM participants WHERE organizer_id = ? ORDER BY created_at DESC');
    return stmt.all(organizerId);
  },

  /**
   * Count participants (global)
   */
  count() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM participants');
    return stmt.get().count;
  },

  /**
   * Count participants for a specific organizer
   */
  countByOrganizer(organizerId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM participants WHERE organizer_id = ?');
    return stmt.get(organizerId).count;
  },

  /**
   * Delete a participant (verifies organizer ownership)
   */
  delete(id, organizerId) {
    if (organizerId) {
      const stmt = db.prepare('DELETE FROM participants WHERE id = ? AND organizer_id = ?');
      return stmt.run(id, organizerId);
    }
    const stmt = db.prepare('DELETE FROM participants WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Check if email exists (global)
   */
  emailExists(email) {
    const stmt = db.prepare('SELECT id FROM participants WHERE email = ?');
    return stmt.get(email.toLowerCase().trim()) !== undefined;
  },

  /**
   * Check if email exists for a specific organizer
   */
  emailExistsForOrganizer(email, organizerId) {
    const stmt = db.prepare('SELECT id FROM participants WHERE email = ? AND organizer_id = ?');
    return stmt.get(email.toLowerCase().trim(), organizerId) !== undefined;
  }
};

module.exports = Participant;
