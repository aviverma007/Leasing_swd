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
      { k: 'builtupArea', l: 'Built-up area (sq ft)', type: 'number', ph: '2600' },
      { k: 'owner', l: 'Owner (customer)', ph: 'Unit owner name' }
    ],
    head: ['Code', 'Unit', 'Asset', 'Owner', 'Carpet', 'Built-up', 'Status'],
    cols: (r, db) => [r.code, r.name, nameOf(db.assets, r.assetId), r.owner || '—', (+r.carpetArea || 0).toLocaleString('en-IN'), (+r.builtupArea || 0).toLocaleString('en-IN'), r.status]
  },
  brands: {
    sing: 'Brand',
    fields: [
      { k: 'name', l: 'Brand name', req: 1, ph: 'Brewhouse Cafe' },
      { k: 'companyId', l: 'Company', req: 1, ref: 'companies' },
      { k: 'category', l: 'Brand category', type: 'select', opts: CATEGORIES },
      { k: 'brandType', l: 'Brand type', type: 'select', opts: ['', 'F&B', 'Salon', 'Health', 'Bank', 'Pharmacy', 'Laundry', 'Departmental store', 'Other'] },
      { k: 'unitRef', l: 'Unit ref (from deal sheet)', ph: 'e.g. G-06 & G-07' },
      { k: 'stage', l: 'Stage', type: 'select', opts: ['', 'Fitout', 'Not Fitting Out', 'Operational', 'Deal Cancelled', 'Direct'] },
      { k: 'tenureYears', l: 'Tenure (yrs)', type: 'number' },
      { k: 'lockinMonths', l: 'Lock-in (months)', type: 'number' },
      { k: 'minGuaranteePsf', l: 'Min guarantee (₹/sq ft)', type: 'number' },
      { k: 'securityDeposit', l: 'Security deposit (₹)', type: 'number' },
      { k: 'docLeaseCommencementDate', l: 'Lease commencement date', type: 'date' },
      { k: 'brokerageTerms', l: 'Brokerage terms', ph: 'e.g. 1 month rent' },
      { k: 'dealWith', l: 'Deal with', ph: 'Counterparty' },
      { k: 'regularAddress', l: 'Registered address', type: 'textarea', ph: 'Registered office address' },
      { k: 'address', l: 'Site / correspondence address', type: 'textarea', ph: 'Store address at asset' },
      { k: 'billingRemarks', l: 'Remarks', type: 'textarea' }
    ],
    head: ['Code', 'Brand', 'Company', 'Type', 'Stage', 'Tenure', 'SD (₹)'],
    cols: (r, db) => [r.code, r.name, nameOf(db.companies, r.companyId), r.brandType || r.category || '—', r.stage || '—', r.tenureYears ? r.tenureYears + ' yr' : '—', r.securityDeposit ? (+r.securityDeposit).toLocaleString('en-IN') : '—']
  },
  users: {
    sing: 'User',
    fields: [
      { k: 'email', l: 'Email address', req: 1, ph: 'finance@scoopsense.io' },
      { k: 'password', l: 'Password', type: 'password', ph: 'Leave blank to keep unchanged' },
      { k: 'role', l: 'Role in hierarchy', type: 'select', opts: ROLES },
      { k: 'active', l: 'Status', type: 'select', opts: ['Active', 'Inactive'] }
    ],
    head: ['Code', 'Email', 'Role', 'Status', 'Password'],
    cols: (r) => [r.code, r.email, r.role, r.active, r.pwdChangedAt ? ('Set · ' + new Date(r.pwdChangedAt).toLocaleDateString('en-GB')) : 'Set (legacy)']
  }
};

export const RENTAL_TYPES = [
  ['MG', 'MG only (lumpsum / per sq ft)'],
  ['MGvsRS', 'MG or Rev-share, whichever higher'],
  ['PureRS', 'Pure revenue share'],
  ['VarRS', 'Variable rev-share (slabs)']
];
export const RENTAL_HINT = {
  MG: "Bills MG each period. MG = lumpsum, or ₹/sq ft × built-up area.",
  MGvsRS: "Bills MG; when revenue share for the month exceeds MG, the excess is billed as a top-up.",
  PureRS: "No MG. Bills revenue share % of the month's entered sales.",
  VarRS: "Slab-based revenue share — enter sales; % applies (slab UI represented, single % used for calc)."
};

export const NAV = [
  { v: 'dashboard', label: 'Dashboard', grp: null },
  { v: 'inventory', label: 'Inventory' },
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
  { v: 'collectionmaster', label: 'Collection Master' },
  { grp: 'Rent Disbursement' },
  { v: 'investors', label: 'Investor Units' },
  { v: 'investoraccounts', label: 'Investor Accounts' },
  { v: 'disbursement', label: 'Process Disbursement' },
  { grp: 'Reports' },
  { v: 'reports', label: 'Reports & SAP' },
  { grp: 'Admin' },
  { v: 'deletions', label: 'Pending Deletions' }
];

export const PAGES = {
  dashboard: { t: 'Dashboard', s: 'Portfolio, billing and disbursement at a glance' },
  inventory: { t: 'Inventory', s: 'Units by project, block and floor with occupancy status' },
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
  collectionmaster: { t: 'Collection Master', s: 'Invoiced, collected and outstanding — reconciled per brand & unit' },
  investors: { t: 'Investor Units', s: "Investor ownership, disbursement % & bank details (maker-checker)" },
  investoraccounts: { t: 'Investor Accounts', s: 'Rent collected, distributed and pending per investor' },
  disbursement: { t: 'Process Rent Disbursement', s: 'Monthly disbursement with deductions, TDS, hold & payment' },
  reports: { t: 'Reports & SAP Entry Book', s: 'Disbursement, hold, SD and GL export' },
  deletions: { t: 'Pending Deletions', s: 'Approve or reject deletion requests raised by users' }
};
