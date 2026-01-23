const { db } = require('../config/database');

const Exclusion = {
  /**
   * Create an exclusion rule (giver cannot give to receiver)
   */
  create(giverId, receiverId) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO exclusions (giver_id, receiver_id)
      VALUES (?, ?)
    `);
    return stmt.run(giverId, receiverId);
  },

  /**
   * Delete an exclusion rule
   */
  delete(id) {
    const stmt = db.prepare('DELETE FROM exclusions WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Delete exclusion by giver and receiver
   */
  deleteByPair(giverId, receiverId) {
    const stmt = db.prepare('DELETE FROM exclusions WHERE giver_id = ? AND receiver_id = ?');
    return stmt.run(giverId, receiverId);
  },

  /**
   * Get all exclusions with participant names
   */
  findAll() {
    const stmt = db.prepare(`
      SELECT
        e.id,
        e.giver_id,
        e.receiver_id,
        g.first_name || ' ' || g.last_name as giver_name,
        r.first_name || ' ' || r.last_name as receiver_name
      FROM exclusions e
      JOIN participants g ON e.giver_id = g.id
      JOIN participants r ON e.receiver_id = r.id
      ORDER BY giver_name, receiver_name
    `);
    return stmt.all();
  },

  /**
   * Get exclusions for a specific giver
   */
  findByGiver(giverId) {
    const stmt = db.prepare('SELECT receiver_id FROM exclusions WHERE giver_id = ?');
    return stmt.all(giverId).map(row => row.receiver_id);
  },

  /**
   * Get all exclusions as a map: giverId -> [receiverIds]
   */
  getExclusionMap() {
    const exclusions = db.prepare('SELECT giver_id, receiver_id FROM exclusions').all();
    const map = new Map();

    for (const { giver_id, receiver_id } of exclusions) {
      if (!map.has(giver_id)) {
        map.set(giver_id, []);
      }
      map.get(giver_id).push(receiver_id);
    }

    return map;
  },

  /**
   * Check if exclusion exists
   */
  exists(giverId, receiverId) {
    const stmt = db.prepare('SELECT id FROM exclusions WHERE giver_id = ? AND receiver_id = ?');
    return stmt.get(giverId, receiverId) !== undefined;
  }
};

module.exports = Exclusion;
