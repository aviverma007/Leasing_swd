/* Central role -> access matrix (frontend copy — keep in sync with backend/lib/permissions.js).
   Access per module: 'none' | 'view' | 'edit' (view + create/update/delete). */

export const MODULES = [
  'dashboard', 'inventory', 'collectionmaster', 'deletions', 'companies', 'assets', 'blocks', 'units', 'brands', 'users',
  'leases', 'sales', 'invoices', 'collections', 'investors', 'disbursement', 'reports'
];

function row(map) {
  const r = {};
  MODULES.forEach((m) => { r[m] = map[m] || 'none'; });
  return r;
}

export const ACCESS = {
  Admin: row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', deletions: 'edit', companies: 'edit', assets: 'edit', blocks: 'edit', units: 'edit', brands: 'edit', users: 'edit',
    leases: 'edit', sales: 'edit', invoices: 'edit', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Center/Portfolio Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'view', invoices: 'view', collections: 'view', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Finance Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'view', invoices: 'edit', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Leasing Head': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', companies: 'edit', assets: 'edit', blocks: 'edit', units: 'edit', brands: 'edit',
    leases: 'edit', sales: 'edit', invoices: 'edit', collections: 'view', investors: 'edit', disbursement: 'none', reports: 'view'
  }),
  Manager: row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view', companies: 'view', assets: 'view', blocks: 'view', units: 'view', brands: 'view',
    leases: 'view', sales: 'edit', invoices: 'view', collections: 'edit', investors: 'edit', disbursement: 'edit', reports: 'view'
  }),
  'Owner Representative': row({
    dashboard: 'view', inventory: 'view', collectionmaster: 'view',
    leases: 'view', invoices: 'view', investors: 'view', disbursement: 'view', reports: 'view'
  })
};

export const APPROVER_ROLES = ['Admin', 'Finance Head', 'Center/Portfolio Head'];

export function accessFor(role, module) {
  const r = ACCESS[role];
  if (!r) return 'none';
  return r[module] || 'none';
}
export function canView(role, module) { return accessFor(role, module) !== 'none'; }
export function canEdit(role, module) { return accessFor(role, module) === 'edit'; }
export function canApproveRole(role) { return APPROVER_ROLES.includes(role); }
