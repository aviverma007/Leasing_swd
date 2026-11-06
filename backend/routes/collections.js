const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, round2 } = require('../lib/helpers');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.Collections ORDER BY CollDate DESC`);
    res.json(result.recordset.map(r => ({
      id: r.Id, no: r.No, invoiceId: r.InvoiceId, date: r.CollDate.toISOString().slice(0, 10),
      amount: Number(r.Amount), tdsPct: Number(r.TdsPct), tds: Number(r.Tds), instrument: r.Instrument, ref: r.Ref,
      sdAdjAmt: Number(r.SdAdjAmt || 0), sdNote: r.SdNote || null,
      docStatus: r.DocStatus || 'Approved', approvedBy: r.ApprovedBy || null,
      rejectReason: r.RejectReason || null, createdBy: r.CreatedBy || null,
      createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { invoiceId, date, amount, tdsPct, instrument, ref } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a positive amount.' });
    const tds = round2(Number(amount) * Number(tdsPct || 0) / 100);
    const id = uid();
    const no = await nextNo(pool, sql, 'RCT');
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('invoiceId', sql.VarChar(40), invoiceId)
      .input('date', sql.Date, date).input('amount', sql.Decimal(18, 2), amount).input('tdsPct', sql.Decimal(9, 3), tdsPct || 0)
      .input('tds', sql.Decimal(18, 2), tds).input('instrument', sql.VarChar(20), instrument).input('ref', sql.NVarChar(100), ref || '')
      .input('by', sql.NVarChar(150), (req.user && (req.user.email || req.user.username)) || 'system')
      .query(`INSERT INTO ${SCHEMA}.Collections (Id,No,InvoiceId,CollDate,Amount,TdsPct,Tds,Instrument,Ref,DocStatus,CreatedBy,CreatedAt)
        VALUES (@id,@no,@invoiceId,@date,@amount,@tdsPct,@tds,@instrument,@ref,'Pending',@by,SYSDATETIME())`);
    const { logAudit, userName } = require('../lib/audit');
    await logAudit(pool, 'collections', id, 'created', `Receipt ${no} of ₹${amount} (${instrument || 'receipt'}) — pending approval`, userName(req));
    res.json({ id, no, docStatus: 'Pending' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Cheque bounce / payment reversal.
   Marks the receipt Rejected (so it stops counting in every balance, ledger
   and report) and optionally raises an ad-hoc "bounce charges" invoice. */
router.post('/:id/bounce', async (req, res) => {
  try {
    const pool = await getPool();
    const reason = String((req.body && req.body.reason) || '').trim();
    const charges = Number((req.body && req.body.charges) || 0);
    if (!reason) return res.status(400).json({ error: 'A bounce reason is mandatory (e.g. "Cheque 123456 returned — insufficient funds").' });
    const cr = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT c.*, i.No AS InvNo, i.LeaseId, i.BrandId, i.UnitId, i.Ym, i.HsnCode, i.PaymentTermsDays, i.PlaceOfSupply
              FROM ${SCHEMA}.Collections c JOIN ${SCHEMA}.Invoices i ON i.Id=c.InvoiceId WHERE c.Id=@id`);
    const rec = cr.recordset[0];
    if (!rec) return res.status(404).json({ error: 'Receipt not found' });
    if ((rec.DocStatus || 'Approved') === 'Rejected') return res.status(400).json({ error: `Receipt ${rec.No} is already reversed.` });
    const by = (req.user && (req.user.email || req.user.username)) || 'system';

    await pool.request().input('id', sql.VarChar(40), req.params.id)
      .input('by', sql.NVarChar(150), by)
      .input('r', sql.NVarChar(400), ('Bounced/reversed: ' + reason).slice(0, 400))
      .query(`UPDATE ${SCHEMA}.Collections SET DocStatus='Rejected', ApprovedBy=@by, ApprovedAt=SYSDATETIME(), RejectReason=@r WHERE Id=@id`);
    const { logAudit } = require('../lib/audit');
    await logAudit(pool, 'collections', req.params.id, 'bounced', `Receipt ${rec.No} (₹${Number(rec.Amount)}) reversed — ${reason}`, by);
    await logAudit(pool, 'invoices', rec.InvoiceId, 'bounced', `Receipt ${rec.No} bounced — balance restored. ${reason}`, by);

    let chargeInv = null;
    if (charges > 0 && rec.LeaseId) {
      const leaseRow = await pool.request().input('id', sql.VarChar(40), rec.LeaseId).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
      const lease = leaseRow.recordset[0];
      const gstPct = Number(lease?.Gst) || 18;
      const igst = lease && (lease.IgstApplicable === true || lease.IgstApplicable === 1);
      const { gstSplit } = require('../lib/billing');
      const { gstAmt, cgstAmt, sgstAmt, igstAmt } = gstSplit(charges, gstPct, igst);
      const total = round2(charges + gstAmt);
      const id = uid();
      const no = await nextNo(pool, sql, 'INV');
      const { irnHex } = require('../lib/helpers');
      await pool.request()
        .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('type', sql.VarChar(20), 'Adhoc')
        .input('leaseId', sql.VarChar(40), rec.LeaseId).input('brandId', sql.VarChar(40), rec.BrandId).input('unitId', sql.VarChar(40), rec.UnitId)
        .input('ym', sql.Char(7), rec.Ym)
        .input('desc', sql.NVarChar(300), `Cheque bounce charges — receipt ${rec.No} against ${rec.InvNo}`)
        .input('amount', sql.Decimal(18, 2), round2(charges))
        .input('gstPct', sql.Decimal(9, 3), gstPct).input('gstAmt', sql.Decimal(18, 2), gstAmt)
        .input('cgstAmt', sql.Decimal(18, 2), cgstAmt).input('sgstAmt', sql.Decimal(18, 2), sgstAmt).input('igstAmt', sql.Decimal(18, 2), igstAmt)
        .input('total', sql.Decimal(18, 2), total).input('due', sql.Date, new Date().toISOString().slice(0, 10))
        .input('irn', sql.VarChar(64), irnHex())
        .input('hsnCode', sql.VarChar(20), rec.HsnCode || '997212').input('ptd', sql.Int, rec.PaymentTermsDays || 7)
        .input('ackNo', sql.VarChar(20), String(Math.floor(1e11 + Math.random() * 9e11)))
        .input('ackDate', sql.DateTime2, new Date()).input('pos', sql.NVarChar(60), rec.PlaceOfSupply || 'HARYANA')
        .input('by', sql.NVarChar(150), by)
        .query(`INSERT INTO ${SCHEMA}.Invoices (Id,No,Type,LeaseId,BrandId,UnitId,Ym,Descr,Amount,GstPct,GstAmt,CgstAmt,SgstAmt,IgstAmt,Total,DueDate,Irn,Status,HsnCode,PaymentTermsDays,AckNo,AckDate,PlaceOfSupply,DocStatus,CreatedBy,CreatedAt)
          VALUES (@id,@no,@type,@leaseId,@brandId,@unitId,@ym,@desc,@amount,@gstPct,@gstAmt,@cgstAmt,@sgstAmt,@igstAmt,@total,@due,@irn,'Unpaid',@hsnCode,@ptd,@ackNo,@ackDate,@pos,'Pending',@by,SYSDATETIME())`);
      await logAudit(pool, 'invoices', id, 'created', `Bounce charges invoice ${no} — ₹${charges} (+GST) for receipt ${rec.No}`, by);
      chargeInv = { id, no, total };
    }
    res.json({ id: req.params.id, docStatus: 'Rejected', chargeInvoice: chargeInv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { handleDelete } = require('../lib/deleteGate');
    const result = await handleDelete('collections', req.params.id, req.user, req.body?.reason);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
