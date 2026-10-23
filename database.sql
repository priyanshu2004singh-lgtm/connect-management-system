PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL COLLATE NOCASE
    CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(trim(email)) BETWEEN 3 AND 254),
  phone TEXT NOT NULL
    CHECK (length(trim(phone)) BETWEEN 7 AND 30),
  company TEXT NOT NULL DEFAULT ''
    CHECK (length(company) <= 120),
  job_title TEXT NOT NULL DEFAULT ''
    CHECK (length(job_title) <= 120),
  notes TEXT NOT NULL DEFAULT ''
    CHECK (length(notes) <= 2000),
  last_interaction_date TEXT
    CHECK (
      last_interaction_date IS NULL OR
      last_interaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(trim(name)) BETWEEN 1 AND 30),
  color TEXT NOT NULL DEFAULT '#64748b'
    CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contacts_last_interaction ON contacts(last_interaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);

INSERT OR IGNORE INTO tags (name, color) VALUES
  ('Client', '#4f46e5'),
  ('Colleague', '#0284c7'),
  ('Friend', '#059669'),
  ('Lead', '#d97706'),
  ('Family', '#db2777'),
  ('Vendor', '#7c3aed');
