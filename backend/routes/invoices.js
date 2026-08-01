const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, monthRange, irnHex, round2 } = require('../lib/helpers');
const { genLeaseInvoices } = require('../lib/billing');
const router = express.Router();

function mapInvoice(r, paid) {
  const total = Number(r.Total);
  const p = Number(paid) || 0;
  let status = 'Unpaid';
  if (p <= 0) status = 'Unpaid';
  else if (p + 0.5 >= total) status = 'Paid';
  else status = 'Partial';
  return {
    id: r.Id, no: r.No, type: r.Type, leaseId: r.LeaseId, brandId: r.BrandId, unitId: r.UnitId, ym: r.Ym,
    desc: r.Descr, amount: Number(r.Amount), gstPct: Number(r.GstPct), gstAmt: Number(r.GstAmt), total,
    dueDate: r.DueDate.toISOString().slice(0, 10), irn: r.Irn, paid: p, balance: round2(total - p), status
  };
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT i.*, ISNULL(c.paid,0) AS Paid FROM ${SCHEMA}.Invoices i
      OUTER APPLY (SELECT SUM(Amount) AS paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c
      ORDER BY i.DueDate DESC`);
    res.json(result.recordset.map(r => mapInvoice(r, r.Paid)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Auto-generate MG/RevShare/CAM/Utility invoices for a month, across all active (non-hold) leases or one lease
router.post('/generate', async (req, res) => {
  try {
    const pool = await getPool();
    const { ym, scope } = req.body; // scope: 'all' | leaseId
    let leases;
    if (scope === 'all') {
      const r = await pool.request().query(`SELECT Id FROM ${SCHEMA}.Leases WHERE Status='Active' AND OnHold=0`);
      leases = r.recordset.map(x => x.Id);
    } else {
      const r = await pool.request().input('id', sql.VarChar(40), scope).query(`SELECT Id FROM ${SCHEMA}.Leases WHERE Id=@id AND OnHold=0`);
      leases = r.recordset.map(x => x.Id);
    }
    let count = 0;
    for (const leaseId of leases) count += await genLeaseInvoices(pool, leaseId, ym);
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ad-hoc manual invoice
router.post('/adhoc', async (req, res) => {
  try {
    const pool = await getPool();
    const { leaseId, ym, desc, amount, gstPct } = req.body;
    if (!amount) return res.status(400).json({ error: 'Enter ad-hoc amount.' });
    const leaseRow = await pool.request().input('id', sql.VarChar(40), leaseId).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    const lease = leaseRow.recordset[0];
    if (!lease) return res.status(400).json({ error: 'Lease not found' });
    const gstAmt = round2(amount * (gstPct || 0) / 100);
    const total = round2(Number(amount) + gstAmt);
    const id = uid();
    const no = await nextNo(pool, sql, 'INV');
    const { s: due } = monthRange(ym);
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('type', sql.VarChar(20), 'Adhoc')
      .input('leaseId', sql.VarChar(40), leaseId).input('brandId', sql.VarChar(40), lease.BrandId).input('unitId', sql.VarChar(40), lease.UnitId)
      .input('ym', sql.Char(7), ym).input('desc', sql.NVarChar(300), desc || 'Ad-hoc charge').input('amount', sql.Decimal(18, 2), amount)
      .input('gstPct', sql.Decimal(9, 3), gstPct || 0).input('gstAmt', sql.Decimal(18, 2), gstAmt).input('total', sql.Decimal(18, 2), total)
      .input('due', sql.Date, due).input('irn', sql.VarChar(64), irnHex())
      .query(`INSERT INTO ${SCHEMA}.Invoices (Id,No,Type,LeaseId,BrandId,UnitId,Ym,Descr,Amount,GstPct,GstAmt,Total,DueDate,Irn,Status)
        VALUES (@id,@no,@type,@leaseId,@brandId,@unitId,@ym,@desc,@amount,@gstPct,@gstAmt,@total,@due,@irn,'Unpaid')`);
    res.json({ id, no });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { handleDelete } = require('../lib/deleteGate');
    const result = await handleDelete('invoices', req.params.id, req.user, req.body?.reason);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
