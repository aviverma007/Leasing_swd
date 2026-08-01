const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid } = require('../lib/helpers');
const { genLeaseInvoices, syncRevShare } = require('../lib/billing');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.Sales ORDER BY Ym DESC`);
    res.json(result.recordset.map(r => ({ id: r.Id, leaseId: r.LeaseId, ym: r.Ym, amount: Number(r.Amount) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { leaseId, ym, amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Enter sales amount.' });

    const existing = await pool.request().input('l', sql.VarChar(40), leaseId).input('y', sql.Char(7), ym)
      .query(`SELECT TOP 1 * FROM ${SCHEMA}.Sales WHERE LeaseId=@l AND Ym=@y`);
    if (existing.recordset[0]) {
      await pool.request().input('id', sql.VarChar(40), existing.recordset[0].Id).input('amt', sql.Decimal(18, 2), amount)
        .query(`UPDATE ${SCHEMA}.Sales SET Amount=@amt WHERE Id=@id`);
    } else {
      await pool.request().input('id', sql.VarChar(40), uid()).input('l', sql.VarChar(40), leaseId)
        .input('y', sql.Char(7), ym).input('amt', sql.Decimal(18, 2), amount)
        .query(`INSERT INTO ${SCHEMA}.Sales (Id,LeaseId,Ym,Amount) VALUES (@id,@l,@y,@amt)`);
    }
    await genLeaseInvoices(pool, leaseId, ym);
    await syncRevShare(pool, leaseId, ym);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { handleDelete } = require('../lib/deleteGate');
    const result = await handleDelete('sales', req.params.id, req.user, req.body?.reason);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
