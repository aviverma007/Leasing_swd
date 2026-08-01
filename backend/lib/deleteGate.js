const { performDelete, requestDeletion } = require('./deletion');

/* Central decision point for all deletes.
   - Admin: delete happens immediately.
   - Anyone else: a pending deletion request is created; the record stays until approved. */
async function handleDelete(entity, id, user, reason) {
  const isAdmin = user && user.role === 'Admin';
  if (isAdmin) {
    await performDelete(entity, id);
    return { ok: true, deleted: true };
  }
  const { label } = await requestDeletion(entity, id, user, reason);
  return { ok: true, pending: true, label, message: 'Deletion request sent for admin approval.' };
}

module.exports = { handleDelete };
