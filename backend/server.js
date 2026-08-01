require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getPool } = require('./db');
const { router: mastersRouter } = require('./routes/masters');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await getPool();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// auth
app.use('/api/auth', require('./routes/auth'));

// master data (generic CRUD)
app.use('/api/companies', mastersRouter('companies'));
app.use('/api/assets', mastersRouter('assets'));
app.use('/api/blocks', mastersRouter('blocks'));
app.use('/api/units', mastersRouter('units'));
app.use('/api/brands', mastersRouter('brands'));
app.use('/api/users', mastersRouter('users'));

// leasing & billing
app.use('/api/leases', require('./routes/leases'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/investor-units', require('./routes/investors'));
app.use('/api/disbursement', require('./routes/disbursement'));
app.use('/api/reports', require('./routes/reports'));

const PORT = process.env.PORT || 5096;
app.listen(PORT, () => console.log(`Leasing & Billing API listening on port ${PORT}`));
