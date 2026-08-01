const { sql, getPool, SCHEMA } = require('../db');
const { uid } = require('./helpers');

/* Map each deletable entity to the actual delete implementation.
   These mirror the delete logic that previously lived in each route,
   including the guards (e.g. can't delete a lease with collected invoices). */

async function q(pool, text, binds = {}) {
  const r = pool.request();
  for (const [k, v] of Object.entries(binds)) r.input(k, v);
  return r.query(text);
}

// simple entity -> table for the plain masters
const SIMPLE_TABLES = {
  companies: 'Companies', assets: 'Assets', blocks: 'Blocks',
  units: 'Units', brands: 'Brands', users: 'Users', sales: 'Sales'
};

async function performDelete(entity, id) {
  const pool = await getPool();

  if (SIMPLE_TABLES[entity]) {
    if (entity === 'sales') {
      // recompute rev-share after deleting a sales row
      const row = await q(pool, `SELECT * FROM ${SCHEMA}.Sales WHERE Id=@id`, { id });
      const s = row.recordset[0];
      await q(pool, `DELETE FROM ${SCHEMA}.Sales WHERE Id=@id`, { id });
      if (s) {
        const { syncRevShare } = require('./billing');
        await syncRevShare(pool, s.LeaseId, s.Ym);
      }
      return;
    }
    await q(pool, `DELETE FROM ${SCHEMA}.${SIMPLE_TABLES[entity]} WHERE Id=@id`, { id });
    return;
  }

  if (entity === 'leases') {
    const paid = await q(pool, `SELECT COUNT(*) cnt FROM ${SCHEMA}.Invoices i JOIN ${SCHEMA}.Collections c ON c.InvoiceId=i.Id WHERE i.LeaseId=@id`, { id });
    if (paid.recordset[0].cnt > 0) throw new Error("Can't delete: collected invoices exist.");
    const leaseRow = await q(pool, `SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`, { id });
    const lease = leaseRow.recordset[0];
    await q(pool, `DELETE FROM ${SCHEMA}.Invoices WHERE LeaseId=@id`, { id });
    await q(pool, `DELETE FROM ${SCHEMA}.Leases WHERE Id=@id`, { id });
    if (lease) {
      const other = await q(pool, `SELECT COUNT(*) cnt FROM ${SCHEMA}.Leases WHERE UnitId=@u AND Status='Active'`, { u: lease.UnitId });
      if (other.recordset[0].cnt === 0) {
        await q(pool, `UPDATE ${SCHEMA}.Units SET Status='Vacant' WHERE Id=@u`, { u: lease.UnitId });
      }
    }
    return;
  }

  if (entity === 'invoices') {
    await q(pool, `DELETE FROM ${SCHEMA}.Collections WHERE InvoiceId=@id`, { id });
    await q(pool, `DELETE FROM ${SCHEMA}.Invoices WHERE Id=@id`, { id });
    return;
  }

  if (entity === 'collections') {
    await q(pool, `DELETE FROM ${SCHEMA}.Collections WHERE Id=@id`, { id });
    return;
  }

  if (entity === 'investors') {
    const chk = await q(pool, `SELECT COUNT(*) cnt FROM ${SCHEMA}.Disbursals WHERE InvestorUnitId=@id AND Status<>'Void'`, { id });
    if (chk.recordset[0].cnt > 0) throw new Error("Can't delete: disbursals exist.");
    await q(pool, `DELETE FROM ${SCHEMA}.InvestorUnits WHERE Id=@id`, { id });
    return;
  }

  throw new Error('Unknown entity: ' + entity);
}

// Build a human-readable label for the record being deleted (best-effort)
async function labelFor(entity, id) {
  const pool = await getPool();
  try {
    if (SIMPLE_TABLES[entity] && entity !== 'sales') {
      const t = SIMPLE_TABLES[entity];
      const r = await q(pool, `SELECT TOP 1 * FROM ${SCHEMA}.${t} WHERE Id=@id`, { id });
      const row = r.recordset[0];
      if (!row) return entity;
      return `${row.Code || ''} ${row.Name || row.Email || ''}`.trim() || entity;
    }
    if (entity === 'sales') {
      const r = await q(pool, `SELECT TOP 1 * FROM ${SCHEMA}.Sales WHERE Id=@id`, { id });
      const row = r.recordset[0];
      return row ? `Sales ${row.Ym} · ${row.Amount}` : entity;
    }
    if (entity === 'leases') {
      const r = await q(pool, `SELECT TOP 1 Code FROM ${SCHEMA}.Leases WHERE Id=@id`, { id });
      return r.recordset[0] ? `Lease ${r.recordset[0].Code}` : entity;
    }
    if (entity === 'invoices') {
      const r = await q(pool, `SELECT TOP 1 No FROM ${SCHEMA}.Invoices WHERE Id=@id`, { id });
      return r.recordset[0] ? `Invoice ${r.recordset[0].No}` : entity;
    }
    if (entity === 'collections') {
      const r = await q(pool, `SELECT TOP 1 No FROM ${SCHEMA}.Collections WHERE Id=@id`, { id });
      return r.recordset[0] ? `Receipt ${r.recordset[0].No}` : entity;
    }
    if (entity === 'investors') {
      const r = await q(pool, `SELECT TOP 1 Code FROM ${SCHEMA}.InvestorUnits WHERE Id=@id`, { id });
      return r.recordset[0] ? `Investor unit ${r.recordset[0].Code}` : entity;
    }
  } catch (e) { /* fall through */ }
  return entity;
}

