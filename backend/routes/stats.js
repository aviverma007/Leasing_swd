/* Workspace dashboard — count cards with "since yesterday" deltas (Frappe-style).
   GET /api/stats/workspace */
const express = require('express');
const { getPool, SCHEMA } = require('../db');
const router = express.Router();

// [key, table, label, hasCreatedAt]
const CARDS = [
  ['companies', 'Companies', 'Lessee Companies', false],
  ['assets', 'Assets', 'Projects', false],
  ['blocks', 'Blocks', 'Blocks', false],
  ['units', 'Units', 'Units', false],
  ['customers', 'Customers', 'Customers', false],
  ['brands', 'Brands', 'Brands', false],
  ['brokers', 'Brokers', 'Brokers', false],
  ['users', 'Users', 'Users', false],
  ['leases', 'Leases', 'Leases', true],
  ['invoices', 'Invoices', 'Invoices', true],
  ['collections', 'Collections', 'Receipts', true],
  ['creditnotes', 'CreditNotes', 'Credit/Debit Notes', true]
];

router.get('/workspace', async (req, res) => {
  try {
    const pool = await getPool();
    const out = { masters: [], process: [] };
    for (const [key, table, label, hasCreatedAt] of CARDS) {
      try {
        const q = hasCreatedAt
          ? `SELECT COUNT(*) c,
               SUM(CASE WHEN CreatedAt >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) today,
               SUM(CASE WHEN DocStatus='Pending' THEN 1 ELSE 0 END) pending
             FROM ${SCHEMA}.${table}`
          : `SELECT COUNT(*) c, 0 today, 0 pending FROM ${SCHEMA}.${table}`;
        const r = await pool.request().query(q);
        const row = r.recordset[0];
        const card = { key, label, count: row.c, today: Number(row.today) || 0, pending: Number(row.pending) || 0 };
        (['leases', 'invoices', 'collections', 'creditnotes'].includes(key) ? out.process : out.masters).push(card);
      } catch (_) { /* table missing — skip card */ }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
