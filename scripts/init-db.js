const { createDatabase, DEFAULT_DB_PATH } = require('../src/database');

const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
const db = createDatabase(dbPath);
const tagCount = db.prepare('SELECT COUNT(*) AS count FROM tags').get().count;
const contactCount = db.prepare('SELECT COUNT(*) AS count FROM contacts').get().count;

db.close();

console.log(`Database initialized at ${dbPath}`);
console.log(`Tags: ${tagCount} | Contacts: ${contactCount}`);