// Run only the guards (no delete). Throws if the record cannot be deleted.
async function checkDeletable(entity, id) {
  const pool = await getPool();
  if (entity === 'leases') {
    const paid = await q(pool, `SELECT COUNT(*) cnt FROM ${SCHEMA}.Invoices i JOIN ${SCHEMA}.Collections c ON c.InvoiceId=i.Id WHERE i.LeaseId=@id`, { id });
    if (paid.recordset[0].cnt > 0) throw new Error("Can't delete: collected invoices exist.");
  }
  if (entity === 'investors') {
    const chk = await q(pool, `SELECT COUNT(*) cnt FROM ${SCHEMA}.Disbursals WHERE InvestorUnitId=@id AND Status<>'Void'`, { id });
    if (chk.recordset[0].cnt > 0) throw new Error("Can't delete: disbursals exist.");
  }
}

// Create a pending deletion request (used by non-admins)
async function requestDeletion(entity, id, user, reason) {
  const pool = await getPool();
  await checkDeletable(entity, id); // fail fast if the record can't be deleted at all
  // avoid duplicate pending requests for the same record
  const existing = await q(pool,
    `SELECT COUNT(*) cnt FROM ${SCHEMA}.DeletionRequests WHERE Entity=@e AND RecordId=@r AND Status='Pending'`,
    { e: entity, r: id });
  if (existing.recordset[0].cnt > 0) {
    throw new Error('A deletion request for this record is already pending admin approval.');
  }
  const label = await labelFor(entity, id);
  const reqId = uid();
  const rq = pool.request();
  rq.input('id', sql.VarChar(40), reqId);
  rq.input('e', sql.VarChar(40), entity);
  rq.input('r', sql.VarChar(40), id);
  rq.input('label', sql.NVarChar(300), label);
  rq.input('reason', sql.NVarChar(400), reason || '');
  rq.input('by', sql.NVarChar(150), user?.email || '');
  rq.input('role', sql.VarChar(50), user?.role || '');
  await rq.query(`INSERT INTO ${SCHEMA}.DeletionRequests (Id,Entity,RecordId,Label,Reason,Status,RequestedBy,RequestedRole)
    VALUES (@id,@e,@r,@label,@reason,'Pending',@by,@role)`);
  return { id: reqId, label };
}

async function listRequests(status) {
  const pool = await getPool();
  const rq = pool.request();
  let where = '';
  if (status) { rq.input('s', sql.VarChar(20), status); where = 'WHERE Status=@s'; }
  const r = await rq.query(`SELECT * FROM ${SCHEMA}.DeletionRequests ${where} ORDER BY RequestedAt DESC`);
  return r.recordset.map(x => ({
    id: x.Id, entity: x.Entity, recordId: x.RecordId, label: x.Label, reason: x.Reason,
    status: x.Status, requestedBy: x.RequestedBy, requestedRole: x.RequestedRole,
    requestedAt: x.RequestedAt, decidedBy: x.DecidedBy, decidedAt: x.DecidedAt, decisionNote: x.DecisionNote
  }));
}

async function pendingCount() {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT COUNT(*) cnt FROM ${SCHEMA}.DeletionRequests WHERE Status='Pending'`);
  return r.recordset[0].cnt;
}

// Approve a request: performs the real delete, then marks Approved
async function approveRequest(reqId, admin, note) {
  const pool = await getPool();
  const row = await q(pool, `SELECT * FROM ${SCHEMA}.DeletionRequests WHERE Id=@id`, { id: reqId });
  const req = row.recordset[0];
  if (!req) throw new Error('Request not found.');
  if (req.Status !== 'Pending') throw new Error('This request is already ' + req.Status.toLowerCase() + '.');
  await performDelete(req.Entity, req.RecordId);  // may throw (guards) — then we don't mark approved
  const rq = pool.request();
  rq.input('id', sql.VarChar(40), reqId);
  rq.input('by', sql.NVarChar(150), admin?.email || 'admin');
  rq.input('note', sql.NVarChar(400), note || '');
  await rq.query(`UPDATE ${SCHEMA}.DeletionRequests SET Status='Approved', DecidedBy=@by, DecidedAt=SYSDATETIME(), DecisionNote=@note WHERE Id=@id`);
  return { entity: req.Entity };
}

async function rejectRequest(reqId, admin, note) {
  const pool = await getPool();
  const row = await q(pool, `SELECT * FROM ${SCHEMA}.DeletionRequests WHERE Id=@id`, { id: reqId });
  const req = row.recordset[0];
  if (!req) throw new Error('Request not found.');
  if (req.Status !== 'Pending') throw new Error('This request is already ' + req.Status.toLowerCase() + '.');
  const rq = pool.request();
  rq.input('id', sql.VarChar(40), reqId);
  rq.input('by', sql.NVarChar(150), admin?.email || 'admin');
  rq.input('note', sql.NVarChar(400), note || '');
  await rq.query(`UPDATE ${SCHEMA}.DeletionRequests SET Status='Rejected', DecidedBy=@by, DecidedAt=SYSDATETIME(), DecisionNote=@note WHERE Id=@id`);
}

// Set of record ids (per entity) that currently have a pending deletion — for UI badges
async function pendingMap() {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT Entity, RecordId FROM ${SCHEMA}.DeletionRequests WHERE Status='Pending'`);
  const map = {};
  r.recordset.forEach(x => { (map[x.Entity] = map[x.Entity] || []).push(x.RecordId); });
  return map;
}

module.exports = { performDelete, requestDeletion, checkDeletable, listRequests, approveRequest, rejectRequest, pendingCount, pendingMap, labelFor };
