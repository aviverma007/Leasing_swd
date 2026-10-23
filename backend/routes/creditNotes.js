const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, round2 } = require('../lib/helpers');
const router = express.Router();

function mapCN(r) {
  return {
    id: r.Id, no: r.No, invoiceId: r.InvoiceId, noteType: r.NoteType,
    date: r.NoteDate ? r.NoteDate.toISOString().slice(0, 10) : null,
    amount: Number(r.Amount), gstAmt: Number(r.GstAmt), total: Number(r.Total),
    reason: r.Reason, createdBy: r.CreatedBy,
    docStatus: r.DocStatus || 'Approved', approvedBy: r.ApprovedBy || null,
    rejectReason: r.RejectReason || null,
    createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null
  };
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM ${SCHEMA}.CreditNotes ORDER BY NoteDate DESC, No DESC`);
    res.json(r.recordset.map(mapCN));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Issue a credit (or debit) note against an invoice.
   Credit note reduces the invoice balance; debit note increases it. */
router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { invoiceId, amount, reason, noteType, date } = req.body;
    const type = noteType === 'Debit' ? 'Debit' : 'Credit';
    if (!invoiceId) return res.status(400).json({ error: 'Invoice is required.' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Enter a positive note amount (taxable value).' });
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'A reason is mandatory for a credit/debit note.' });

    const invRow = await pool.request().input('id', sql.VarChar(40), invoiceId).query(`
      SELECT i.*, ISNULL(c.paid,0) AS Paid, ISNULL(cn.credited,0) AS Credited
      FROM ${SCHEMA}.Invoices i
      OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') c
      OUTER APPLY (SELECT SUM(CASE WHEN NoteType='Credit' THEN Total ELSE -Total END) credited
                   FROM ${SCHEMA}.CreditNotes WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') cn
      WHERE i.Id=@id`);
    const inv = invRow.recordset[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const gstPct = Number(inv.GstPct) || 0;
    const amt = round2(Number(amount));
    const gstAmt = round2(amt * gstPct / 100);
    const total = round2(amt + gstAmt);

    if (type === 'Credit') {
      const openBalance = round2(Number(inv.Total) - Number(inv.Paid) - Number(inv.Credited));
      if (total > openBalance + 0.5) {
        return res.status(400).json({ error: `Credit note (₹${total}) exceeds the open balance (₹${openBalance}). Max taxable: ₹${round2(openBalance / (1 + gstPct / 100))}.` });
      }
    }

    const id = uid();
    const no = await nextNo(pool, sql, type === 'Credit' ? 'CN' : 'DN');
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no)
      .input('invoiceId', sql.VarChar(40), invoiceId).input('type', sql.VarChar(10), type)
      .input('date', sql.Date, date || new Date().toISOString().slice(0, 10))
      .input('amount', sql.Decimal(18, 2), amt).input('gstAmt', sql.Decimal(18, 2), gstAmt)
      .input('total', sql.Decimal(18, 2), total).input('reason', sql.NVarChar(400), String(reason).slice(0, 400))
      .input('by', sql.NVarChar(150), req.user ? (req.user.email || req.user.username || 'system') : 'system')
      .query(`INSERT INTO ${SCHEMA}.CreditNotes (Id,No,InvoiceId,NoteType,NoteDate,Amount,GstAmt,Total,Reason,CreatedBy,DocStatus,CreatedAt)
              VALUES (@id,@no,@invoiceId,@type,@date,@amount,@gstAmt,@total,@reason,@by,'Pending',SYSDATETIME())`);
    const { logAudit, userName } = require('../lib/audit');
    await logAudit(pool, 'creditnotes', id, 'created', `${type} note ${no} of ₹${total} against invoice ${inv.No}: ${String(reason).slice(0, 120)}`, userName(req));
    await logAudit(pool, 'invoices', invoiceId, type === 'Credit' ? 'credit-note' : 'debit-note', `${type} note ${no} of ₹${total} issued (pending approval)`, userName(req));
    res.json({ id, no, total, docStatus: 'Pending' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
