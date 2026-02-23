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
      archived_at DATETIME DEFAULT NULL,
      is_verified BOOLEAN DEFAULT 0,
      verification_token TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add archived_at column if it doesn't exist (migration)
  const orgColumns = db.prepare('PRAGMA table_info(organizers)').all();
  const hasArchivedAt = orgColumns.some(col => col.name === 'archived_at');
  if (!hasArchivedAt) {
    db.exec('ALTER TABLE organizers ADD COLUMN archived_at DATETIME DEFAULT NULL');
  }

  // Add is_verified column
  const hasIsVerified = orgColumns.some(col => col.name === 'is_verified');
  if (!hasIsVerified) {
    db.exec('ALTER TABLE organizers ADD COLUMN is_verified BOOLEAN DEFAULT 0');
    // Set existing users as verified
    db.exec('UPDATE organizers SET is_verified = 1');
  }

  // Add verification_token column
  const hasVerificationToken = orgColumns.some(col => col.name === 'verification_token');
  if (!hasVerificationToken) {
    db.exec('ALTER TABLE organizers ADD COLUMN verification_token TEXT DEFAULT NULL');
  }

  // Add verification_token_expires_at column
  const hasTokenExpiry = orgColumns.some(col => col.name === 'verification_token_expires_at');
  if (!hasTokenExpiry) {
    db.exec('ALTER TABLE organizers ADD COLUMN verification_token_expires_at DATETIME DEFAULT NULL');
  }

  // Add is_admin column
  const hasIsAdmin = orgColumns.some(col => col.name === 'is_admin');
  if (!hasIsAdmin) {
    db.exec('ALTER TABLE organizers ADD COLUMN is_admin BOOLEAN DEFAULT 0');
  }

  // Add reset_token and reset_token_expires_at columns
  const hasResetToken = orgColumns.some(col => col.name === 'reset_token');
  if (!hasResetToken) {
    db.exec('ALTER TABLE organizers ADD COLUMN reset_token TEXT DEFAULT NULL');
  }
  const hasResetTokenExpiry = orgColumns.some(col => col.name === 'reset_token_expires_at');
  if (!hasResetTokenExpiry) {
    db.exec('ALTER TABLE organizers ADD COLUMN reset_token_expires_at DATETIME DEFAULT NULL');
  }

  // Bootstrap admin from ADMIN_EMAIL environment variable
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const existingAdmin = db.prepare('SELECT id FROM organizers WHERE email = ? AND is_admin = 1').get(adminEmail);
    if (!existingAdmin) {
      const result = db.prepare('UPDATE organizers SET is_admin = 1 WHERE email = ?').run(adminEmail);
      if (result.changes > 0) {
        console.log(`Admin: Promoted ${adminEmail} to admin.`);
      }
    }
  }

  // Create groups table
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organizer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      archived_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_id) REFERENCES organizers(id) ON DELETE CASCADE
    )
  `);

  // Add budget and event_date columns to groups
  const groupColumns = db.prepare('PRAGMA table_info(groups)').all();
  const hasBudget = groupColumns.some(col => col.name === 'budget');
  if (!hasBudget) {
    db.exec('ALTER TABLE groups ADD COLUMN budget TEXT DEFAULT NULL');
  }
  const hasEventDate = groupColumns.some(col => col.name === 'event_date');
  if (!hasEventDate) {
    db.exec('ALTER TABLE groups ADD COLUMN event_date TEXT DEFAULT NULL');
  }

  // Migration: Move groups from organizers to groups table
  const groupsCount = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
  if (groupsCount === 0) {
    const organizers = db.prepare('SELECT * FROM organizers').all();
    if (organizers.length > 0) {
      console.log(`Migration: Moving ${organizers.length} groups to new table...`);
      const insertGroup = db.prepare(`
        INSERT INTO groups (organizer_id, name, code, archived_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Ensure participants table has group_id before migrating data
      // Check if participants table exists
      const tableExists = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'participants\'').get();
      if (tableExists) {
        const partColumns = db.prepare('PRAGMA table_info(participants)').all();
        const hasGroupId = partColumns.some(col => col.name === 'group_id');
        if (!hasGroupId) {
          db.exec('ALTER TABLE participants ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE');
        }

        // Prepare update statement AFTER ensuring column exists
        const updateParticipantGroup = db.prepare(`
          UPDATE participants SET group_id = ? WHERE organizer_id = ?
        `);

        const transaction = db.transaction((orgs) => {
          for (const org of orgs) {
            const result = insertGroup.run(
              org.id,
              org.group_name || 'Groupe Sans Nom',
              org.group_code || generateGroupCode(),
              org.archived_at,
              org.created_at
            );
            updateParticipantGroup.run(result.lastInsertRowid, org.id);
          }
        });
        
        transaction(organizers);
        console.log('Migration: Groups migrated successfully.');
      }
    }
  }

  // Check if participants table exists
  const tableExists = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'participants\'').get();

  if (tableExists) {
    // Table exists, check columns
    const columns = db.prepare('PRAGMA table_info(participants)').all();
    const hasOrganizerId = columns.some(col => col.name === 'organizer_id');
    const hasGroupId = columns.some(col => col.name === 'group_id');

    if (!hasOrganizerId) {
      // Legacy Migration (for very old installs)
      const existingParticipants = db.prepare('SELECT COUNT(*) as count FROM participants').get();

      if (existingParticipants && existingParticipants.count > 0) {
        console.log('Migration: Found existing participants, creating default organizer...');
        // (Simplified logic: assumes clean state or advanced migration needed if this runs)
        // Just adding column for safety as this path is rare now
        db.exec('ALTER TABLE participants ADD COLUMN organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE');
      } else {
        db.exec('ALTER TABLE participants ADD COLUMN organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE');
      }
    }

    if (!hasGroupId) {
      db.exec('ALTER TABLE participants ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE');
    }

    // Add edit_token column for participant self-service
    const hasEditToken = columns.some(col => col.name === 'edit_token');
    if (!hasEditToken) {
      db.exec('ALTER TABLE participants ADD COLUMN edit_token TEXT DEFAULT NULL');
      // Generate tokens for existing participants
      const existing = db.prepare('SELECT id FROM participants WHERE edit_token IS NULL').all();
      const updateToken = db.prepare('UPDATE participants SET edit_token = ? WHERE id = ?');
      for (const p of existing) {
        updateToken.run(crypto.randomBytes(16).toString('hex'), p.id);
      }
      if (existing.length > 0) {
        console.log(`Migration: Generated edit tokens for ${existing.length} existing participants.`);
      }
    }
  } else {
    // Create participants table with all columns
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
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        edit_token TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Create unique index on (organizer_id, email) if not exists
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_organizer_email
    ON participants(organizer_id, email)
  `);

  // Create unique index on (group_id, email) if not exists
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_group_email
    ON participants(group_id, email)
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
