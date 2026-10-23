const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid } = require('../lib/helpers');
const { MODULES, loadRoleProfiles } = require('../lib/permissions');
const router = express.Router();

const LEVELS = new Set(['none', 'view', 'edit']);

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Only the admin can manage role profiles.' });
  next();
}

function mapRole(r) {
  let access = {};
  try { access = JSON.parse(r.AccessJson || '{}'); } catch (_) { /* empty */ }
  return { id: r.Id, name: r.Name, access, canApprove: !!r.CanApprove, builtIn: !!r.BuiltIn };
}

function cleanAccess(body) {
  const access = {};
  for (const m of MODULES) {
    const v = body && body.access && body.access[m];
    access[m] = LEVELS.has(v) ? v : 'none';
  }
  return access;
}

/* Any signed-in user may read the profiles (the frontend builds its menu from them) */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM ${SCHEMA}.RoleProfiles ORDER BY BuiltIn DESC, Name`);
    res.json({ modules: MODULES, roles: r.recordset.map(mapRole) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Role name is required.' });
    if (name === 'Admin') return res.status(400).json({ error: "'Admin' is reserved." });
    const dup = await pool.request().input('n', sql.NVarChar(100), name)
      .query(`SELECT COUNT(*) c FROM ${SCHEMA}.RoleProfiles WHERE Name=@n`);
    if (dup.recordset[0].c > 0) return res.status(400).json({ error: 'A role with this name already exists.' });
    const id = uid();
    await pool.request()
      .input('id', sql.VarChar(40), id).input('n', sql.NVarChar(100), name)
      .input('j', sql.NVarChar(sql.MAX), JSON.stringify(cleanAccess(req.body)))
      .input('ap', sql.Bit, req.body.canApprove ? 1 : 0)
      .query(`INSERT INTO ${SCHEMA}.RoleProfiles (Id,Name,AccessJson,CanApprove,BuiltIn) VALUES (@id,@n,@j,@ap,0)`);
    await loadRoleProfiles(pool, SCHEMA);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    const cur = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT * FROM ${SCHEMA}.RoleProfiles WHERE Id=@id`);
    const row = cur.recordset[0];
    if (!row) return res.status(404).json({ error: 'Role not found' });
    if (row.Name === 'Admin') return res.status(400).json({ error: 'The Admin profile is locked at full access and cannot be edited.' });
    await pool.request()
      .input('id', sql.VarChar(40), req.params.id)
      .input('j', sql.NVarChar(sql.MAX), JSON.stringify(cleanAccess(req.body)))
      .input('ap', sql.Bit, req.body.canApprove ? 1 : 0)
      .query(`UPDATE ${SCHEMA}.RoleProfiles SET AccessJson=@j, CanApprove=@ap WHERE Id=@id`);
    await loadRoleProfiles(pool, SCHEMA);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    const cur = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT * FROM ${SCHEMA}.RoleProfiles WHERE Id=@id`);
    const row = cur.recordset[0];
    if (!row) return res.status(404).json({ error: 'Role not found' });
    if (row.BuiltIn || row.Name === 'Admin') return res.status(400).json({ error: 'Built-in roles cannot be deleted — edit their access instead.' });
    const used = await pool.request().input('n', sql.NVarChar(100), row.Name)
      .query(`SELECT COUNT(*) c FROM ${SCHEMA}.Users WHERE Role=@n`);
    if (used.recordset[0].c > 0) return res.status(400).json({ error: `${used.recordset[0].c} user(s) still hold this role — reassign them first.` });
    await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`DELETE FROM ${SCHEMA}.RoleProfiles WHERE Id=@id`);
    await loadRoleProfiles(pool, SCHEMA);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
