const express = require('express');
const { sql, getPool } = require('../db');
const { uid, nextNo, addM, iso } = require('../lib/helpers');
const router = express.Router();

function mgAmount(l, unit) {
  return l.mgBasis === 'PerSqFt' ? (Number(l.mg) || 0) * (Number(unit.CarpetArea) || 0) : (Number(l.mg) || 0);
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.Leases ORDER BY Code');
    res.json(result.recordset.map(mapLease));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function mapLease(r) {
  return {
    id: r.Id, code: r.Code, brandId: r.BrandId, unitId: r.UnitId, assetId: r.AssetId,
    startDate: iso(new Date(r.StartDate)), endDate: iso(new Date(r.EndDate)),
    rentalType: r.RentalType, mgBasis: r.MgBasis, mg: Number(r.Mg), revSharePct: Number(r.RevSharePct),
    cam: Number(r.Cam), utility: Number(r.Utility), esc: Number(r.Esc), deposit: Number(r.Deposit),
    gst: Number(r.Gst), onHold: !!r.OnHold, holdRemarks: r.HoldRemarks, status: r.Status
  };
}

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const b = req.body;
    const unitRow = await pool.request().input('id', sql.VarChar(40), b.unitId).query('SELECT * FROM dbo.Units WHERE Id=@id');
    const unit = unitRow.recordset[0];
    if (!unit) return res.status(400).json({ error: 'Unit not found' });

    const id = uid();
    const code = await nextNo(pool, sql, 'LSE');
    const start = b.startDate;
    const endExclusive = addM(start, Number(b.months) || 1);
    const endDate = iso(new Date(new Date(endExclusive + 'T00:00:00Z').getTime() - 86400000));

    const request = pool.request();
    request.input('id', sql.VarChar(40), id);
    request.input('code', sql.VarChar(20), code);
    request.input('brandId', sql.VarChar(40), b.brandId);
    request.input('unitId', sql.VarChar(40), b.unitId);
    request.input('assetId', sql.VarChar(40), unit.AssetId);
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, endDate);
    request.input('rentalType', sql.VarChar(20), b.rentalType);
    request.input('mgBasis', sql.VarChar(20), b.mgBasis);
    request.input('mg', sql.Decimal(18, 2), b.mg || 0);
    request.input('revSharePct', sql.Decimal(9, 3), b.revSharePct || 0);
    request.input('cam', sql.Decimal(18, 2), b.cam || 0);
    request.input('utility', sql.Decimal(18, 2), b.utility || 0);
    request.input('esc', sql.Decimal(9, 3), b.esc || 0);
    request.input('deposit', sql.Decimal(18, 2), b.deposit || 0);
    request.input('gst', sql.Decimal(9, 3), b.gst || 0);
    await request.query(`INSERT INTO dbo.Leases (Id,Code,BrandId,UnitId,AssetId,StartDate,EndDate,RentalType,MgBasis,Mg,RevSharePct,Cam,Utility,Esc,Deposit,Gst,OnHold,Status)
      VALUES (@id,@code,@brandId,@unitId,@assetId,@start,@end,@rentalType,@mgBasis,@mg,@revSharePct,@cam,@utility,@esc,@deposit,@gst,0,'Active')`);

    await pool.request().input('id', sql.VarChar(40), b.unitId).query(`UPDATE dbo.Units SET Status='Leased' WHERE Id=@id`);

    const row = await pool.request().input('id', sql.VarChar(40), id).query('SELECT * FROM dbo.Leases WHERE Id=@id');
    res.json(mapLease(row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const b = req.body;
    const request = pool.request();
    request.input('id', sql.VarChar(40), req.params.id);
    request.input('brandId', sql.VarChar(40), b.brandId);
    request.input('start', sql.Date, b.startDate);
    request.input('rentalType', sql.VarChar(20), b.rentalType);
    request.input('mgBasis', sql.VarChar(20), b.mgBasis);
    request.input('mg', sql.Decimal(18, 2), b.mg || 0);
    request.input('revSharePct', sql.Decimal(9, 3), b.revSharePct || 0);
    request.input('cam', sql.Decimal(18, 2), b.cam || 0);
    request.input('utility', sql.Decimal(18, 2), b.utility || 0);
    request.input('esc', sql.Decimal(9, 3), b.esc || 0);
    request.input('deposit', sql.Decimal(18, 2), b.deposit || 0);
    request.input('gst', sql.Decimal(9, 3), b.gst || 0);
    await request.query(`UPDATE dbo.Leases SET BrandId=@brandId, StartDate=@start, RentalType=@rentalType, MgBasis=@mgBasis,
      Mg=@mg, RevSharePct=@revSharePct, Cam=@cam, Utility=@utility, Esc=@esc, Deposit=@deposit, Gst=@gst WHERE Id=@id`);
    const row = await pool.request().input('id', sql.VarChar(40), req.params.id).query('SELECT * FROM dbo.Leases WHERE Id=@id');
    res.json(mapLease(row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/hold', async (req, res) => {
  try {
    const pool = await getPool();
    const { remarks } = req.body;
    if (!remarks || !remarks.trim()) return res.status(400).json({ error: 'Remarks are mandatory for hold.' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('r', sql.NVarChar(400), remarks)
      .query(`UPDATE dbo.Leases SET OnHold=1, HoldRemarks=@r WHERE Id=@id`);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('ref', sql.NVarChar(100), req.params.id)
      .query(`INSERT INTO dbo.ChangeLog (Id, LogDate, Type, Ref, Detail, ByUser) VALUES (NEWID(), CAST(GETDATE() AS DATE), 'Lease hold', @ref, @ref, 'System')`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/release', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`UPDATE dbo.Leases SET OnHold=0, HoldRemarks='' WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const paidCheck = await pool.request().input('id', sql.VarChar(40), req.params.id).query(`
      SELECT COUNT(*) cnt FROM dbo.Invoices i JOIN dbo.Collections c ON c.InvoiceId=i.Id WHERE i.LeaseId=@id`);
    if (paidCheck.recordset[0].cnt > 0) return res.status(400).json({ error: "Can't delete: collected invoices exist." });

    const leaseRow = await pool.request().input('id', sql.VarChar(40), req.params.id).query('SELECT * FROM dbo.Leases WHERE Id=@id');
    const lease = leaseRow.recordset[0];
    await pool.request().input('id', sql.VarChar(40), req.params.id).query('DELETE FROM dbo.Invoices WHERE LeaseId=@id');
    await pool.request().input('id', sql.VarChar(40), req.params.id).query('DELETE FROM dbo.Leases WHERE Id=@id');
    if (lease) {
      const other = await pool.request().input('u', sql.VarChar(40), lease.UnitId).query(
        `SELECT COUNT(*) cnt FROM dbo.Leases WHERE UnitId=@u AND Status='Active'`);
      if (other.recordset[0].cnt === 0) {
        await pool.request().input('u', sql.VarChar(40), lease.UnitId).query(`UPDATE dbo.Units SET Status='Vacant' WHERE Id=@u`);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
