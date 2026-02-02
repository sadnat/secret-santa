const { db } = require('../config/database');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_key_32_characters_long!';

const Assignment = {
  /**
   * Encrypt receiver ID
   */
  encrypt(receiverId) {
    return CryptoJS.AES.encrypt(String(receiverId), ENCRYPTION_KEY).toString();
  },

  /**
   * Decrypt receiver ID
   */
  decrypt(encryptedReceiver) {
    const bytes = CryptoJS.AES.decrypt(encryptedReceiver, ENCRYPTION_KEY);
    return parseInt(bytes.toString(CryptoJS.enc.Utf8), 10);
  },

  /**
   * Create hash of receiver ID (for admin verification without revealing)
   */
  hash(receiverId) {
    return CryptoJS.SHA256(String(receiverId) + ENCRYPTION_KEY).toString();
  },

  /**
   * Save a single assignment
   */
  create(giverId, receiverId) {
    const encryptedReceiver = this.encrypt(receiverId);
    const receiverHash = this.hash(receiverId);

    const stmt = db.prepare(`
      INSERT INTO assignments (giver_id, receiver_hash, encrypted_receiver)
      VALUES (?, ?, ?)
    `);

    return stmt.run(giverId, receiverHash, encryptedReceiver);
  },

  /**
   * Save multiple assignments in a transaction
   */
  createMany(assignments) {
    const insert = db.prepare(`
      INSERT INTO assignments (giver_id, receiver_hash, encrypted_receiver)
      VALUES (?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const { giverId, receiverId } of items) {
        const encryptedReceiver = this.encrypt(receiverId);
        const receiverHash = this.hash(receiverId);
        insert.run(giverId, receiverHash, encryptedReceiver);
      }
    });

    insertMany(assignments);
  },

  /**
   * Clear all assignments for a specific group
   */
  clearAllByGroup(groupId) {
    const stmt = db.prepare(`
      DELETE FROM assignments
      WHERE giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `);
    return stmt.run(groupId);
  },

  /**
   * Check if draw has been made for a specific group
   */
  drawExistsByGroup(groupId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM assignments
      WHERE giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `);
    return stmt.get(groupId).count > 0;
  },

  /**
   * Get assignment for a giver (decrypted)
   */
  getForGiver(giverId) {
    const stmt = db.prepare('SELECT * FROM assignments WHERE giver_id = ?');
    const assignment = stmt.get(giverId);

    if (assignment) {
      assignment.receiver_id = this.decrypt(assignment.encrypted_receiver);
    }

    return assignment;
  },

  /**
   * Get all assignments for a specific group
   */
  findAllForGroup(groupId) {
    const stmt = db.prepare(`
      SELECT
        a.id,
        a.giver_id,
        a.email_sent,
        a.created_at,
        p.first_name || ' ' || p.last_name as giver_name,
        p.email as giver_email
      FROM assignments a
      JOIN participants p ON a.giver_id = p.id
      WHERE p.group_id = ?
      ORDER BY p.first_name, p.last_name
    `);
    return stmt.all(groupId);
  },

  /**
   * Get all decrypted assignments for a specific group
   */
  findAllDecryptedByGroup(groupId) {
    const stmt = db.prepare(`
      SELECT
        a.*,
        g.first_name as giver_first_name,
        g.last_name as giver_last_name,
        g.email as giver_email,
        g.group_id
      FROM assignments a
      JOIN participants g ON a.giver_id = g.id
      WHERE g.group_id = ?
    `);

    const assignments = stmt.all(groupId);

    return assignments.map(a => {
      const receiverId = this.decrypt(a.encrypted_receiver);
      const receiver = db.prepare('SELECT * FROM participants WHERE id = ?').get(receiverId);

      return {
        ...a,
        receiver_id: receiverId,
        receiver
      };
    });
  },

  /**
   * Mark assignment as email sent
   */
  markEmailSent(id) {
    const stmt = db.prepare('UPDATE assignments SET email_sent = 1 WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Count pending emails for a specific group
   */
  countPendingEmailsByGroup(groupId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM assignments
      WHERE email_sent = 0
      AND giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `);
    return stmt.get(groupId).count;
  },

  /**
   * Count sent emails for a specific group
   */
  countSentEmailsByGroup(groupId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM assignments
      WHERE email_sent = 1
      AND giver_id IN (SELECT id FROM participants WHERE group_id = ?)
    `);
    return stmt.get(groupId).count;
  }
};

module.exports = Assignment;
