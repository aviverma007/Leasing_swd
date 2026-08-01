const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool, SCHEMA } = require('../db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Enter username and password.' });

    // 1) Admin account from .env (not a DB row)
    if (ADMIN_PASSWORD && username === ADMIN_ID && password === ADMIN_PASSWORD) {
      const user = { id: 'admin', email: ADMIN_ID, role: 'Admin', isAdmin: true };
      return res.json({ token: sign(user), user });
    }

    // 2) Regular user from leasing.Users (matched on Email)
    const pool = await getPool();
    const row = await pool.request().input('email', sql.NVarChar(200), username)
      .query(`SELECT TOP 1 * FROM ${SCHEMA}.Users WHERE Email=@email`);
    const u = row.recordset[0];
    if (!u) return res.status(401).json({ error: 'Invalid username or password.' });
    if ((u.Active || 'Active') !== 'Active') return res.status(403).json({ error: 'This account is inactive.' });

    const stored = u.Password || '';
    let ok = false;
    if (stored.startsWith('$2')) {
      // bcrypt hash
      ok = await bcrypt.compare(password, stored);
    } else {
      // legacy plaintext (seeded/older rows) — allow, so existing users can still log in
      ok = stored === password;
    }
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

    const user = { id: u.Id, email: u.Email, role: u.Role, isAdmin: false };
    return res.json({ token: sign(user), user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me — validate a token and echo the user
router.get('/me', (req, res) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No token.' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ user });
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
