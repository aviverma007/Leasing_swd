const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool, SCHEMA } = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only an admin can reset user passwords.' });
  }
  next();
}

// GET /api/user-admin/:id/meta — password metadata (never the password itself)
router.get('/:id/meta', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT Id, Email, Role, Active, PwdChangedAt,
              CASE WHEN Password LIKE '$2%' THEN 1 ELSE 0 END AS Hashed
              FROM ${SCHEMA}.Users WHERE Id=@id`);
    const u = r.recordset[0];
    if (!u) return res.status(404).json({ error: 'User not found.' });
    res.json({
      id: u.Id, email: u.Email, role: u.Role, active: u.Active,
      pwdChangedAt: u.PwdChangedAt, hashed: !!u.Hashed
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/user-admin/:id/reset-password  { newPassword }
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: 'Enter a new password (at least 4 characters).' });
    }
    const pool = await getPool();
    const exists = await pool.request().input('id', sql.VarChar(40), req.params.id)
      .query(`SELECT COUNT(*) cnt FROM ${SCHEMA}.Users WHERE Id=@id`);
    if (exists.recordset[0].cnt === 0) return res.status(404).json({ error: 'User not found.' });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.request()
      .input('id', sql.VarChar(40), req.params.id)
      .input('pw', sql.NVarChar(200), hash)
      .query(`UPDATE ${SCHEMA}.Users SET Password=@pw, PwdChangedAt=SYSDATETIME() WHERE Id=@id`);
    res.json({ ok: true, pwdChangedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
