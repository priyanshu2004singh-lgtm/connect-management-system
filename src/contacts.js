const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[0-9+().\-\s]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAGS = 8;
const TAG_COLORS = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#ea580c'];

const CONTACT_COLUMNS = `
  c.id,
  c.full_name,
  c.email,
  c.phone,
  c.company,
  c.job_title,
  c.notes,
  c.last_interaction_date,
  c.created_at,
  c.updated_at
`;

const SORT_OPTIONS = {
  recent: "COALESCE(c.last_interaction_date, '') DESC, c.full_name COLLATE NOCASE ASC",
  name: 'c.full_name COLLATE NOCASE ASC',
  newest: 'c.created_at DESC, c.id DESC'
};

class ConflictError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.fields = fields;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

function localToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function readText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContactInput(body) {
  const errors = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: { form: 'Request body must be a JSON object.' },
      value: null
    };
  }

  const name = readText(body.name);
  const email = readText(body.email);
  const phone = readText(body.phone);
  const company = readText(body.company);
  const jobTitle = readText(body.jobTitle);
  const notes = readText(body.notes);
  const lastInteractionDate = readText(body.lastInteractionDate);

  if (!name) {
    errors.name = 'Full name is required.';
  } else if (name.length > 120) {
    errors.name = 'Full name must be 120 characters or fewer.';
  }

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!phone) {
    errors.phone = 'Phone number is required.';
  } else {
    const digits = (phone.match(/\d/g) || []).length;
    if (phone.length > 30 || digits < 7 || digits > 15 || !PHONE_PATTERN.test(phone)) {
      errors.phone = 'Enter a valid phone number with 7 to 15 digits.';
    }
  }

  if (company.length > 120) {
    errors.company = 'Company must be 120 characters or fewer.';
  }

  if (jobTitle.length > 120) {
    errors.jobTitle = 'Job title must be 120 characters or fewer.';
  }

  if (notes.length > 2000) {
    errors.notes = 'Notes must be 2,000 characters or fewer.';
  }

  if (lastInteractionDate) {
    const parsed = new Date(`${lastInteractionDate}T00:00:00Z`);
    const isValidDate =
      DATE_PATTERN.test(lastInteractionDate) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === lastInteractionDate;

    if (!isValidDate) {
      errors.lastInteractionDate = 'Enter a valid date.';
    } else if (lastInteractionDate > localToday()) {
      errors.lastInteractionDate = 'Last interaction date cannot be in the future.';
    }
  }

  let tags = [];
  if (body.tags !== undefined && body.tags !== null) {
    if (!Array.isArray(body.tags)) {
      errors.tags = 'Tags must be provided as a list.';
    } else {
      const seen = new Set();

      for (const rawTag of body.tags) {
        if (typeof rawTag !== 'string') {
          errors.tags = 'Each tag must be text.';
          break;
        }

        const tag = rawTag.trim();
        if (!tag || tag.length > 30) {
          errors.tags = 'Tags must be between 1 and 30 characters.';
          break;
        }

        const key = tag.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tags.push(tag);
        }
      }

      if (tags.length > MAX_TAGS) {
        errors.tags = `Choose no more than ${MAX_TAGS} tags.`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      email,
      phone,
      company,
      jobTitle,
      notes,
      lastInteractionDate: lastInteractionDate || null,
      tags
    }
  };
}

function serializeContact(row, tags = []) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    jobTitle: row.job_title,
    notes: row.notes,
    lastInteractionDate: row.last_interaction_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags
  };
}

function tagColor(name) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function withTransaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      error.rollbackFailed = true;
    }
    throw error;
  }
}

function attachTags(db, rows) {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const tagRows = db
    .prepare(
      `SELECT ct.contact_id, t.id, t.name, t.color
       FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE ASC`
    )
    .all(...ids);

  const tagsByContact = new Map();
  for (const tag of tagRows) {
    const contactTags = tagsByContact.get(tag.contact_id) || [];
    contactTags.push({ id: tag.id, name: tag.name, color: tag.color });
    tagsByContact.set(tag.contact_id, contactTags);
  }

  return rows.map((row) => serializeContact(row, tagsByContact.get(row.id) || []));
}

function syncTags(db, contactId, tags) {
  db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);

  if (tags.length === 0) {
    return;
  }

  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const linkTag = db.prepare(
    'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
  );

  for (const tag of tags) {
    insertTag.run(tag, tagColor(tag));
    const row = findTag.get(tag);
    linkTag.run(contactId, row.id);
  }
}

