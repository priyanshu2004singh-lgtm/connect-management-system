# Connect Management System

A modern, responsive contact and relationship management application. Connect combines a lightweight Express API, a constrained SQLite database, and a dependency-free vanilla JavaScript interface.

## Features

- Contact dashboard with live totals for contacts, companies, clients, leads, and recent interactions.
- Responsive table that becomes a card layout on smaller screens.
- Create and edit contacts in an accessible modal form.
- Search by name, company, or email in real time.
- Filter by relationship tags: Client, Colleague, Friend, Lead, Family, and Vendor.
- Sort by last interaction, name, or recently added.
- Validation on both the client and server for names, email addresses, phone numbers, dates, and tags.
- Case-insensitive unique email enforcement.
- Delete confirmation flow and toast notifications.
- Parameterized SQL for every query, including search and filtering.
- Persistent local SQLite database with foreign keys, indexes, and check constraints.

## Tech Stack

- Frontend: HTML5, CSS3, and vanilla JavaScript
- Backend: Node.js and Express 5
- Database: SQLite through Node's built-in `node:sqlite` module

## Requirements

- Node.js 22.5 or newer
- npm 10 or newer

No native database compilation is required because the application uses Node's built-in SQLite driver.

## Project Structure

```text
connect-management-system/
├── database.sql
├── package.json
├── server.js
├── README.md
├── .gitignore
├── data/
│   └── .gitkeep
├── public/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── favicon.svg
├── scripts/
│   ├── init-db.js
│   └── seed.js
├── src/
│   ├── app.js
│   ├── contacts.js
│   └── database.js
└── test/
    └── api.test.js
```

## Setup

1. Move into the project directory:

   ```bash
   cd connect-management-system
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Initialize the database:

   ```bash
   npm run init-db
   ```

   The server also applies the schema automatically on startup, so this step can be repeated safely.

4. Optionally add eight demo contacts:

   ```bash
   npm run seed
   ```

5. Start the application:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000` in your browser.

For development with automatic server restarts:

```bash
npm run dev
```

## Available Scripts

| Command | Description |
| --- | --- |
| `npm start` | Starts the production-style server on port 3000. |
| `npm run dev` | Starts the server with Node's watch mode. |
| `npm run init-db` | Creates or updates the SQLite schema and default tags. |
| `npm run seed` | Adds demo contacts when the contacts table is empty. |
| `npm run seed -- --force` | Replaces all existing contacts with demo contacts. |
| `npm test` | Runs the API integration test suite. |

## Configuration

The following environment variables are supported:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port used by Express. |
| `DB_PATH` | `data/connect.db` | Path to the SQLite database file. Use `:memory:` for an ephemeral database. |
| `NODE_ENV` | unset | Set to `production` to enable static asset caching. |

PowerShell example:

```powershell
$env:PORT = "4000"
$env:DB_PATH = "C:\data\connect.db"
npm start
```

Bash example:

```bash
PORT=4000 DB_PATH=./data/connect.db npm start
```

## Database Schema

The complete schema lives in [`database.sql`](database.sql). It defines:

- `contacts`: primary contact details, notes, last interaction date, timestamps, validation checks, and a case-insensitive unique email.
- `tags`: reusable relationship categories with a unique case-insensitive name and display color.
- `contact_tags`: many-to-many join table with cascading deletes.
- Indexes for name, company, last interaction, and tag lookups.

Deleting a contact automatically removes its `contact_tags` rows through foreign key cascade rules.

## API Reference

All API responses are JSON except `DELETE`, which returns `204 No Content`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Basic health check. |
| `GET` | `/api/contacts` | List contacts. Supports `search`, `tag`, and `sort` query parameters. |
| `GET` | `/api/contacts/:id` | Fetch one contact. |
| `POST` | `/api/contacts` | Create a contact. |
| `PUT` | `/api/contacts/:id` | Replace a contact's details and tags. |
| `DELETE` | `/api/contacts/:id` | Delete a contact. |
| `GET` | `/api/tags` | List relationship tags and contact counts. |
| `GET` | `/api/stats` | Retrieve dashboard totals. |

Contact payload:

```json
{
  "name": "Maya Chen",
  "email": "maya@example.com",
  "phone": "+1 (415) 555-0132",
  "company": "Northstar Labs",
  "jobTitle": "Head of Product",
  "notes": "Reviewing the renewal proposal.",
  "lastInteractionDate": "2026-10-21",
  "tags": ["Client", "Lead"]
}
```

Example requests:

```bash
curl "http://localhost:3000/api/contacts?search=northstar&tag=Client&sort=recent"

curl -X POST "http://localhost:3000/api/contacts" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Maya Chen\",\"email\":\"maya@example.com\",\"phone\":\"+1 415 555 0132\",\"company\":\"Northstar Labs\",\"tags\":[\"Client\"]}"
```

Validation failures return `422` with a `fields` object. Duplicate email addresses return `409`. Missing contacts and unknown API routes return `404`.

## Security Notes

- Every database query is prepared with bound parameters.
- Dynamic sort order is selected from a server-side allowlist.
- Search wildcard characters are escaped before being used in `LIKE` clauses.
- Contact fields are validated and length-limited on both the client and server.
- Dynamic UI content is HTML-escaped before rendering.
- The server applies a restrictive Content Security Policy and other security headers.
- API responses are marked `Cache-Control: no-store`.
- Request bodies are limited to 64 KB.
- Email uniqueness is enforced by both application logic and a database constraint.

## Testing

Run the integration suite:

```bash
npm test
```

The tests use an in-memory SQLite database and cover health checks, static file serving, schema defaults, validation, malformed JSON, create, duplicate email handling, search, filter injection safety, update, statistics, delete, and API 404 behavior.

## Reset the Database

Stop the server, remove the SQLite files, and initialize again:

```powershell
Remove-Item "data\connect.db*" -Force
npm run init-db
```

To keep the schema but replace contacts with fresh demo data:

```bash
npm run seed -- --force
```
