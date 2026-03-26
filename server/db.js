const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'leads.db');

let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_label TEXT NOT NULL,
      week_start TEXT NOT NULL,
      channel TEXT NOT NULL,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      leads INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      deal_type TEXT NOT NULL,
      status TEXT DEFAULT 'in_progress',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS channel_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL
    )
  `);

  // Seed channel statuses
  const result = db.exec('SELECT COUNT(*) FROM channel_status');
  const count = result[0]?.values[0][0] ?? 0;

  if (count === 0) {
    const defaults = [
      ['Google LSA', 'pending', 'Setup Needed'],
      ['Google Business', 'active', 'Live'],
      ['Facebook Groups', 'active', 'Live'],
      ['Zillow', 'active', 'Live'],
      ['Website', 'active', 'Live'],
      ['Referral', 'active', 'Active'],
    ];
    for (const [channel, status, label] of defaults) {
      db.run('INSERT OR IGNORE INTO channel_status (channel, status, label) VALUES (?, ?, ?)',
        [channel, status, label]);
    }
    saveDb();
  }

  return db;
}

function query(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const lastId = db.exec('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: lastId[0]?.values[0][0] ?? null };
}

module.exports = { initDb, query, run, saveDb };
