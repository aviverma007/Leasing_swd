/* Global search (Ctrl+G command palette).
   GET /api/search?q=... → top matches across leases, invoices, units, brands,
   customers, brokers, collections, companies — each with the view to open. */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const router = express.Router();

const SOURCES = [
  { type: 'lease', label: 'Lease', view: 'leases', sql: s => `SELECT TOP 5 Id, Code, Code AS Name, LifecycleStage AS Extra FROM ${s}.Leases WHERE Code LIKE @q` },
  { type: 'invoice', label: 'Invoice', view: 'invoices', sql: s => `SELECT TOP 5 Id, No AS Code, Descr AS Name, Ym AS Extra FROM ${s}.Invoices WHERE No LIKE @q OR Descr LIKE @q` },
  { type: 'unit', label: 'Unit', view: 'units', sql: s => `SELECT TOP 5 Id, Code, Name, Status AS Extra FROM ${s}.Units WHERE Code LIKE @q OR Name LIKE @q` },
  { type: 'brand', label: 'Brand', view: 'brands', sql: s => `SELECT TOP 5 Id, Code, Name, Category AS Extra FROM ${s}.Brands WHERE Code LIKE @q OR Name LIKE @q` },
  { type: 'customer', label: 'Customer', view: 'customers', sql: s => `SELECT TOP 5 Id, Code, Name, CustType AS Extra FROM ${s}.Customers WHERE Code LIKE @q OR Name LIKE @q` },
  { type: 'broker', label: 'Broker', view: 'brokers', sql: s => `SELECT TOP 5 Id, Code, Name, Firm AS Extra FROM ${s}.Brokers WHERE Code LIKE @q OR Name LIKE @q` },
  { type: 'company', label: 'Lessee Company', view: 'companies', sql: s => `SELECT TOP 5 Id, Code, Name, Gstin AS Extra FROM ${s}.Companies WHERE Code LIKE @q OR Name LIKE @q` },
  { type: 'collection', label: 'Receipt', view: 'collections', sql: s => `SELECT TOP 5 Id, No AS Code, Instrument AS Name, CONVERT(VARCHAR(10), CollDate, 120) AS Extra FROM ${s}.Collections WHERE No LIKE @q` },
  { type: 'asset', label: 'Project', view: 'assets', sql: s => `SELECT TOP 5 Id, Code, Name, City AS Extra FROM ${s}.Assets WHERE Code LIKE @q OR Name LIKE @q` }
];

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const pool = await getPool();
    const like = '%' + q.replace(/[%_\[]/g, c => '[' + c + ']') + '%';
    const out = [];
    for (const src of SOURCES) {
      try {
        const r = await pool.request().input('q', sql.NVarChar(120), like).query(src.sql(SCHEMA));
        for (const row of r.recordset) {
          out.push({ type: src.type, label: src.label, view: src.view, id: row.Id, code: row.Code, name: row.Name, extra: row.Extra });
        }
      } catch (_) { /* table missing on a stale DB — skip */ }
    }
    res.json(out.slice(0, 30));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
