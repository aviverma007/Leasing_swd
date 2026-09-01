const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, monthRange, irnHex, round2 } = require('../lib/helpers');
const { genLeaseInvoices, gstSplit } = require('../lib/billing');
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
    desc: r.Descr, amount: Number(r.Amount), gstPct: Number(r.GstPct), gstAmt: Number(r.GstAmt),
    cgstAmt: Number(r.CgstAmt || 0), sgstAmt: Number(r.SgstAmt || 0), igstAmt: Number(r.IgstAmt || 0),
    hsnCode: r.HsnCode || '997212', paymentTermsDays: r.PaymentTermsDays || 7,
    ackNo: r.AckNo || null, ackDate: r.AckDate ? new Date(r.AckDate).toISOString() : null, placeOfSupply: r.PlaceOfSupply || 'HARYANA',
    total, dueDate: r.DueDate.toISOString().slice(0, 10), irn: r.Irn, paid: p,
    balance: round2(total - p), status, poolGroupId: r.PoolGroupId || null
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

/* Fetch full invoice context (for printing) — includes landlord + tenant details */
router.get('/:id/print', async (req, res) => {
  try {
    const pool = await getPool();
    const invRow = await pool.request().input('id', sql.VarChar(40), req.params.id).query(`
      SELECT i.*, ISNULL(c.paid,0) AS Paid FROM ${SCHEMA}.Invoices i
      OUTER APPLY (SELECT SUM(Amount) AS paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c
      WHERE i.Id=@id`);
    if (!invRow.recordset.length) return res.status(404).json({ error: 'Invoice not found' });
    const inv = invRow.recordset[0];

    const leaseRow = await pool.request().input('id', sql.VarChar(40), inv.LeaseId).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    const lease = leaseRow.recordset[0];
    const unitRow = await pool.request().input('id', sql.VarChar(40), inv.UnitId).query(`SELECT * FROM ${SCHEMA}.Units WHERE Id=@id`);
    const unit = unitRow.recordset[0];
    const assetRow = unit ? await pool.request().input('id', sql.VarChar(40), unit.AssetId).query(`SELECT * FROM ${SCHEMA}.Assets WHERE Id=@id`) : null;
    const asset = assetRow ? assetRow.recordset[0] : null;
    const brandRow = await pool.request().input('id', sql.VarChar(40), inv.BrandId).query(`SELECT * FROM ${SCHEMA}.Brands WHERE Id=@id`);
    const brand = brandRow.recordset[0];
    const compRow = brand ? await pool.request().input('id', sql.VarChar(40), brand.CompanyId).query(`SELECT * FROM ${SCHEMA}.Companies WHERE Id=@id`) : null;
    const company = compRow ? compRow.recordset[0] : null;

    res.json({
      invoice: mapInvoice(inv, inv.Paid),
      landlord: {
        name: lease?.LessorName || asset?.LandlordName || asset?.Name,
        address: lease?.LessorAddress || asset?.LandlordAddress,
        gstin: lease?.LessorGstin || asset?.Gstin,
        pan: lease?.LessorPan || asset?.PanNo,
        bank: asset ? { name: asset.BankName, branch: asset.BankBranch, acc: asset.BankAcc, ifsc: asset.BankIfsc, micr: asset.BankMicr } : {}
      },
      tenant: {
        brandName: brand?.Name,
        companyName: lease?.LesseeName || company?.Name,
        address: lease?.LesseeAddress || brand?.Address || brand?.RegularAddress,
        gstin: lease?.LesseeGstin || company?.Gstin,
        pan: lease?.LesseePan || company?.PanNo
      },
      unit: unit ? { name: unit.Name, floor: unit.Floor, carpetArea: unit.CarpetArea, builtupArea: unit.BuiltupArea } : null,
      asset: asset ? { name: asset.Name, city: asset.City } : null,
      lease: lease ? { startDate: lease.StartDate, endDate: lease.EndDate, hsnCode: lease.HsnCode, paymentTermsDays: lease.PaymentTermsDays } : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* SD adjustment against an invoice */
router.post('/:id/sd-adjust', async (req, res) => {
  try {
    const pool = await getPool();
    const { sdAdjAmt, note } = req.body;
    if (!sdAdjAmt || Number(sdAdjAmt) <= 0) return res.status(400).json({ error: 'Enter a valid SD adjustment amount.' });
    const invRow = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT i.*, ISNULL(c.paid,0) AS Paid FROM ${SCHEMA}.Invoices i OUTER APPLY (SELECT SUM(Amount) AS paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c WHERE i.Id=@id`);
    const inv = invRow.recordset[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const balance = round2(Number(inv.Total) - Number(inv.Paid));
    const adjAmt = Math.min(Number(sdAdjAmt), balance);
    if (adjAmt <= 0) return res.status(400).json({ error: 'Invoice is already fully settled.' });
    const id = uid();
    const no = await nextNo(pool, sql, 'RCT');
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no)
      .input('invoiceId', sql.VarChar(40), req.params.id)
      .input('collDate', sql.Date, new Date().toISOString().slice(0, 10))
      .input('amount', sql.Decimal(18, 2), adjAmt)
      .input('sdAdjAmt', sql.Decimal(18, 2), adjAmt)
      .input('sdNote', sql.NVarChar(300), note || 'Security deposit adjustment')
      .input('instrument', sql.VarChar(20), 'SD-Adjust')
      .query(`INSERT INTO ${SCHEMA}.Collections (Id,No,InvoiceId,CollDate,Amount,SdAdjAmt,SdNote,Instrument,TdsPct,Tds)
        VALUES (@id,@no,@invoiceId,@collDate,@amount,@sdAdjAmt,@sdNote,@instrument,0,0)`);
    res.json({ id, no, adjAmt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Auto-generate MG/RevShare/CAM/Utility invoices for a month */
router.post('/generate', async (req, res) => {
  try {
    const pool = await getPool();
    const { ym, scope } = req.body;
    let leases;
    if (scope === 'all') {
      const r = await pool.request().query(`SELECT Id FROM ${SCHEMA}.Leases WHERE UPPER(LTRIM(RTRIM(Status)))='ACTIVE' AND ISNULL(OnHold,0)=0`);
      leases = r.recordset.map(x => x.Id);
    } else {
      const r = await pool.request().input('id', sql.VarChar(40), scope).query(`SELECT Id FROM ${SCHEMA}.Leases WHERE Id=@id AND ISNULL(OnHold,0)=0`);
      leases = r.recordset.map(x => x.Id);
    }
    let count = 0;
    const debug = { scanned: leases.length, ym, results: [] };
    for (const leaseId of leases) {
      try {
        const n = await genLeaseInvoices(pool, leaseId, ym);
        count += n;
        debug.results.push({ leaseId, generated: n });
      } catch (le) {
        debug.results.push({ leaseId, error: le.message });
      }
    }
    console.log('[generate]', JSON.stringify(debug));
    const errors = debug.results.filter(r => r.error);
    let reason = null;
    if (count === 0 && scope !== 'all' && leases.length === 1 && !errors.length) {
      // Explain exactly why this single lease produced nothing
      const lr = await pool.request().input('id', sql.VarChar(40), leases[0]).input('ym', sql.Char(7), ym)
        .query(`SELECT l.Code, l.RentalType, l.Mg, l.MgBasis, l.Cam, l.Utility, u.BuiltupArea,
          (SELECT COUNT(*) FROM ${SCHEMA}.Invoices i WHERE i.LeaseId=l.Id AND i.Ym=@ym AND i.Type='MG') AS MgBilled
          FROM ${SCHEMA}.Leases l JOIN ${SCHEMA}.Units u ON u.Id=l.UnitId WHERE l.Id=@id`)
        .catch(() => null);
      const row = lr && lr.recordset[0];
      if (row) {
        const computedMg = row.MgBasis === 'PerSqFt' ? Number(row.Mg) * Number(row.BuiltupArea || 0) : Number(row.Mg);
        if (row.MgBilled > 0) reason = `${row.Code}: ${ym} is already billed for this lease.`;
        else if (['MG', 'MGvsRS'].includes(row.RentalType) && computedMg <= 0) reason = `${row.Code}: MG rate is 0 — set the MG value on the lease first.`;
        else if (!['MG', 'MGvsRS'].includes(row.RentalType)) reason = `${row.Code}: ${row.RentalType} lease — bills only after sales are entered for ${ym}.`;
        else reason = `${row.Code}: nothing billable for ${ym}.`;
      }
    }
    res.json({ count, scanned: debug.scanned, errors: errors.slice(0, 3), reason });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Pool billing — generate a single grouped invoice for multiple leases */
router.post('/generate-pool', async (req, res) => {
  try {
    const pool = await getPool();
    const { ym, leaseIds, desc } = req.body;
    if (!leaseIds || !leaseIds.length) return res.status(400).json({ error: 'Provide at least one lease ID.' });
    const poolGroupId = uid();
    let count = 0;
    for (const leaseId of leaseIds) {
      const n = await genLeaseInvoices(pool, leaseId, ym);
      if (n > 0) {
        await pool.request().input('grp', sql.VarChar(40), poolGroupId).input('lid', sql.VarChar(40), leaseId).input('ym', sql.Char(7), ym)
          .query(`UPDATE ${SCHEMA}.Invoices SET PoolGroupId=@grp WHERE LeaseId=@lid AND Ym=@ym`);
      }
      count += n;
    }
    res.json({ count, poolGroupId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Ad-hoc manual invoice */
router.post('/adhoc', async (req, res) => {
  try {
    const pool = await getPool();
    const { leaseId, ym, desc, amount, gstPct } = req.body;
    if (!amount) return res.status(400).json({ error: 'Enter ad-hoc amount.' });
    const leaseRow = await pool.request().input('id', sql.VarChar(40), leaseId).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    const lease = leaseRow.recordset[0];
    if (!lease) return res.status(400).json({ error: 'Lease not found' });
    const igst = lease.IgstApplicable === true || lease.IgstApplicable === 1;
    const { gstAmt, cgstAmt, sgstAmt, igstAmt } = gstSplit(amount, gstPct || 0, igst);
    const total = round2(Number(amount) + gstAmt);
    const id = uid();
    const no = await nextNo(pool, sql, 'INV');
    const { s: due } = monthRange(ym);
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('type', sql.VarChar(20), 'Adhoc')
      .input('leaseId', sql.VarChar(40), leaseId).input('brandId', sql.VarChar(40), lease.BrandId).input('unitId', sql.VarChar(40), lease.UnitId)
      .input('ym', sql.Char(7), ym).input('desc', sql.NVarChar(300), desc || 'Ad-hoc charge').input('amount', sql.Decimal(18, 2), amount)
      .input('gstPct', sql.Decimal(9, 3), gstPct || 0).input('gstAmt', sql.Decimal(18, 2), gstAmt)
      .input('cgstAmt', sql.Decimal(18, 2), cgstAmt).input('sgstAmt', sql.Decimal(18, 2), sgstAmt).input('igstAmt', sql.Decimal(18, 2), igstAmt)
      .input('total', sql.Decimal(18, 2), total).input('due', sql.Date, due).input('irn', sql.VarChar(64), irnHex())
      .input('hsnCode', sql.VarChar(20), lease.HsnCode || '997212').input('paymentTermsDays', sql.Int, lease.PaymentTermsDays || 7)
      .input('ackNo', sql.VarChar(20), String(Math.floor(1e11 + Math.random() * 9e11)))
      .input('ackDate', sql.DateTime2, new Date())
      .input('pos', sql.NVarChar(60), 'HARYANA')
      .query(`INSERT INTO ${SCHEMA}.Invoices (Id,No,Type,LeaseId,BrandId,UnitId,Ym,Descr,Amount,GstPct,GstAmt,CgstAmt,SgstAmt,IgstAmt,Total,DueDate,Irn,Status,HsnCode,PaymentTermsDays,AckNo,AckDate,PlaceOfSupply)
        VALUES (@id,@no,@type,@leaseId,@brandId,@unitId,@ym,@desc,@amount,@gstPct,@gstAmt,@cgstAmt,@sgstAmt,@igstAmt,@total,@due,@irn,'Unpaid',@hsnCode,@paymentTermsDays,@ackNo,@ackDate,@pos)`);
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
