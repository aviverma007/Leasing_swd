const express = require('express');
const { listRequests, approveRequest, rejectRequest, pendingMap, pendingCount } = require('../lib/deletion');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only an admin can manage deletion requests.' });
  }
  next();
}

// Pending map (entity -> [recordIds]) — any signed-in user may read, for UI badges
router.get('/pending-map', async (req, res) => {
  try { res.json(await pendingMap()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/count', async (req, res) => {
  try { res.json({ count: await pendingCount() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Full list — admin only
router.get('/', requireAdmin, async (req, res) => {
  try { res.json(await listRequests(req.query.status)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/approve', requireAdmin, async (req, res) => {
  try { res.json(await approveRequest(req.params.id, req.user, req.body?.note)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/reject', requireAdmin, async (req, res) => {
  try { await rejectRequest(req.params.id, req.user, req.body?.note); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
