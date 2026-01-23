const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'data', 'santa.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Generate a unique group code
 */
function generateGroupCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function initialize() {
  // Create organizers table first
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      group_code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if participants table exists
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='participants'").get();

  if (tableExists) {
    // Table exists, check if it has organizer_id column (migration check)
    const columns = db.prepare("PRAGMA table_info(participants)").all();
    const hasOrganizerId = columns.some(col => col.name === 'organizer_id');

    if (!hasOrganizerId) {
      // Migration needed
      const existingParticipants = db.prepare('SELECT COUNT(*) as count FROM participants').get();

      if (existingParticipants && existingParticipants.count > 0) {
        console.log('Migration: Found existing participants, creating default organizer...');

        // Create default organizer for existing data
        const bcrypt = require('bcrypt');
        const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';
        const passwordHash = bcrypt.hashSync(defaultPassword, 10);
        const groupCode = generateGroupCode();

        const insertOrganizer = db.prepare(`
          INSERT INTO organizers (email, password_hash, first_name, last_name, group_name, group_code)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = insertOrganizer.run(
          'admin@secretsanta.local',
          passwordHash,
          'Admin',
          'Default',
          'Groupe par defaut',
          groupCode
        );

        const organizerId = result.lastInsertRowid;
        console.log(`Migration: Created default organizer with ID ${organizerId} and code ${groupCode}`);

        // Add organizer_id column to participants
        db.exec(`ALTER TABLE participants ADD COLUMN organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE`);

        // Update existing participants to belong to default organizer
        db.prepare('UPDATE participants SET organizer_id = ?').run(organizerId);
        console.log(`Migration: Assigned ${existingParticipants.count} participants to default organizer`);
      } else {
        // No existing participants, just add the column
        db.exec(`ALTER TABLE participants ADD COLUMN organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE`);
      }
    }
  } else {
    // Create participants table with organizer_id from the start
    db.exec(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        wish1 TEXT,
        wish2 TEXT,
        wish3 TEXT,
        organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Create unique index on (organizer_id, email) if not exists
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_organizer_email
    ON participants(organizer_id, email)
  `);

  // Create exclusions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      FOREIGN KEY (giver_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES participants(id) ON DELETE CASCADE,
      UNIQUE(giver_id, receiver_id)
    )
  `);

  // Create assignments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_id INTEGER NOT NULL,
      receiver_hash TEXT NOT NULL,
      encrypted_receiver TEXT NOT NULL,
      email_sent BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (giver_id) REFERENCES participants(id) ON DELETE CASCADE
    )
  `);

  // Create config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  console.log('Database initialized successfully');
}

module.exports = {
  db,
  initialize,
  generateGroupCode
};
