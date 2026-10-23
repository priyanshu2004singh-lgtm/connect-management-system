const express = require('express');
const path = require('node:path');
const {
  createContact,
  deleteContact,
  getContact,
  getStats,
  listContacts,
  listTags,
  updateContact,
  validateContactInput
} = require('./contacts');

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function createApp(db) {
  const app = express();

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    );

    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    next();
  });

  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/contacts', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'recent';
    const contacts = listContacts(db, { search, tag, sort });

    res.json({ contacts, total: contacts.length });
  });

  app.get('/api/contacts/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Contact ID must be a positive integer.' });
    }

    const contact = getContact(db, id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    return res.json({ contact });
  });

  app.post('/api/contacts', (req, res) => {
    const result = validateContactInput(req.body);
    if (!result.valid) {
      return res.status(422).json({
        error: 'Please correct the highlighted fields.',
        fields: result.errors
      });
    }

    const contact = createContact(db, result.value);
    return res.status(201).json({ contact });
  });

  app.put('/api/contacts/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Contact ID must be a positive integer.' });
    }

    const result = validateContactInput(req.body);
    if (!result.valid) {
      return res.status(422).json({
        error: 'Please correct the highlighted fields.',
        fields: result.errors
      });
    }

    const contact = updateContact(db, id, result.value);
    return res.json({ contact });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Contact ID must be a positive integer.' });
    }

    deleteContact(db, id);
    return res.status(204).send();
  });

  app.get('/api/tags', (req, res) => {
    res.json({ tags: listTags(db) });
  });

  app.get('/api/stats', (req, res) => {
    res.json({ stats: getStats(db) });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      extensions: ['html'],
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
    })
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' });
    }

    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }

    const status = Number.isInteger(error.status) ? error.status : 500;

    if (status >= 500) {
      console.error(error);
      return res.status(500).json({ error: 'An unexpected server error occurred.' });
    }

    const payload = { error: error.message || 'Request failed.' };
    if (error.fields) {
      payload.fields = error.fields;
    }

    return res.status(status).json(payload);
  });

  return app;
}

module.exports = { createApp };
