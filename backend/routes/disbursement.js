const express = require('express');
const { sql, getPool } = require('../db');
const { uid, nextNo, iso, round2 } = require('../lib/helpers');
const { rentCollectedForUnit } = require('../lib/billing');
const router = express.Router();

// Candidates: approved investor units with rent collected in month, not yet disbursed (or already done)
router.get('/candidates', async (req, res) => {
  try {
    const pool = await getPool();
    const ym = req.query.ym;
    const ivResult = await pool.request().query(`SELECT * FROM dbo.InvestorUnits WHERE Status='Approved'`);
    const pending = [];
    const done = [];

    for (const iv of ivResult.recordset) {
      const investorsRes = await pool.request().input('iv', sql.VarChar(40), iv.Id).query(
        'SELECT * FROM dbo.InvestorUnitInvestors WHERE InvestorUnitId=@iv ORDER BY Idx');
      const unitRow = await pool.request().input('id', sql.VarChar(40), iv.UnitId).query('SELECT * FROM dbo.Units WHERE Id=@id');
      const unit = unitRow.recordset[0];
      const leaseRow = await pool.request().input('u', sql.VarChar(40), iv.UnitId).query(
        `SELECT TOP 1 * FROM dbo.Leases WHERE UnitId=@u AND Status='Active'`);
      const lease = leaseRow.recordset[0];
      const rentTotal = await rentCollectedForUnit(pool, iv.UnitId, ym);

      for (const inv of investorsRes.recordset) {
        const share = rentTotal * Number(inv.DisbursePct) / 100;
        const existingRow = await pool.request().input('iv', sql.VarChar(40), iv.Id).input('idx', sql.Int, inv.Idx).input('m', sql.Char(7), ym)
          .query(`SELECT * FROM dbo.Disbursals WHERE InvestorUnitId=@iv AND InvIdx=@idx AND Month=@m AND Status<>'Void'`);
        const existing = existingRow.recordset[0];

        if (existing) continue; // handled below in "done" via a separate query
        if (share <= 0) continue;

        let holdReason = '';
        if (lease && lease.OnHold) holdReason = 'Lease is on hold: ' + (lease.HoldRemarks || '');
        else if (inv.Gst === false && !inv.Nri) holdReason = 'Invoice not received from GST-registered investor';

        pending.push({
          investorUnitId: iv.Id, investorUnitCode: iv.Code, invIdx: inv.Idx, investorName: inv.Name,
          unitId: iv.UnitId, unitName: unit ? unit.Name : '', disbursePct: Number(inv.DisbursePct),
          rentShare: round2(share), nri: !!inv.Nri, holdReason
        });
      }
    }

    const doneRes = await pool.request().input('m', sql.Char(7), ym).query('SELECT * FROM dbo.Disbursals WHERE Month=@m ORDER BY No DESC');
    for (const d of doneRes.recordset) {
      done.push(mapDisbursal(d));
    }

    res.json({ pending, done });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function mapDisbursal(d) {
  let deductions = {};
  try { deductions = JSON.parse(d.DeductionsJson || '{}'); } catch (e) {}
  return {
    id: d.Id, no: d.No, month: d.Month, investorUnitId: d.InvestorUnitId, invIdx: d.InvIdx,
    investorName: d.InvestorName, unitId: d.UnitId, brandId: d.BrandId, rentGross: Number(d.RentGross),
    deductions, totalDeductions: Number(d.TotalDeductions), tdsPct: Number(d.TdsPct), tdsAmt: Number(d.TdsAmt),
    outstanding: Number(d.Outstanding), netPayable: Number(d.NetPayable), mode: d.Mode, ref: d.Ref,
    bank: d.Bank, acc: d.Acc, ifsc: d.Ifsc, nri: !!d.Nri, narration: d.Narration, status: d.Status,
    maker: d.Maker, checker: d.Checker, remarks: d.Remarks, createdAt: iso(new Date(d.CreatedAt))
  };
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.Disbursals ORDER BY No DESC');
    res.json(result.recordset.map(mapDisbursal));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/process', async (req, res) => {
  try {
    const pool = await getPool();
    const { investorUnitId, invIdx, month, rentGross, deductions, tdsPct, outstanding, mode, ref, narration, remarks, actingRole } = req.body;

    const ivRow = await pool.request().input('id', sql.VarChar(40), investorUnitId).query('SELECT * FROM dbo.InvestorUnits WHERE Id=@id');
    const iv = ivRow.recordset[0];
    if (!iv) return res.status(400).json({ error: 'Investor unit not found' });
    const invRow = await pool.request().input('iv', sql.VarChar(40), investorUnitId).input('idx', sql.Int, invIdx)
      .query('SELECT * FROM dbo.InvestorUnitInvestors WHERE InvestorUnitId=@iv AND Idx=@idx');
    const inv = invRow.recordset[0];
    const leaseRow = await pool.request().input('u', sql.VarChar(40), iv.UnitId).query(
      `SELECT TOP 1 * FROM dbo.Leases WHERE UnitId=@u AND Status='Active'`);
    const lease = leaseRow.recordset[0];

    const dedTotal = Object.values(deductions || {}).reduce((s, x) => s + (Number(x) || 0), 0);
    const tds = round2(Number(rentGross) * Number(tdsPct || 0) / 100);
    const out = Number(outstanding) || 0;
    const net = round2(Number(rentGross) - dedTotal - tds - out);
    if (net < 0) return res.status(400).json({ error: 'Net payable is negative — check deductions.' });

    const canApprove = ['Finance Head', 'Center/Portfolio Head'].includes(actingRole);
    const id = uid();
    const no = await nextNo(pool, sql, 'DIS');
    await pool.request()
      .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('month', sql.Char(7), month)
      .input('ivId', sql.VarChar(40), investorUnitId).input('idx', sql.Int, invIdx).input('name', sql.NVarChar(200), inv.Name)
      .input('unitId', sql.VarChar(40), iv.UnitId).input('brandId', sql.VarChar(40), lease ? lease.BrandId : null)
      .input('rentGross', sql.Decimal(18, 2), rentGross).input('dedJson', sql.NVarChar(sql.MAX), JSON.stringify(deductions || {}))
      .input('dedTotal', sql.Decimal(18, 2), dedTotal).input('tdsPct', sql.Decimal(9, 3), tdsPct || 0).input('tds', sql.Decimal(18, 2), tds)
      .input('out', sql.Decimal(18, 2), out).input('net', sql.Decimal(18, 2), net).input('mode', sql.VarChar(20), mode)
      .input('ref', sql.NVarChar(100), ref || '').input('bank', sql.NVarChar(150), inv.BankName).input('acc', sql.NVarChar(60), inv.Acc)
      .input('ifsc', sql.NVarChar(20), inv.Ifsc).input('nri', sql.Bit, inv.Nri ? 1 : 0).input('narr', sql.NVarChar(300), narration || '')
      .input('status', sql.VarChar(20), canApprove ? 'Processed' : 'Pending').input('maker', sql.NVarChar(100), actingRole || '')
      .input('checker', sql.NVarChar(100), canApprove ? actingRole : '').input('rem', sql.NVarChar(400), remarks || '')
      .input('created', sql.Date, iso(new Date()))
      .query(`INSERT INTO dbo.Disbursals (Id,No,Month,InvestorUnitId,InvIdx,InvestorName,UnitId,BrandId,RentGross,DeductionsJson,
        TotalDeductions,TdsPct,TdsAmt,Outstanding,NetPayable,Mode,Ref,Bank,Acc,Ifsc,Nri,Narration,Status,Maker,Checker,Remarks,CreatedAt)
        VALUES (@id,@no,@month,@ivId,@idx,@name,@unitId,@brandId,@rentGross,@dedJson,@dedTotal,@tdsPct,@tds,@out,@net,@mode,@ref,
        @bank,@acc,@ifsc,@nri,@narr,@status,@maker,@checker,@rem,@created)`);

    res.json({ id, no, status: canApprove ? 'Processed' : 'Pending', netPayable: net });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const pool = await getPool();
    const { actingRole } = req.body;
    if (!['Finance Head', 'Center/Portfolio Head'].includes(actingRole)) return res.status(403).json({ error: 'Only Finance/Portfolio Head can approve.' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('checker', sql.NVarChar(100), actingRole)
      .query(`UPDATE dbo.Disbursals SET Status='Processed', Checker=@checker WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/void', async (req, res) => {
  try {
    const pool = await getPool();
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required.' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('rem', sql.NVarChar(400), reason)
      .query(`UPDATE dbo.Disbursals SET Status='Void', Remarks=@rem WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
