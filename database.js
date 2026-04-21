const Database = require("better-sqlite3");

const db = new Database("database.db");

// Students table
db.prepare(`
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)
`).run();

// Periods table
db.prepare(`
CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  target INTEGER
)
`).run();

// Payments table
db.prepare(`
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  period_id INTEGER,
  amount INTEGER,
  date TEXT
)
`).run();

module.exports = db;