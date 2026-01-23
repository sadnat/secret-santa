const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'santa.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initialize() {
  // Create participants table
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      wish1 TEXT,
      wish2 TEXT,
      wish3 TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
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
  initialize
};
