const { performDelete, requestDeletion } = require('./deletion');

/* Central decision point for all deletes.
   - Admin: delete happens immediately.
   - Anyone else: a pending deletion request is created; the record stays until approved.
   Every outcome is written to the audit log. */
async function handleDelete(entity, id, user, reason) {
  const isAdmin = user && user.role === 'Admin';
  const by = user ? (user.email || user.username || 'system') : 'system';
  const { getPool } = require('../db');
  const { logAudit } = require('./audit');
  if (isAdmin) {
    await performDelete(entity, id);
    try { const pool = await getPool(); await logAudit(pool, entity, id, 'deleted', `Record deleted by admin${reason ? ' — ' + reason : ''}`, by); } catch (_) {}
    return { ok: true, deleted: true };
  }
  const { label } = await requestDeletion(entity, id, user, reason);
  try { const pool = await getPool(); await logAudit(pool, entity, id, 'delete-requested', `Deletion requested${label ? ' for "' + label + '"' : ''}${reason ? ' — ' + reason : ''}`, by); } catch (_) {}
  return { ok: true, pending: true, label, message: 'Deletion request sent for admin approval.' };
}

module.exports = { handleDelete };
