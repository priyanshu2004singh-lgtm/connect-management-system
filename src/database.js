const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'connect.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'database.sql');

function createDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  return db;
}

module.exports = {
  createDatabase,
  DEFAULT_DB_PATH
};
