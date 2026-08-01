const express = require('express');
const { sql, getPool } = require('../db');
const { uid } = require('../lib/helpers');
const { genLeaseInvoices, syncRevShare } = require('../lib/billing');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.Sales ORDER BY Ym DESC');
    res.json(result.recordset.map(r => ({ id: r.Id, leaseId: r.LeaseId, ym: r.Ym, amount: Number(r.Amount) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { leaseId, ym, amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Enter sales amount.' });

    const existing = await pool.request().input('l', sql.VarChar(40), leaseId).input('y', sql.Char(7), ym)
      .query('SELECT TOP 1 * FROM dbo.Sales WHERE LeaseId=@l AND Ym=@y');
    if (existing.recordset[0]) {
      await pool.request().input('id', sql.VarChar(40), existing.recordset[0].Id).input('amt', sql.Decimal(18, 2), amount)
        .query('UPDATE dbo.Sales SET Amount=@amt WHERE Id=@id');
    } else {
      await pool.request().input('id', sql.VarChar(40), uid()).input('l', sql.VarChar(40), leaseId)
        .input('y', sql.Char(7), ym).input('amt', sql.Decimal(18, 2), amount)
        .query('INSERT INTO dbo.Sales (Id,LeaseId,Ym,Amount) VALUES (@id,@l,@y,@amt)');
    }
    await genLeaseInvoices(pool, leaseId, ym);
    await syncRevShare(pool, leaseId, ym);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const row = await pool.request().input('id', sql.VarChar(40), req.params.id).query('SELECT * FROM dbo.Sales WHERE Id=@id');
    const s = row.recordset[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    await pool.request().input('id', sql.VarChar(40), req.params.id).query('DELETE FROM dbo.Sales WHERE Id=@id');
    await syncRevShare(pool, s.LeaseId, s.Ym);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
