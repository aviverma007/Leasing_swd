/* Central role -> access matrix (frontend copy — keep in sync with backend/lib/permissions.js).
   Access per module: 'none' | 'view' | 'edit' (view + create/update/delete). */

export const MODULES = [
  'dashboard', 'inventory', 'collectionmaster', 'investoraccounts', 'deletions', 'companies', 'assets', 'blocks', 'units', 'brands', 'users',
  'leases', 'sales', 'invoices', 'collections', 'investors', 'disbursement', 'reports'
];

function row(map) {
  const r = {};
  MODULES.forEach((m) => { r[m] = map[m] || 'none'; });
  return r;
}

export const ACCESS = {
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

export const APPROVER_ROLES = ['Admin', 'Finance Head', 'Center/Portfolio Head'];

const MODULE_ALIAS = { home: 'dashboard', customers: 'units', brokers: 'brands', ledger: 'collectionmaster', roleprofiles: 'users', gstrecon: 'reports', tdsrecon: 'reports', agreementrecon: 'reports', sdrecon: 'reports', reportcenter: 'reports' };

/* Runtime (DB-driven) role matrix — loaded after login from /api/roles.
   The static ACCESS above stays as the fallback; Admin is always full access. */
let DYN = null;
let DYN_APPROVERS = null;
export function setAccessMatrix(roles) {
  DYN = {}; DYN_APPROVERS = new Set(['Admin']);
  (roles || []).forEach((r) => {
    DYN[r.name] = r.access || {};
    if (r.canApprove) DYN_APPROVERS.add(r.name);
  });
}
export function dynamicRoleNames() {
  return DYN ? Object.keys(DYN) : null;
}

export function accessFor(role, module) {
  const m = MODULE_ALIAS[module] || module;
  if (role === 'Admin') return 'edit';
  if (DYN && DYN[role]) return DYN[role][m] || 'none';
  const r = ACCESS[role];
  if (!r) return 'none';
  return r[m] || 'none';
}
export function canView(role, module) { return accessFor(role, module) !== 'none'; }
export function canEdit(role, module) { return accessFor(role, module) === 'edit'; }
export function canApproveRole(role) {
  if (role === 'Admin') return true;
  if (DYN_APPROVERS) return DYN_APPROVERS.has(role);
  return APPROVER_ROLES.includes(role);
}
