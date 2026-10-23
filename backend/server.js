require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getPool } = require('./db');
const { router: mastersRouter } = require('./routes/masters');
const { requireAuth, requireModule } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Public: health + auth (login) need no token
app.get('/api/health', async (req, res) => {
  try {
    await getPool();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.use('/api/auth', require('./routes/auth'));

// Everything below requires a valid signed token
app.use('/api', requireAuth);

// master data (generic CRUD) — module-gated
app.use('/api/companies', requireModule('companies'), mastersRouter('companies'));
app.use('/api/assets', requireModule('assets'), mastersRouter('assets'));
app.use('/api/blocks', requireModule('blocks'), mastersRouter('blocks'));
app.use('/api/units', requireModule('units'), mastersRouter('units'));
app.use('/api/brands', requireModule('brands'), mastersRouter('brands'));
app.use('/api/users', requireModule('users'), mastersRouter('users'));

// leasing & billing — module-gated
app.use('/api/leases', requireModule('leases'), require('./routes/leases'));
app.use('/api/sales', requireModule('sales'), require('./routes/sales'));
app.use('/api/invoices', requireModule('invoices'), require('./routes/invoices'));
app.use('/api/collections', requireModule('collections'), require('./routes/collections'));
app.use('/api/investor-units', requireModule('investors'), require('./routes/investors'));
app.use('/api/disbursement', requireModule('disbursement'), require('./routes/disbursement'));
app.use('/api/reports', requireModule('reports'), require('./routes/reports'));
// Alerts available to any authenticated user (no module gate — dashboard widget)
app.get('/api/alerts', async (req, res) => { require('./routes/reports').handle ? require('./routes/reports').handle(req, res) : res.json({}); });

// masters: customers & brokers (v3 separated masters)
app.use('/api/customers', requireModule('units'), mastersRouter('customers'));
app.use('/api/brokers', requireModule('brands'), mastersRouter('brokers'));

// role profiles (read for all signed-in users; writes admin-only inside the route)
app.use('/api/roles', require('./routes/roles'));

// credit/debit notes, tenant ledger, lease document vault
app.use('/api/credit-notes', requireModule('invoices'), require('./routes/creditNotes'));
app.use('/api/ledger', requireModule('invoices'), require('./routes/ledger'));
app.use('/api/lease-docs', requireModule('leases'), require('./routes/documents'));

// v4: maker–checker workflow, activity timeline & comments, global search, workspace stats
app.use('/api/wf', require('./routes/workflow'));
app.use('/api', require('./routes/activity')); // /api/activity/:type/:id + /api/comments/:type/:id
app.use('/api/search', require('./routes/search'));
app.use('/api/stats', require('./routes/stats'));

// deletion approval queue (route enforces admin-only for approve/reject internally)
app.use('/api/deletion-requests', require('./routes/deletionRequests'));

// admin-only user password reset + metadata
app.use('/api/user-admin', require('./routes/userAdmin'));

const PORT = process.env.PORT || 5096;
app.listen(PORT, () => {
  console.log(`Leasing & Billing API listening on port ${PORT}`);
  // arm the monthly auto-billing scheduler once the DB is reachable
  getPool().then((pool) => require('./lib/scheduler').startScheduler(pool))
    .catch((e) => console.error('[autobill] not armed (DB unreachable):', e.message));
});
