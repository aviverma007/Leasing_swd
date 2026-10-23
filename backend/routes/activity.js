/* Per-record activity timeline + comments — available to any signed-in user.
   GET  /api/activity/:type/:id   → audit entries, newest first
   GET  /api/comments/:type/:id   → comments, newest first
   POST /api/comments/:type/:id   → add a comment { body } */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid } = require('../lib/helpers');
const { userName } = require('../lib/audit');
const router = express.Router();

router.get('/activity/:type/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('et', sql.VarChar(30), req.params.type)
      .input('eid', sql.VarChar(40), req.params.id)
      .query(`SELECT TOP 200 Id, Action, Detail, ByUser, At FROM ${SCHEMA}.AuditLog
              WHERE EntityType=@et AND EntityId=@eid ORDER BY At DESC`);
    res.json(r.recordset.map(x => ({
      id: x.Id, action: x.Action, detail: x.Detail, by: x.ByUser,
      at: new Date(x.At).toISOString()
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/comments/:type/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('et', sql.VarChar(30), req.params.type)
      .input('eid', sql.VarChar(40), req.params.id)
      .query(`SELECT TOP 200 Id, Author, Body, CreatedAt FROM ${SCHEMA}.Comments
              WHERE EntityType=@et AND EntityId=@eid ORDER BY CreatedAt DESC`);
    res.json(r.recordset.map(x => ({
      id: x.Id, author: x.Author, body: x.Body, at: new Date(x.CreatedAt).toISOString()
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/comments/:type/:id', async (req, res) => {
  try {
    const body = req.body && String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Write a comment first.' });
    const pool = await getPool();
    const id = uid();
    const author = userName(req);
    await pool.request()
      .input('id', sql.VarChar(40), id)
      .input('et', sql.VarChar(30), req.params.type)
      .input('eid', sql.VarChar(40), req.params.id)
      .input('a', sql.NVarChar(150), author)
      .input('b', sql.NVarChar(2000), body.slice(0, 2000))
      .query(`INSERT INTO ${SCHEMA}.Comments (Id,EntityType,EntityId,Author,Body) VALUES (@id,@et,@eid,@a,@b)`);
    res.json({ id, author, body, at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