function isUniqueEmailError(error) {
  return String(error.message).includes('UNIQUE constraint failed: contacts.email');
}

function listContacts(db, filters = {}) {
  const search = readText(filters.search).slice(0, 120);
  const tag = readText(filters.tag).slice(0, 30);
  const sort = Object.hasOwn(SORT_OPTIONS, filters.sort) ? filters.sort : 'recent';
  const conditions = [];
  const params = [];

  if (search) {
    const escaped = search.replace(/[!%_]/g, '!$&').toLowerCase();
    const pattern = `%${escaped}%`;
    conditions.push(
      "(LOWER(c.full_name) LIKE ? ESCAPE '!' OR LOWER(c.company) LIKE ? ESCAPE '!' OR LOWER(c.email) LIKE ? ESCAPE '!')"
    );
    params.push(pattern, pattern, pattern);
  }

  if (tag) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM contact_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = c.id AND t.name = ?
      )`
    );
    params.push(tag);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts c
       ${whereClause}
       ORDER BY ${SORT_OPTIONS[sort]}`
    )
    .all(...params);

  return attachTags(db, rows);
}

function getContact(db, id) {
  const row = db
    .prepare(`SELECT ${CONTACT_COLUMNS} FROM contacts c WHERE c.id = ?`)
    .get(id);

  if (!row) {
    return null;
  }

  return attachTags(db, [row])[0];
}

function createContact(db, input) {
  const duplicate = db
    .prepare('SELECT id FROM contacts WHERE email = ?')
    .get(input.email);

  if (duplicate) {
    throw new ConflictError('A contact with this email address already exists.', {
      email: 'This email address is already in use.'
    });
  }

  try {
    return withTransaction(db, () => {
      const result = db
        .prepare(
          `INSERT INTO contacts
            (full_name, email, phone, company, job_title, notes, last_interaction_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.email,
          input.phone,
          input.company,
          input.jobTitle,
          input.notes,
          input.lastInteractionDate
        );

      const contactId = Number(result.lastInsertRowid);
      syncTags(db, contactId, input.tags);
      return getContact(db, contactId);
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new ConflictError('A contact with this email address already exists.', {
        email: 'This email address is already in use.'
      });
    }
    throw error;
  }
}

function updateContact(db, id, input) {
  const existing = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
  if (!existing) {
    throw new NotFoundError('Contact not found.');
  }

  const duplicate = db
    .prepare('SELECT id FROM contacts WHERE email = ? AND id <> ?')
    .get(input.email, id);

  if (duplicate) {
    throw new ConflictError('A contact with this email address already exists.', {
      email: 'This email address is already in use.'
    });
  }

  try {
    return withTransaction(db, () => {
      db.prepare(
        `UPDATE contacts
         SET full_name = ?,
             email = ?,
             phone = ?,
             company = ?,
             job_title = ?,
             notes = ?,
             last_interaction_date = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        input.name,
        input.email,
        input.phone,
        input.company,
        input.jobTitle,
        input.notes,
        input.lastInteractionDate,
        id
      );

      syncTags(db, id, input.tags);
      return getContact(db, id);
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new ConflictError('A contact with this email address already exists.', {
        email: 'This email address is already in use.'
      });
    }
    throw error;
  }
}

function deleteContact(db, id) {
  const result = db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  if (Number(result.changes) === 0) {
    throw new NotFoundError('Contact not found.');
  }
}

function listTags(db) {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.color, COUNT(ct.contact_id) AS contact_count
       FROM tags t
       LEFT JOIN contact_tags ct ON ct.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE ASC`
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    contactCount: row.contact_count
  }));
}

function getStats(db) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total_contacts,
         COUNT(DISTINCT CASE WHEN trim(company) <> '' THEN LOWER(company) END) AS total_companies,
         COALESCE(SUM(CASE WHEN last_interaction_date >= date('now', '-30 days') THEN 1 ELSE 0 END), 0) AS recent_interactions
       FROM contacts`
    )
    .get();

  return {
    totalContacts: row.total_contacts,
    totalCompanies: row.total_companies,
    recentInteractions: row.recent_interactions
  };
}

module.exports = {
  ConflictError,
  NotFoundError,
  createContact,
  deleteContact,
  getContact,
  getStats,
  listContacts,
  listTags,
  updateContact,
  validateContactInput
};
