export const money = (n) => '₹' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const ymLabel = (ym) => (ym ? new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');
export const iso = (d) => d.toISOString().slice(0, 10);
export const curYM = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)).slice(0, 7); };
export const addMonths = (ym, m) => {
  const d = new Date(ym + '-01T00:00:00');
  d.setMonth(d.getMonth() + m);
  return iso(d).slice(0, 7);
};
export const nameOf = (list, id, field = 'name') => {
  const r = (list || []).find((x) => x.id === id);
  return r ? r[field] : '—';
};
export const findById = (list, id) => (list || []).find((x) => x.id === id);

export function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    c = String(c ?? '');
    return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  }).join(',')).join('\n');
}
export function download(name, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CATEGORIES = ['Anchor', 'Hypermarket', 'Fashion', 'F&B', 'Electronics', 'Services', 'Other'];
export const ROLES = ['Manager', 'Leasing Head', 'Finance Head', 'Center/Portfolio Head', 'Owner Representative'];
export const canApprove = (role) => ['Finance Head', 'Center/Portfolio Head'].includes(role);

export const MASTER_SCHEMA = {
  companies: {
    sing: 'Company',
    fields: [{ k: 'name', l: 'Company name', req: 1, ph: 'Vertex Retail Ventures Pvt Ltd' }],
    head: ['Code', 'Company'],
    cols: (r) => [r.code, r.name]
  },
  assets: {
    sing: 'Asset',
    fields: [{ k: 'name', l: 'Asset name', req: 1, ph: 'Meridian Mall' }, { k: 'city', l: 'City', ph: 'Mumbai' }],
    head: ['Code', 'Asset', 'City'],
    cols: (r) => [r.code, r.name, r.city || '—']
  },
  blocks: {
    sing: 'Block',
    fields: [{ k: 'name', l: 'Block name', req: 1, ph: 'North Wing' }, { k: 'assetId', l: 'Asset', req: 1, ref: 'assets' }, { k: 'totalFloors', l: 'Total floors', type: 'number', ph: '4' }],
    head: ['Code', 'Block', 'Asset', 'Floors'],
    cols: (r, db) => [r.code, r.name, nameOf(db.assets, r.assetId), `${r.totalFloors || 0} floors`]
  },
  units: {
    sing: 'Unit',
    fields: [
      { k: 'name', l: 'Unit name / no', req: 1, ph: 'N-101' },
      { k: 'assetId', l: 'Asset', req: 1, ref: 'assets' },
      { k: 'blockId', l: 'Block', req: 1, ref: 'blocks' },
      { k: 'floor', l: 'Floor', type: 'number', ph: '1' },
      { k: 'carpetArea', l: 'Carpet area (sq ft)', type: 'number', ph: '2200' },
      { k: 'builtupArea', l: 'Built-up area (sq ft)', type: 'number', ph: '2600' }
    ],
    head: ['Code', 'Unit', 'Asset', 'Carpet', 'Built-up', 'Status'],
    cols: (r, db) => [r.code, r.name, nameOf(db.assets, r.assetId), (+r.carpetArea || 0).toLocaleString('en-IN'), (+r.builtupArea || 0).toLocaleString('en-IN'), r.status]
  },
  brands: {
    sing: 'Brand',
    fields: [
      { k: 'name', l: 'Brand name', req: 1, ph: 'Brewhouse Cafe' },
      { k: 'companyId', l: 'Company', req: 1, ref: 'companies' },
      { k: 'category', l: 'Brand category', type: 'select', opts: CATEGORIES },
      { k: 'regularAddress', l: 'Registered address', type: 'textarea', ph: 'Registered office address' },
      { k: 'address', l: 'Site / correspondence address', type: 'textarea', ph: 'Store address at asset' }
    ],
    head: ['Code', 'Brand', 'Company', 'Category'],
    cols: (r, db) => [r.code, r.name, nameOf(db.companies, r.companyId), r.category || '—']
  },
  users: {
    sing: 'User',
    fields: [
      { k: 'email', l: 'Email address', req: 1, ph: 'finance@scoopsense.io' },
      { k: 'password', l: 'Password', type: 'password', req: 1, ph: 'Set password' },
      { k: 'role', l: 'Role in hierarchy', type: 'select', opts: ROLES },
      { k: 'active', l: 'Status', type: 'select', opts: ['Active', 'Inactive'] }
    ],
    head: ['Code', 'Email', 'Role', 'Status'],
    cols: (r) => [r.code, r.email, r.role, r.active]
  }
};

export const RENTAL_TYPES = [
  ['MG', 'MG only (lumpsum / per sq ft)'],
  ['MGvsRS', 'MG or Rev-share, whichever higher'],
  ['PureRS', 'Pure revenue share'],
  ['VarRS', 'Variable rev-share (slabs)']
];
export const RENTAL_HINT = {
  MG: "Bills MG each period. MG = lumpsum, or ₹/sq ft × carpet area.",
  MGvsRS: "Bills MG; when revenue share for the month exceeds MG, the excess is billed as a top-up.",
  PureRS: "No MG. Bills revenue share % of the month's entered sales.",
  VarRS: "Slab-based revenue share — enter sales; % applies (slab UI represented, single % used for calc)."
};

export const NAV = [
  { v: 'dashboard', label: 'Dashboard', grp: null },
  { grp: 'Masters' },
  { v: 'companies', label: 'Company' },
  { v: 'assets', label: 'Asset' },
  { v: 'blocks', label: 'Block' },
  { v: 'units', label: 'Unit' },
  { v: 'brands', label: 'Brand' },
  { v: 'users', label: 'User' },
  { grp: 'Leasing & Billing' },
  { v: 'leases', label: 'Leases' },
  { v: 'sales', label: 'Sales (Rev share)' },
  { v: 'invoices', label: 'Invoices' },
  { v: 'collections', label: 'Collections' },
  { grp: 'Rent Disbursement' },
  { v: 'investors', label: 'Investor Units' },
  { v: 'disbursement', label: 'Process Disbursement' },
  { grp: 'Reports' },
  { v: 'reports', label: 'Reports & SAP' },
  { grp: 'Admin' },
  { v: 'deletions', label: 'Pending Deletions' }
];

export const PAGES = {
  dashboard: { t: 'Dashboard', s: 'Portfolio, billing and disbursement at a glance' },
  companies: { t: 'Company Master', s: 'Legal entities that own brands' },
  assets: { t: 'Asset Master', s: 'Properties under management' },
  blocks: { t: 'Block Master', s: 'Wings/blocks within an asset' },
  units: { t: 'Unit Master', s: 'Leasable units with carpet & built-up area' },
  brands: { t: 'Brand Master', s: 'Tenant brands and categories' },
  users: { t: 'User Master', s: 'Panel users and role hierarchy' },
  leases: { t: 'Leases', s: 'Rental structures: MG, revenue share, CAM & utility' },
  sales: { t: 'Sales — Revenue Share', s: "Monthly brand sales that drive revenue-share billing" },
  invoices: { t: 'Invoices', s: 'MG / Rev-share / CAM / Utility & ad-hoc, with e-invoice IRN + QR' },
  collections: { t: 'Collections', s: 'Invoice-wise receipts with TDS and instrument' },
  investors: { t: 'Investor Units', s: "Investor ownership, disbursement % & bank details (maker-checker)" },
  disbursement: { t: 'Process Rent Disbursement', s: 'Monthly disbursement with deductions, TDS, hold & payment' },
  reports: { t: 'Reports & SAP Entry Book', s: 'Disbursement, hold, SD and GL export' },
  deletions: { t: 'Pending Deletions', s: 'Approve or reject deletion requests raised by users' }
};
