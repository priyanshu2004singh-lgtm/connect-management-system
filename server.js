const { createApp } = require('./src/app');
const { createDatabase, DEFAULT_DB_PATH } = require('./src/database');

const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
const db = createDatabase(dbPath);
const app = createApp(db);

const server = app.listen(port, () => {
  console.log(`Connect is running at http://localhost:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
