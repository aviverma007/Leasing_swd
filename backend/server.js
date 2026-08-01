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

// deletion approval queue (route enforces admin-only for approve/reject internally)
app.use('/api/deletion-requests', require('./routes/deletionRequests'));

// admin-only user password reset + metadata
app.use('/api/user-admin', require('./routes/userAdmin'));

const PORT = process.env.PORT || 5096;
app.listen(PORT, () => console.log(`Leasing & Billing API listening on port ${PORT}`));
