const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, addM, iso } = require('../lib/helpers');
const { LEASE_FIELDS, sqlType, coerce, mapExtra } = require('../lib/leaseFields');
const router = express.Router();

function mgAmount(l, unit) {
  return l.mgBasis === 'PerSqFt' ? (Number(l.mg) || 0) * (Number(unit.BuiltupArea) || 0) : (Number(l.mg) || 0);
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.Leases ORDER BY Code`);
    res.json(result.recordset.map(mapLease));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function mapLease(r) {
  return {
    id: r.Id, code: r.Code, brandId: r.BrandId, unitId: r.UnitId, assetId: r.AssetId,
    startDate: iso(new Date(r.StartDate)), endDate: iso(new Date(r.EndDate)),
    rentalType: r.RentalType, mgBasis: r.MgBasis, mg: Number(r.Mg), revSharePct: Number(r.RevSharePct),
    cam: Number(r.Cam), utility: Number(r.Utility), esc: Number(r.Esc), deposit: Number(r.Deposit),
    gst: Number(r.Gst), onHold: !!r.OnHold, holdRemarks: r.HoldRemarks, status: r.Status,
    alertsEnabled: r.AlertsEnabled == null ? true : !!r.AlertsEnabled,
    ...mapExtra(r)
  };
}

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const b = req.body;
    if (typeof b.igstApplicable === 'string') b.igstApplicable = b.igstApplicable === 'Yes' ? 1 : 0;
    const unitRow = await pool.request().input('id', sql.VarChar(40), b.unitId).query(`SELECT * FROM ${SCHEMA}.Units WHERE Id=@id`);
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

    // rich fields (dynamic)
    const extraCols = [], extraVals = [];
    for (const f of LEASE_FIELDS) {
      const [key, col] = f;
      const pname = 'x_' + col;
      request.input(pname, sqlType(f), coerce(f, b[key]));
      extraCols.push(col);
      extraVals.push('@' + pname);
    }
    const colList = 'Id,Code,BrandId,UnitId,AssetId,StartDate,EndDate,RentalType,MgBasis,Mg,RevSharePct,Cam,Utility,Esc,Deposit,Gst,OnHold,Status' + (extraCols.length ? ',' + extraCols.join(',') : '');
    const valList = "@id,@code,@brandId,@unitId,@assetId,@start,@end,@rentalType,@mgBasis,@mg,@revSharePct,@cam,@utility,@esc,@deposit,@gst,0,'Active'" + (extraVals.length ? ',' + extraVals.join(',') : '');
    await request.query(`INSERT INTO ${SCHEMA}.Leases (${colList}) VALUES (${valList})`);

    await pool.request().input('id', sql.VarChar(40), b.unitId).query(`UPDATE ${SCHEMA}.Units SET Status='Leased' WHERE Id=@id`);

    const row = await pool.request().input('id', sql.VarChar(40), id).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    res.json(mapLease(row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const b = req.body;
    if (typeof b.igstApplicable === 'string') b.igstApplicable = b.igstApplicable === 'Yes' ? 1 : 0;
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

    // rich fields: only update keys actually present in the payload
    const extraSets = [];
    for (const f of LEASE_FIELDS) {
      const [key, col] = f;
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        const pname = 'x_' + col;
        request.input(pname, sqlType(f), coerce(f, b[key]));
        extraSets.push(`${col}=@${pname}`);
      }
    }
    const baseSets = `BrandId=@brandId, StartDate=@start, RentalType=@rentalType, MgBasis=@mgBasis,
      Mg=@mg, RevSharePct=@revSharePct, Cam=@cam, Utility=@utility, Esc=@esc, Deposit=@deposit, Gst=@gst`;
    const setClause = baseSets + (extraSets.length ? ', ' + extraSets.join(', ') : '');
    await request.query(`UPDATE ${SCHEMA}.Leases SET ${setClause} WHERE Id=@id`);
    const row = await pool.request().input('id', sql.VarChar(40), req.params.id).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    res.json(mapLease(row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/hold', async (req, res) => {
  try {
    const pool = await getPool();
    const { remarks } = req.body;
    if (!remarks || !remarks.trim()) return res.status(400).json({ error: 'Remarks are mandatory for hold.' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('r', sql.NVarChar(400), remarks)
      .query(`UPDATE ${SCHEMA}.Leases SET OnHold=1, HoldRemarks=@r WHERE Id=@id`);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('ref', sql.NVarChar(100), req.params.id)
      .query(`INSERT INTO ${SCHEMA}.ChangeLog (Id, LogDate, Type, Ref, Detail, ByUser) VALUES (NEWID(), CAST(GETDATE() AS DATE), 'Lease hold', @ref, @ref, 'System')`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/release', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`UPDATE ${SCHEMA}.Leases SET OnHold=0, HoldRemarks='' WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { handleDelete } = require('../lib/deleteGate');
    const result = await handleDelete('leases', req.params.id, req.user, req.body?.reason);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Toggle billing/payment alerts for a lease */
router.post('/:id/alerts', async (req, res) => {
  try {
    const pool = await getPool();
    const enabled = req.body && req.body.enabled ? 1 : 0;
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('en', sql.Bit, enabled)
      .query(`UPDATE ${SCHEMA}.Leases SET AlertsEnabled=@en WHERE Id=@id`);
    res.json({ id: req.params.id, alertsEnabled: !!enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
