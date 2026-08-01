const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, iso } = require('../lib/helpers');
const router = express.Router();

async function mapInvestorUnit(pool, r) {
  const invRows = await pool.request().input('iv', sql.VarChar(40), r.Id).query(
    `SELECT * FROM ${SCHEMA}.InvestorUnitInvestors WHERE InvestorUnitId=@iv ORDER BY Idx`);
  return {
    id: r.Id, code: r.Code, unitId: r.UnitId, floor: r.Floor, status: r.Status,
    maker: r.Maker, checker: r.Checker, remarks: r.Remarks, createdAt: iso(new Date(r.CreatedAt)),
    investors: invRows.recordset.map(x => ({
      name: x.Name, areaPct: Number(x.AreaPct), disbursePct: Number(x.DisbursePct),
      start: x.StartDate ? iso(new Date(x.StartDate)) : null, gst: !!x.Gst, nri: !!x.Nri,
      bankName: x.BankName, acc: x.Acc, ifsc: x.Ifsc
    }))
  };
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.InvestorUnits ORDER BY Code DESC`);
    const out = [];
    for (const r of result.recordset) out.push(await mapInvestorUnit(pool, r));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { unitId, floor, investors, actingRole } = req.body;
    if (!investors || !investors.length || investors.some(x => !x.name)) return res.status(400).json({ error: 'Every investor needs a name.' });
    const totalDisb = investors.reduce((s, x) => s + Number(x.disbursePct || 0), 0);
    if (Math.abs(totalDisb - 100) > 0.5) return res.status(400).json({ error: 'Disbursement % across investors must total 100%.' });

    const id = uid();
    const code = await nextNo(pool, sql, 'INV');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
      .input('unitId', sql.VarChar(40), unitId).input('floor', sql.Int, floor || 0)
      .input('maker', sql.NVarChar(100), actingRole || '').input('created', sql.Date, iso(new Date()))
      .query(`INSERT INTO ${SCHEMA}.InvestorUnits (Id,Code,UnitId,Floor,Status,Maker,Checker,Remarks,CreatedAt)
        VALUES (@id,@code,@unitId,@floor,'Pending',@maker,'','',@created)`);

    for (let i = 0; i < investors.length; i++) {
      const x = investors[i];
      await pool.request().input('id', sql.VarChar(40), uid()).input('iv', sql.VarChar(40), id).input('idx', sql.Int, i)
        .input('name', sql.NVarChar(200), x.name).input('area', sql.Decimal(9, 3), x.areaPct || 0)
        .input('disb', sql.Decimal(9, 3), x.disbursePct || 0).input('start', sql.Date, x.start || null)
        .input('gst', sql.Bit, x.gst ? 1 : 0).input('nri', sql.Bit, x.nri ? 1 : 0)
        .input('bank', sql.NVarChar(150), x.bankName || '').input('acc', sql.NVarChar(60), x.acc || '').input('ifsc', sql.NVarChar(20), x.ifsc || '')
        .query(`INSERT INTO ${SCHEMA}.InvestorUnitInvestors (Id,InvestorUnitId,Idx,Name,AreaPct,DisbursePct,StartDate,Gst,Nri,BankName,Acc,Ifsc)
          VALUES (@id,@iv,@idx,@name,@area,@disb,@start,@gst,@nri,@bank,@acc,@ifsc)`);
    }
    const row = await pool.request().input('id', sql.VarChar(40), id).query(`SELECT * FROM ${SCHEMA}.InvestorUnits WHERE Id=@id`);
    res.json(await mapInvestorUnit(pool, row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { floor, investors, actingRole } = req.body;
    const totalDisb = investors.reduce((s, x) => s + Number(x.disbursePct || 0), 0);
    if (Math.abs(totalDisb - 100) > 0.5) return res.status(400).json({ error: 'Disbursement % across investors must total 100%.' });

    await pool.request().input('id', sql.VarChar(40), req.params.id).input('floor', sql.Int, floor || 0)
      .input('maker', sql.NVarChar(100), actingRole || '')
      .query(`UPDATE ${SCHEMA}.InvestorUnits SET Floor=@floor, Status='Pending', Maker=@maker, Checker='' WHERE Id=@id`);
    await pool.request().input('iv', sql.VarChar(40), req.params.id).query(`DELETE FROM ${SCHEMA}.InvestorUnitInvestors WHERE InvestorUnitId=@iv`);
    for (let i = 0; i < investors.length; i++) {
      const x = investors[i];
      await pool.request().input('id', sql.VarChar(40), uid()).input('iv', sql.VarChar(40), req.params.id).input('idx', sql.Int, i)
        .input('name', sql.NVarChar(200), x.name).input('area', sql.Decimal(9, 3), x.areaPct || 0)
        .input('disb', sql.Decimal(9, 3), x.disbursePct || 0).input('start', sql.Date, x.start || null)
        .input('gst', sql.Bit, x.gst ? 1 : 0).input('nri', sql.Bit, x.nri ? 1 : 0)
        .input('bank', sql.NVarChar(150), x.bankName || '').input('acc', sql.NVarChar(60), x.acc || '').input('ifsc', sql.NVarChar(20), x.ifsc || '')
        .query(`INSERT INTO ${SCHEMA}.InvestorUnitInvestors (Id,InvestorUnitId,Idx,Name,AreaPct,DisbursePct,StartDate,Gst,Nri,BankName,Acc,Ifsc)
          VALUES (@id,@iv,@idx,@name,@area,@disb,@start,@gst,@nri,@bank,@acc,@ifsc)`);
    }
    const row = await pool.request().input('id', sql.VarChar(40), req.params.id).query(`SELECT * FROM ${SCHEMA}.InvestorUnits WHERE Id=@id`);
    res.json(await mapInvestorUnit(pool, row.recordset[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const pool = await getPool();
    const { actingRole } = req.body;
    if (!['Finance Head', 'Center/Portfolio Head'].includes(actingRole)) return res.status(403).json({ error: 'Only Finance/Portfolio Head can approve.' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).input('checker', sql.NVarChar(100), actingRole)
      .query(`UPDATE ${SCHEMA}.InvestorUnits SET Status='Approved', Checker=@checker WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const chk = await pool.request().input('id', sql.VarChar(40), req.params.id).query(
      `SELECT COUNT(*) cnt FROM ${SCHEMA}.Disbursals WHERE InvestorUnitId=@id AND Status<>'Void'`);
    if (chk.recordset[0].cnt > 0) return res.status(400).json({ error: "Can't delete: disbursals exist." });
    await pool.request().input('id', sql.VarChar(40), req.params.id).query(`DELETE FROM ${SCHEMA}.InvestorUnits WHERE Id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
