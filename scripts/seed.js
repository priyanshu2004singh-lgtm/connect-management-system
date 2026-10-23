const { createDatabase, DEFAULT_DB_PATH } = require('../src/database');

function daysAgo(days) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  local.setUTCDate(local.getUTCDate() - days);
  return local.toISOString().slice(0, 10);
}

const demoContacts = [
  {
    name: 'Maya Chen',
    email: 'maya.chen@northstar.example',
    phone: '+1 (415) 555-0132',
    company: 'Northstar Labs',
    jobTitle: 'Head of Product',
    tags: ['Client', 'Lead'],
    lastInteractionDate: daysAgo(2),
    notes: 'Reviewing the Q4 product roadmap and preparing a renewal proposal.'
  },
  {
    name: 'Daniel Ortiz',
    email: 'daniel.ortiz@brightforge.example',
    phone: '+1 (212) 555-0188',
    company: 'Brightforge',
    jobTitle: 'Engineering Manager',
    tags: ['Colleague'],
    lastInteractionDate: daysAgo(5),
    notes: 'Discussed the API migration plan and shared architecture notes.'
  },
  {
    name: 'Priya Raman',
    email: 'priya.raman@lumenworks.example',
    phone: '+1 (650) 555-0114',
    company: 'Lumen Works',
    jobTitle: 'Founder',
    tags: ['Client'],
    lastInteractionDate: daysAgo(9),
    notes: 'Signed the annual plan. Check in about onboarding next month.'
  },
  {
    name: 'Noah Williams',
    email: 'noah.williams@example.com',
    phone: '+1 (503) 555-0175',
    company: 'Field Notes Studio',
    jobTitle: 'Photographer',
    tags: ['Friend'],
    lastInteractionDate: daysAgo(14),
    notes: 'Planning a hiking trip in the spring.'
  },
  {
    name: 'Sofia Rossi',
    email: 'sofia@atlasprint.example',
    phone: '+39 06 555 0142',
    company: 'Atlas Print',
    jobTitle: 'Account Director',
    tags: ['Vendor'],
    lastInteractionDate: daysAgo(21),
    notes: 'Primary contact for print production and event materials.'
  },
  {
    name: 'Elijah Brooks',
    email: 'elijah.brooks@vertex.example',
    phone: '+1 (312) 555-0163',
    company: 'Vertex Commerce',
    jobTitle: 'Operations Lead',
    tags: ['Lead'],
    lastInteractionDate: daysAgo(32),
    notes: 'Requested a demo after the conference. Follow up with pricing.'
  },
  {
    name: 'Hana Kim',
    email: 'hana.kim@meridian.example',
    phone: '+1 (206) 555-0199',
    company: 'Meridian Health',
    jobTitle: 'Partnerships Director',
    tags: ['Client', 'Colleague'],
    lastInteractionDate: daysAgo(45),
    notes: 'Interested in a joint webinar for the healthcare team.'
  },
  {
    name: 'Marcus Reed',
    email: 'marcus.reed@example.com',
    phone: '+1 (718) 555-0126',
    company: 'Reed & Co.',
    jobTitle: 'Consultant',
    tags: ['Family', 'Friend'],
    lastInteractionDate: daysAgo(67),
    notes: 'Catching up over dinner next time he is in town.'
  }
];

const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
const db = createDatabase(dbPath);
const force = process.argv.includes('--force');
const existing = db.prepare('SELECT COUNT(*) AS count FROM contacts').get().count;

if (existing > 0 && !force) {
  db.close();
  console.log(`Seed skipped: ${existing} contact(s) already exist.`);
  console.log('Run "npm run seed -- --force" to replace existing contacts.');
  process.exit(0);
}

const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
const insertContact = db.prepare(
  `INSERT INTO contacts
    (full_name, email, phone, company, job_title, notes, last_interaction_date)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const linkTag = db.prepare(
  'INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
);

db.exec('BEGIN IMMEDIATE');

try {
  if (force) {
    db.prepare('DELETE FROM contacts').run();
  }

  for (const contact of demoContacts) {
    const result = insertContact.run(
      contact.name,
      contact.email,
      contact.phone,
      contact.company,
      contact.jobTitle,
      contact.notes,
      contact.lastInteractionDate
    );

    for (const tagName of contact.tags) {
      const tag = findTag.get(tagName);
      if (tag) {
        linkTag.run(Number(result.lastInsertRowid), tag.id);
      }
    }
  }

  db.exec('COMMIT');
  console.log(`Seeded ${demoContacts.length} demo contacts into ${dbPath}.`);
} catch (error) {
  db.exec('ROLLBACK');
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
