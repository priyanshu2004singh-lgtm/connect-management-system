const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/database');
const { createApp } = require('../src/app');

test('Connect API', async (t) => {
  const db = createDatabase(':memory:');
  const app = createApp(db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  async function request(path, options) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const text = await response.text();
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = text && isJson ? JSON.parse(text) : text || null;
    return { response, data };
  }

  function jsonRequest(method, body) {
    return {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  await t.test('serves the application and health endpoint', async () => {
    const health = await request('/api/health');
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.data, { status: 'ok' });

    const page = await request('/');
    assert.equal(page.response.status, 200);
    assert.match(page.response.headers.get('content-type'), /text\/html/);
  });

  await t.test('exposes default relationship tags and empty stats', async () => {
    const tags = await request('/api/tags');
    assert.equal(tags.response.status, 200);
    assert.deepEqual(
      tags.data.tags.map((tag) => tag.name),
      ['Client', 'Colleague', 'Family', 'Friend', 'Lead', 'Vendor']
    );

    const stats = await request('/api/stats');
    assert.deepEqual(stats.data.stats, {
      totalContacts: 0,
      totalCompanies: 0,
      recentInteractions: 0
    });
  });

  await t.test('rejects invalid contact data', async () => {
    const { response, data } = await request(
      '/api/contacts',
      jsonRequest('POST', {
        name: '',
        email: 'not-an-email',
        phone: 'abc',
        lastInteractionDate: '2999-12-31'
      })
    );

    assert.equal(response.status, 422);
    assert.ok(data.fields.name);
    assert.ok(data.fields.email);
    assert.ok(data.fields.phone);
    assert.ok(data.fields.lastInteractionDate);
  });

  await t.test('rejects malformed JSON', async () => {
    const { response, data } = await request('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });

    assert.equal(response.status, 400);
    assert.match(data.error, /invalid JSON/i);
  });

  let contactId;

  await t.test('creates a contact with tags', async () => {
    const { response, data } = await request(
      '/api/contacts',
      jsonRequest('POST', {
        name: 'Ada Lovelace',
        email: 'ada@analytical.example',
        phone: '+44 20 7946 0958',
        company: 'Analytical Engines',
        jobTitle: 'Founder',
        notes: 'Met at a computing history event.',
        lastInteractionDate: '2026-01-15',
        tags: ['Client', 'Lead', 'Client']
      })
    );

    assert.equal(response.status, 201);
    assert.equal(data.contact.name, 'Ada Lovelace');
    assert.equal(data.contact.tags.length, 2);
    assert.deepEqual(
      data.contact.tags.map((tag) => tag.name).sort(),
      ['Client', 'Lead']
    );
    contactId = data.contact.id;
  });

  await t.test('enforces case-insensitive email uniqueness', async () => {
    const { response, data } = await request(
      '/api/contacts',
      jsonRequest('POST', {
        name: 'Duplicate Ada',
        email: 'ADA@ANALYTICAL.EXAMPLE',
        phone: '+44 20 7946 0959',
        company: 'Analytical Engines'
      })
    );

    assert.equal(response.status, 409);
    assert.ok(data.fields.email);
  });

  await t.test('searches and filters contacts safely', async () => {
    const search = await request('/api/contacts?search=analytical');
    assert.equal(search.response.status, 200);
    assert.equal(search.data.total, 1);
    assert.equal(search.data.contacts[0].id, contactId);

    const filter = await request('/api/contacts?tag=Lead');
    assert.equal(filter.data.total, 1);

    const injection = await request(
      `/api/contacts?search=${encodeURIComponent("%' OR 1=1 --")}`
    );
    assert.equal(injection.response.status, 200);
    assert.equal(injection.data.total, 0);
  });

  await t.test('updates a contact and replaces its tags', async () => {
    const { response, data } = await request(
      `/api/contacts/${contactId}`,
      jsonRequest('PUT', {
        name: 'Ada King',
        email: 'ada@analytical.example',
        phone: '+44 20 7946 0000',
        company: 'Analytical Engines',
        jobTitle: 'Director',
        notes: 'Updated contact details.',
        lastInteractionDate: '2026-02-01',
        tags: ['Colleague', 'Vendor']
      })
    );

    assert.equal(response.status, 200);
    assert.equal(data.contact.name, 'Ada King');
    assert.equal(data.contact.phone, '+44 20 7946 0000');
    assert.deepEqual(
      data.contact.tags.map((tag) => tag.name).sort(),
      ['Colleague', 'Vendor']
    );

    const oldFilter = await request('/api/contacts?tag=Lead');
    assert.equal(oldFilter.data.total, 0);
  });

  await t.test('returns validation errors and 404s for bad IDs', async () => {
    const invalidId = await request('/api/contacts/not-a-number');
    assert.equal(invalidId.response.status, 400);

    const missing = await request('/api/contacts/99999');
    assert.equal(missing.response.status, 404);
  });

  await t.test('updates statistics after mutations', async () => {
    const { data } = await request('/api/stats');
    assert.equal(data.stats.totalContacts, 1);
    assert.equal(data.stats.totalCompanies, 1);
    assert.ok(data.stats.recentInteractions >= 0);
  });

  await t.test('deletes a contact and returns 204', async () => {
    const deleted = await request(`/api/contacts/${contactId}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 204);

    const missing = await request(`/api/contacts/${contactId}`);
    assert.equal(missing.response.status, 404);

    const contacts = await request('/api/contacts');
    assert.equal(contacts.data.total, 0);
  });

  await t.test('returns 404 for unknown API endpoints', async () => {
    const { response, data } = await request('/api/unknown');
    assert.equal(response.status, 404);
    assert.match(data.error, /not found/i);
  });
});
