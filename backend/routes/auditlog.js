/* Audit Logs tab — every recorded action by every user, filterable.
   GET /api/audit?user=&type=&action=&from=&to=&q=&limit=   (newest first)
   GET /api/audit/meta  → distinct users / entity types / actions for the filters
   Visible to roles that can view the Users module (and always to Admin). */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const router = express.Router();

router.get('/meta', async (req, res) => {
  try {
    const pool = await getPool();
    const [u, t, a] = await Promise.all([
      pool.request().query(`SELECT DISTINCT TOP 200 ByUser FROM ${SCHEMA}.AuditLog ORDER BY ByUser`),
      pool.request().query(`SELECT DISTINCT EntityType FROM ${SCHEMA}.AuditLog ORDER BY EntityType`),
      pool.request().query(`SELECT DISTINCT Action FROM ${SCHEMA}.AuditLog ORDER BY Action`)
    ]);
    res.json({
      users: u.recordset.map(x => x.ByUser).filter(Boolean),
      types: t.recordset.map(x => x.EntityType),
      actions: a.recordset.map(x => x.Action)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { user, type, action, from, to, q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 300, 2000);
    const reqq = pool.request();
    const where = [];
    if (user) { reqq.input('u', sql.NVarChar(150), user); where.push('ByUser = @u'); }
    if (type) { reqq.input('t', sql.VarChar(30), type); where.push('EntityType = @t'); }
    if (action) { reqq.input('a', sql.VarChar(30), action); where.push('Action = @a'); }
    if (from) { reqq.input('f', sql.Date, from); where.push('At >= @f'); }
    if (to) { reqq.input('e', sql.Date, to); where.push('At < DATEADD(day, 1, @e)'); }
    if (q) { reqq.input('q', sql.NVarChar(200), '%' + String(q).replace(/[%_\[]/g, c => '[' + c + ']') + '%'); where.push('(Detail LIKE @q OR EntityId LIKE @q)'); }
    const r = await reqq.query(`
      SELECT TOP ${limit} Id, EntityType, EntityId, Action, Detail, ByUser, At
      FROM ${SCHEMA}.AuditLog
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY At DESC`);
    res.json(r.recordset.map(x => ({
      id: x.Id, entityType: x.EntityType, entityId: x.EntityId, action: x.Action,
      detail: x.Detail, by: x.ByUser, at: new Date(x.At).toISOString()
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
