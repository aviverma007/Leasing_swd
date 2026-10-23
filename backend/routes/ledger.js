const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const router = express.Router();

/* Tenant ledger / Statement of Account.
   GET /api/ledger/:brandId  → chronological invoices (+debit notes) as debits,
   receipts and credit notes as credits, with a running balance. */
router.get('/:brandId', async (req, res) => {
  try {
    const pool = await getPool();
    const brandId = req.params.brandId;

    const inv = await pool.request().input('b', sql.VarChar(40), brandId).query(`
      SELECT i.Id, i.No, i.Type, i.Ym, i.DueDate AS D, i.Total, u.Name AS UnitName
      FROM ${SCHEMA}.Invoices i JOIN ${SCHEMA}.Units u ON u.Id=i.UnitId
      WHERE i.BrandId=@b`);
    const rec = await pool.request().input('b', sql.VarChar(40), brandId).query(`
      SELECT c.Id, c.No, c.CollDate AS D, c.Amount, c.Tds, c.Instrument, c.SdAdjAmt, i.No AS InvNo
      FROM ${SCHEMA}.Collections c JOIN ${SCHEMA}.Invoices i ON i.Id=c.InvoiceId
      WHERE i.BrandId=@b AND ISNULL(c.DocStatus,'Approved')='Approved'`);
    const cns = await pool.request().input('b', sql.VarChar(40), brandId).query(`
      SELECT cn.Id, cn.No, cn.NoteType, cn.NoteDate AS D, cn.Total, cn.Reason, i.No AS InvNo
      FROM ${SCHEMA}.CreditNotes cn JOIN ${SCHEMA}.Invoices i ON i.Id=cn.InvoiceId
      WHERE i.BrandId=@b AND ISNULL(cn.DocStatus,'Approved')='Approved'`);

    const rows = [];
    inv.recordset.forEach(r => rows.push({
      date: r.D.toISOString().slice(0, 10), doc: r.No, kind: 'Invoice',
      detail: `${r.Type} · ${r.UnitName} · ${r.Ym}`, debit: Number(r.Total), credit: 0
    }));
    rec.recordset.forEach(r => rows.push({
      date: r.D.toISOString().slice(0, 10), doc: r.No,
      kind: Number(r.SdAdjAmt) > 0 ? 'SD Adjustment' : 'Receipt',
      detail: `against ${r.InvNo} · ${r.Instrument}${Number(r.Tds) > 0 ? ` · TDS ₹${Number(r.Tds)}` : ''}`,
      debit: 0, credit: Number(r.Amount)
    }));
    cns.recordset.forEach(r => rows.push({
      date: r.D.toISOString().slice(0, 10), doc: r.No,
      kind: r.NoteType === 'Debit' ? 'Debit Note' : 'Credit Note',
      detail: `against ${r.InvNo} · ${r.Reason || ''}`.trim(),
      debit: r.NoteType === 'Debit' ? Number(r.Total) : 0,
      credit: r.NoteType === 'Debit' ? 0 : Number(r.Total)
    }));

    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'Invoice' ? -1 : 1));
    let bal = 0;
    rows.forEach(r => { bal = Math.round((bal + r.debit - r.credit) * 100) / 100; r.balance = bal; });

    res.json({
      rows,
      totals: {
        debit: Math.round(rows.reduce((s, r) => s + r.debit, 0) * 100) / 100,
        credit: Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100,
        balance: bal
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
