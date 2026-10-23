/* Maker–Checker approval workflow (single checker).
   Documents: invoices, leases, collections, credit notes.
   Lifecycle: Pending → Approved | Rejected (reject needs a reason; a rejected
   collection/credit-note no longer counts in balances; a rejected invoice
   cannot be printed; a lease must be Approved before it can go Active).
   Who can approve: any role whose Role Profile has CanApprove (Admin always). */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { canApprove, canEdit } = require('../lib/permissions');
const { logAudit, userName } = require('../lib/audit');
const router = express.Router();

const DOCS = {
  invoices: { table: 'Invoices', module: 'invoices', codeCol: 'No', label: 'Invoice' },
  leases: { table: 'Leases', module: 'leases', codeCol: 'Code', label: 'Lease' },
  collections: { table: 'Collections', module: 'collections', codeCol: 'No', label: 'Receipt' },
  creditnotes: { table: 'CreditNotes', module: 'invoices', codeCol: 'No', label: 'Credit/Debit Note' }
};

function doc(req, res) {
  const d = DOCS[String(req.params.type || '').toLowerCase()];
  if (!d) { res.status(400).json({ error: 'Unknown document type.' }); return null; }
  return d;
}

async function getRow(pool, d, id) {
  const r = await pool.request().input('id', sql.VarChar(40), id)
    .query(`SELECT Id, ${d.codeCol} AS Code, DocStatus FROM ${SCHEMA}.${d.table} WHERE Id=@id`);
  return r.recordset[0];
}

/* Re-submit a rejected (or draft) document for approval */
router.post('/:type/:id/submit', async (req, res) => {
  const d = doc(req, res); if (!d) return;
  try {
    const role = req.user && req.user.role;
    if (!canEdit(role, d.module)) return res.status(403).json({ error: `Your role (${role}) cannot modify ${d.module}.` });
    const pool = await getPool();
    const row = await getRow(pool, d, req.params.id);
    if (!row) return res.status(404).json({ error: `${d.label} not found` });
    if ((row.DocStatus || 'Approved') === 'Approved') return res.status(400).json({ error: `${d.label} ${row.Code} is already approved.` });
    const by = userName(req);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('by', sql.NVarChar(150), by)
      .query(`UPDATE ${SCHEMA}.${d.table} SET DocStatus='Pending', SubmittedBy=@by, SubmittedAt=SYSDATETIME(), RejectReason=NULL WHERE Id=@id`);
    await logAudit(pool, req.params.type, req.params.id, 'submitted', `${d.label} ${row.Code} submitted for approval`, by);
    res.json({ id: req.params.id, docStatus: 'Pending' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:type/:id/approve', async (req, res) => {
  const d = doc(req, res); if (!d) return;
  try {
    const role = req.user && req.user.role;
    if (!canApprove(role)) return res.status(403).json({ error: `Your role (${role}) cannot approve documents.` });
    const pool = await getPool();
    const row = await getRow(pool, d, req.params.id);
    if (!row) return res.status(404).json({ error: `${d.label} not found` });
    if ((row.DocStatus || 'Approved') === 'Approved') return res.status(400).json({ error: `${d.label} ${row.Code} is already approved.` });
    const by = userName(req);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('by', sql.NVarChar(150), by)
      .query(`UPDATE ${SCHEMA}.${d.table} SET DocStatus='Approved', ApprovedBy=@by, ApprovedAt=SYSDATETIME(), RejectReason=NULL WHERE Id=@id`);
    await logAudit(pool, req.params.type, req.params.id, 'approved', `${d.label} ${row.Code} approved by checker`, by);
    res.json({ id: req.params.id, docStatus: 'Approved', approvedBy: by });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:type/:id/reject', async (req, res) => {
  const d = doc(req, res); if (!d) return;
  try {
    const role = req.user && req.user.role;
    if (!canApprove(role)) return res.status(403).json({ error: `Your role (${role}) cannot approve/reject documents.` });
    const reason = req.body && String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is mandatory.' });
    const pool = await getPool();
    const row = await getRow(pool, d, req.params.id);
    if (!row) return res.status(404).json({ error: `${d.label} not found` });
    const by = userName(req);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('by', sql.NVarChar(150), by)
      .input('r', sql.NVarChar(400), reason.slice(0, 400))
      .query(`UPDATE ${SCHEMA}.${d.table} SET DocStatus='Rejected', ApprovedBy=@by, ApprovedAt=SYSDATETIME(), RejectReason=@r WHERE Id=@id`);
    await logAudit(pool, req.params.type, req.params.id, 'rejected', `${d.label} ${row.Code} rejected: ${reason}`, by);
    res.json({ id: req.params.id, docStatus: 'Rejected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Bulk-approve everything pending of one type (e.g. the month's generated invoices) */
router.post('/:type/approve-all', async (req, res) => {
  const d = doc(req, res); if (!d) return;
  try {
    const role = req.user && req.user.role;
    if (!canApprove(role)) return res.status(403).json({ error: `Your role (${role}) cannot approve documents.` });
    const pool = await getPool();
    const by = userName(req);
    const pend = await pool.request().query(`SELECT Id, ${d.codeCol} AS Code FROM ${SCHEMA}.${d.table} WHERE DocStatus='Pending'`);
    await pool.request().input('by', sql.NVarChar(150), by)
      .query(`UPDATE ${SCHEMA}.${d.table} SET DocStatus='Approved', ApprovedBy=@by, ApprovedAt=SYSDATETIME() WHERE DocStatus='Pending'`);
    for (const r of pend.recordset) {
      await logAudit(pool, req.params.type, r.Id, 'approved', `${d.label} ${r.Code} approved (bulk approval)`, by);
    }
    res.json({ approved: pend.recordset.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Pending counts per document type — for the Approvals inbox badge */
router.get('/pending-counts', async (req, res) => {
  try {
    const pool = await getPool();
    const out = {};
    for (const [key, d] of Object.entries(DOCS)) {
      const r = await pool.request().query(`SELECT COUNT(*) c FROM ${SCHEMA}.${d.table} WHERE DocStatus='Pending'`);
      out[key] = r.recordset[0].c;
    }
    out.total = Object.values(out).reduce((s, n) => s + n, 0);
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
