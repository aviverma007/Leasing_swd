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
      amount: Number(r.Amount), tdsPct: Number(r.TdsPct), tds: Number(r.Tds), instrument: r.Instrument, ref: r.Ref
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
      .query(`INSERT INTO ${SCHEMA}.Collections (Id,No,InvoiceId,CollDate,Amount,TdsPct,Tds,Instrument,Ref)
        VALUES (@id,@no,@invoiceId,@date,@amount,@tdsPct,@tds,@instrument,@ref)`);
    res.json({ id, no });
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
