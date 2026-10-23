/* Central role -> access matrix. Single source of truth for permissions.
   Access levels per module:
     'none' | 'view' | 'edit' (implies view + create/update/delete)
   Approval capability is separate (canApprove).
   Used by the frontend to gate UI, and available to the backend for enforcement. */

const MODULES = [
  'dashboard', 'inventory', 'collectionmaster', 'investoraccounts', 'deletions', 'companies', 'assets', 'blocks', 'units', 'brands', 'users',
  'leases', 'sales', 'invoices', 'collections', 'investors', 'disbursement', 'reports'
];

// helper to build a row quickly
function row(map) {
  const r = {};
  MODULES.forEach((m) => { r[m] = map[m] || 'none'; });
  return r;
}

const ACCESS = {
  Admin: row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view', deletions: 'edit', companies: 'edit', assets: 'edit', blocks: 'edit', units: 'edit', brands: 'edit', users: 'edit',
    leases: 'edit', sales: 'edit', invoices: 'edit', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Center/Portfolio Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'view', invoices: 'view', collections: 'view', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Finance Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'view', invoices: 'edit', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Leasing Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view', companies: 'edit', assets: 'edit', blocks: 'edit', units: 'edit', brands: 'edit',
    leases: 'edit', sales: 'edit', invoices: 'edit', collections: 'view', investors: 'edit', disbursement: 'none', reports: 'view'
  }),
  Manager: row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'edit', invoices: 'view', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Owner Representative': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', investoraccounts: 'view',
    leases: 'view', invoices: 'view', investors: 'view', disbursement: 'view', reports: 'view'
  })
};

// Only these roles can approve investor units & disbursements
const APPROVER_ROLES = ['Admin', 'Finance Head', 'Center/Portfolio Head'];

/* ── Dynamic role profiles (DB-driven) ──
   loadRoleProfiles(pool, SCHEMA) fills this cache at startup and whenever the
   admin edits a role. Static ACCESS above remains the fallback, and the Admin
   role is always full-access regardless of what the table says. */
let DYNAMIC = null; // { roleName: { access: {module: level}, canApprove: bool } }

async function loadRoleProfiles(pool, SCHEMA) {
  const r = await pool.request().query(`SELECT Name, AccessJson, CanApprove FROM ${SCHEMA}.RoleProfiles`);
  const map = {};
  for (const row of r.recordset) {
    try { map[row.Name] = { access: JSON.parse(row.AccessJson || '{}'), canApprove: !!row.CanApprove }; }
    catch (_) { /* skip bad row */ }
  }
  if (Object.keys(map).length) DYNAMIC = map;
  console.log(`[roles] ${Object.keys(map).length} role profile(s) loaded`);
  return map;
}

function accessFor(role, module) {
  if (role === 'Admin') return 'edit'; // admin profile always does everything
  if (DYNAMIC && DYNAMIC[role]) return DYNAMIC[role].access[module] || 'none';
  const r = ACCESS[role];
  if (!r) return 'none';
  return r[module] || 'none';
}
function canView(role, module) { return accessFor(role, module) !== 'none'; }
function canEdit(role, module) { return accessFor(role, module) === 'edit'; }
function canApprove(role) {
  if (role === 'Admin') return true;
  if (DYNAMIC && DYNAMIC[role]) return DYNAMIC[role].canApprove;
  return APPROVER_ROLES.includes(role);
}
function roleNames() {
  return DYNAMIC ? Object.keys(DYNAMIC) : Object.keys(ACCESS);
}

module.exports = { MODULES, ACCESS, APPROVER_ROLES, accessFor, canView, canEdit, canApprove, loadRoleProfiles, roleNames };
