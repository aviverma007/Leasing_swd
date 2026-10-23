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
    lifecycleStage: r.LifecycleStage || 'Active',
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

/* Lease lifecycle stage — stage-wise pipeline with an audit log */
const STAGES = ['Enquiry', 'LOI', 'NFA Approval', 'Agreement', 'Fitout', 'Handover', 'Active', 'Expired', 'Renewed', 'Exited'];
router.post('/:id/stage', async (req, res) => {
  try {
    const pool = await getPool();
    const { stage, remarks } = req.body;
    if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage. Allowed: ' + STAGES.join(', ') });
    const cur = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT LifecycleStage FROM ${SCHEMA}.Leases WHERE Id=@id`);
    if (!cur.recordset.length) return res.status(404).json({ error: 'Lease not found' });
    const from = cur.recordset[0].LifecycleStage || 'Active';
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('st', sql.VarChar(30), stage)
      .query(`UPDATE ${SCHEMA}.Leases SET LifecycleStage=@st WHERE Id=@id`);
    await pool.request()
      .input('lid', sql.VarChar(40), uid()).input('l', sql.VarChar(40), req.params.id)
      .input('f', sql.VarChar(30), from).input('t', sql.VarChar(30), stage)
      .input('by', sql.NVarChar(150), req.user ? (req.user.email || req.user.username || 'system') : 'system')
      .input('rm', sql.NVarChar(400), (remarks || '').slice(0, 400))
      .query(`INSERT INTO ${SCHEMA}.LeaseStageLog (Id,LeaseId,FromStage,ToStage,ChangedBy,Remarks) VALUES (@lid,@l,@f,@t,@by,@rm)`);
    res.json({ id: req.params.id, lifecycleStage: stage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/stage-log', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('l', sql.VarChar(40), req.params.id)
      .query(`SELECT * FROM ${SCHEMA}.LeaseStageLog WHERE LeaseId=@l ORDER BY ChangedAt DESC`);
    res.json(r.recordset.map(x => ({ from: x.FromStage, to: x.ToStage, by: x.ChangedBy, remarks: x.Remarks, at: new Date(x.ChangedAt).toISOString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Exit / SD-refund settlement ──
   Computes outstanding (net of receipts & credit notes), applies deductions,
   records the settlement, marks the lease Exited and frees the unit. */
router.post('/:id/exit', async (req, res) => {
  try {
    const pool = await getPool();
    const { exitDate, deductions, remarks } = req.body;
    const lr = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    const lease = lr.recordset[0];
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if ((lease.LifecycleStage || 'Active') === 'Exited') return res.status(400).json({ error: 'Lease is already exited.' });

    const or_ = await pool.request().input('l', sql.VarChar(40), req.params.id).query(`
      SELECT ISNULL(SUM(i.Total),0) - ISNULL(SUM(p.paid),0) - ISNULL(SUM(cn.credited),0) AS outstanding
      FROM ${SCHEMA}.Invoices i
      OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) p
      OUTER APPLY (SELECT SUM(CASE WHEN NoteType='Credit' THEN Total ELSE -Total END) credited FROM ${SCHEMA}.CreditNotes WHERE InvoiceId=i.Id) cn
      WHERE i.LeaseId=@l`);
    const outstanding = Math.round((Number(or_.recordset[0].outstanding) || 0) * 100) / 100;
    const sdHeld = Number(lease.Deposit) || 0;
    const dedList = Array.isArray(deductions) ? deductions
      .map(d => ({ label: String(d.label || '').slice(0, 120), amount: Math.round((Number(d.amount) || 0) * 100) / 100 }))
      .filter(d => d.amount > 0) : [];
    const totalDed = Math.round(dedList.reduce((s2, d) => s2 + d.amount, 0) * 100) / 100;
    const netRefund = Math.round((sdHeld - outstanding - totalDed) * 100) / 100;
    const by = req.user ? (req.user.email || req.user.username || 'system') : 'system';
    const xd = exitDate || new Date().toISOString().slice(0, 10);

    const sid = uid();
    await pool.request()
      .input('id', sql.VarChar(40), sid).input('l', sql.VarChar(40), req.params.id)
      .input('xd', sql.Date, xd).input('sd', sql.Decimal(18, 2), sdHeld)
      .input('out', sql.Decimal(18, 2), outstanding)
      .input('dj', sql.NVarChar(sql.MAX), JSON.stringify(dedList))
      .input('td', sql.Decimal(18, 2), totalDed).input('nr', sql.Decimal(18, 2), netRefund)
      .input('rm', sql.NVarChar(500), (remarks || '').slice(0, 500)).input('by', sql.NVarChar(150), by)
      .query(`INSERT INTO ${SCHEMA}.LeaseSettlements (Id,LeaseId,ExitDate,SdHeld,Outstanding,DeductionsJson,TotalDeductions,NetRefund,Remarks,CreatedBy)
              VALUES (@id,@l,@xd,@sd,@out,@dj,@td,@nr,@rm,@by)`);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('xd', sql.Date, xd)
      .query(`UPDATE ${SCHEMA}.Leases SET LifecycleStage='Exited', Status='Closed', OnHold=0, ExitDate=@xd WHERE Id=@id`);
    await pool.request().input('u', sql.VarChar(40), lease.UnitId)
      .query(`UPDATE ${SCHEMA}.Units SET Status='Vacant' WHERE Id=@u`);
    await pool.request()
      .input('lid', sql.VarChar(40), uid()).input('l', sql.VarChar(40), req.params.id)
      .input('f', sql.VarChar(30), lease.LifecycleStage || 'Active').input('t', sql.VarChar(30), 'Exited')
      .input('by', sql.NVarChar(150), by).input('rm', sql.NVarChar(400), `Exit settlement: SD ${sdHeld} − dues ${outstanding} − deductions ${totalDed} = refund ${netRefund}`)
      .query(`INSERT INTO ${SCHEMA}.LeaseStageLog (Id,LeaseId,FromStage,ToStage,ChangedBy,Remarks) VALUES (@lid,@l,@f,@t,@by,@rm)`);
    res.json({ settlementId: sid, sdHeld, outstanding, totalDeductions: totalDed, netRefund });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/settlement', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('l', sql.VarChar(40), req.params.id)
      .query(`SELECT TOP 1 * FROM ${SCHEMA}.LeaseSettlements WHERE LeaseId=@l ORDER BY CreatedAt DESC`);
    if (!r.recordset.length) return res.json(null);
    const x = r.recordset[0];
    res.json({
      exitDate: x.ExitDate.toISOString().slice(0, 10), sdHeld: Number(x.SdHeld), outstanding: Number(x.Outstanding),
      deductions: JSON.parse(x.DeductionsJson || '[]'), totalDeductions: Number(x.TotalDeductions),
      netRefund: Number(x.NetRefund), remarks: x.Remarks, by: x.CreatedBy
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Renewal: clone the lease with new term & rent, link and close the old one ── */
router.post('/:id/renew', async (req, res) => {
  try {
    const pool = await getPool();
    const { startDate, months, mg } = req.body;
    if (!startDate || !months || Number(months) <= 0) return res.status(400).json({ error: 'Start date and term (months) are required.' });
    const lr = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
    const old = lr.recordset[0];
    if (!old) return res.status(404).json({ error: 'Lease not found' });
    if (old.RenewedToId) return res.status(400).json({ error: 'This lease has already been renewed.' });

    const newId = uid();
    const newCode = await nextNo(pool, sql, 'LSE');
    const endExclusive = addM(startDate, Number(months));
    const endDate = iso(new Date(new Date(endExclusive + 'T00:00:00Z').getTime() - 86400000));
    const newMg = mg != null && mg !== '' ? Number(mg) : Number(old.Mg);

    // copy every column except the ones we explicitly set
    const colsR = await pool.request().query(`
      SELECT c.name FROM sys.columns c
      JOIN sys.tables t ON t.object_id=c.object_id
      JOIN sys.schemas sc ON sc.schema_id=t.schema_id
      WHERE sc.name='${SCHEMA}' AND t.name='Leases'`);
    const skip = new Set(['Id', 'Code', 'StartDate', 'EndDate', 'Mg', 'LifecycleStage', 'RenewedToId', 'ExitDate', 'OnHold', 'HoldRemarks', 'Status']);
    const copyCols = colsR.recordset.map(c => c.name).filter(n => !skip.has(n));
    const colList = copyCols.map(c => `[${c}]`).join(',');

    await pool.request()
      .input('nid', sql.VarChar(40), newId).input('nc', sql.VarChar(20), newCode)
      .input('s', sql.Date, startDate).input('e', sql.Date, endDate)
      .input('mg', sql.Decimal(18, 2), newMg).input('oid', sql.VarChar(40), req.params.id)
      .query(`INSERT INTO ${SCHEMA}.Leases (Id,Code,StartDate,EndDate,Mg,LifecycleStage,RenewedToId,ExitDate,OnHold,HoldRemarks,Status,${colList})
              SELECT @nid,@nc,@s,@e,@mg,'Active',NULL,NULL,0,NULL,'Active',${colList}
              FROM ${SCHEMA}.Leases WHERE Id=@oid`);
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('nid', sql.VarChar(40), newId)
      .query(`UPDATE ${SCHEMA}.Leases SET LifecycleStage='Renewed', Status='Closed', RenewedToId=@nid WHERE Id=@id`);
    const by = req.user ? (req.user.email || req.user.username || 'system') : 'system';
    await pool.request()
      .input('lid', sql.VarChar(40), uid()).input('l', sql.VarChar(40), req.params.id)
      .input('f', sql.VarChar(30), old.LifecycleStage || 'Active').input('t', sql.VarChar(30), 'Renewed')
      .input('by', sql.NVarChar(150), by).input('rm', sql.NVarChar(400), `Renewed as ${newCode} from ${startDate} at MG ${newMg}`)
      .query(`INSERT INTO ${SCHEMA}.LeaseStageLog (Id,LeaseId,FromStage,ToStage,ChangedBy,Remarks) VALUES (@lid,@l,@f,@t,@by,@rm)`);
    res.json({ id: newId, code: newCode, startDate, endDate, mg: newMg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
