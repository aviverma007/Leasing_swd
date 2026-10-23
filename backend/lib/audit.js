/* Field-level audit log — every create/edit/workflow action on a document is
   recorded so each record page can show a full activity timeline, like:
   "Anirudh changed Mg from 133.70 to 129.78 · 2 hours ago".
   Writes are best-effort: an audit failure never fails the business action. */
const { sql, SCHEMA } = require('../db');
const { uid } = require('./helpers');

async function logAudit(pool, entityType, entityId, action, detail, byUser) {
  try {
    await pool.request()
      .input('id', sql.VarChar(40), uid())
      .input('et', sql.VarChar(30), String(entityType).slice(0, 30))
      .input('eid', sql.VarChar(40), String(entityId).slice(0, 40))
      .input('a', sql.VarChar(30), String(action).slice(0, 30))
      .input('d', sql.NVarChar(sql.MAX), detail == null ? null : String(detail).slice(0, 8000))
      .input('by', sql.NVarChar(150), (byUser || 'system').slice(0, 150))
      .query(`INSERT INTO ${SCHEMA}.AuditLog (Id,EntityType,EntityId,Action,Detail,ByUser)
              VALUES (@id,@et,@eid,@a,@d,@by)`);
  } catch (e) {
    console.error('[audit]', entityType, entityId, action, '—', e.message);
  }
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/* Compare an old DB row with a new DB row over the given column names and
   produce a human-readable "col: old → new" change list (null if nothing changed). */
function diffRows(oldRow, newRow, cols) {
  const changes = [];
  for (const col of cols) {
    const a = oldRow ? oldRow[col] : undefined;
    const b = newRow ? newRow[col] : undefined;
    const fa = fmtVal(a), fb = fmtVal(b);
    // normalise numeric strings so 129.78 vs "129.78" is not a change
    const na = Number(a), nb = Number(b);
    const bothNum = a != null && b != null && a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNum ? Math.abs(na - nb) < 0.005 : fa === fb) continue;
    changes.push(`${col}: ${fa} → ${fb}`);
  }
  if (!changes.length) return null;
  return changes.join('; ');
}

function userName(req) {
  return req && req.user ? (req.user.email || req.user.username || 'system') : 'system';
}

module.exports = { logAudit, diffRows, userName };
