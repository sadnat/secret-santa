const { db, generateGroupCode } = require('../config/database');

const Group = {
  /**
   * Create a new group
   */
  create(organizerId, name) {
    const code = generateGroupCode();
    const stmt = db.prepare(`
      INSERT INTO groups (organizer_id, name, code)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(organizerId, name.trim(), code);
    
    return {
      id: Number(result.lastInsertRowid),
      code
    };
  },

  /**
   * Find group by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM groups WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Find group by ID and Organizer (security check)
   */
  findByIdAndOrganizer(id, organizerId) {
    const stmt = db.prepare('SELECT * FROM groups WHERE id = ? AND organizer_id = ?');
    return stmt.get(id, organizerId);
  },

  /**
   * Find all groups for an organizer
   */
  findAllByOrganizer(organizerId) {
    const stmt = db.prepare('SELECT * FROM groups WHERE organizer_id = ? ORDER BY created_at DESC');
    return stmt.all(organizerId);
  },

  /**
   * Find group by code
   */
  findByCode(code) {
    const stmt = db.prepare('SELECT * FROM groups WHERE code = ?');
    return stmt.get(code.toUpperCase().trim());
  },

  /**
   * Update group details (name, budget, event_date)
   */
  update(id, data) {
    const updates = [];
    const values = [];

    if (data.name) {
      updates.push('name = ?');
      values.push(data.name.trim());
    }
    if (typeof data.budget !== 'undefined') {
      updates.push('budget = ?');
      values.push(data.budget ? data.budget.trim() : null);
    }
    if (typeof data.event_date !== 'undefined') {
      updates.push('event_date = ?');
      values.push(data.event_date || null);
    }

    if (updates.length === 0) return;

    values.push(id);
    const stmt = db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  /**
   * Regenerate group code
   */
  updateCode(id) {
    const newCode = generateGroupCode();
    const stmt = db.prepare('UPDATE groups SET code = ? WHERE id = ?');
    stmt.run(newCode, id);
    return newCode;
  },

  /**
   * Archive group
   */
  archive(id) {
    const stmt = db.prepare('UPDATE groups SET archived_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Unarchive group
   */
  unarchive(id) {
    const stmt = db.prepare('UPDATE groups SET archived_at = NULL WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Check if group is archived
   */
  isArchived(id) {
    const stmt = db.prepare('SELECT archived_at FROM groups WHERE id = ?');
    const result = stmt.get(id);
    return result && result.archived_at !== null;
  },

  /**
   * Delete group
   */
  delete(id) {
    // Delete associated data (cascade is set in DB but good to be explicit/safe)
    
    // 1. Delete assignments
    db.prepare(`
      DELETE FROM assignments
      WHERE giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `).run(id);

    // 2. Delete exclusions
    db.prepare(`
      DELETE FROM exclusions
      WHERE giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `).run(id);

    // 3. Delete participants
    db.prepare('DELETE FROM participants WHERE group_id = ?').run(id);

    // 4. Delete group
    const stmt = db.prepare('DELETE FROM groups WHERE id = ?');
    return stmt.run(id);
  },

  // ===== Admin Methods =====

  /**
   * Get all groups with organizer info (for admin panel)
   */
  findAllWithOrganizer() {
    const stmt = db.prepare(`
      SELECT 
        g.id, g.name, g.code, g.archived_at, g.created_at,
        o.id as organizer_id, o.email as organizer_email, 
        o.first_name as organizer_first_name, o.last_name as organizer_last_name,
        (SELECT COUNT(*) FROM participants WHERE group_id = g.id) as participant_count
      FROM groups g
      JOIN organizers o ON g.organizer_id = o.id
      ORDER BY g.created_at DESC
    `);
    return stmt.all();
  },

  /**
   * Count all groups
   */
  countAll() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM groups');
    return stmt.get().count;
  }
};

module.exports = Group;
