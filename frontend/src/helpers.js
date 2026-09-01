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
    fields: [
      { k: 'name', l: 'Company name', req: 1, ph: 'Vertex Retail Ventures Pvt Ltd' },
      { k: 'panNo', l: 'PAN', ph: 'AABCT1332L' },
      { k: 'gstin', l: 'GSTIN', ph: '07AABCT1332L1ZS' }
    ],
    head: ['Code', 'Company', 'PAN', 'GSTIN'],
    cols: (r) => [r.code, r.name, r.panNo || '—', r.gstin || '—']
  },
  assets: {
    sing: 'Project',
    fields: [
      { k: 'name', l: 'Asset name', req: 1, ph: 'Gems-2 Commercial, Sec-89' },
      { k: 'city', l: 'City', ph: 'Gurugram' },
      { k: 'reraNo', l: 'RERA registration no', ph: 'RERA for GEMS-2 - 85 of 2024' },
      { k: 'ocStatus', l: 'OC status', type: 'select', opts: ['', 'OC Received', 'OC Applied', 'OC Pending'] },
      { k: 'landlordName', l: 'Landlord / Developer name', ph: 'Smart World Developers Pvt Ltd' },
      { k: 'landlordAddress', l: 'Landlord registered address', type: 'textarea', ph: 'Plot No.xxx, Sec-89, Gurugram, Haryana 122004' },
      { k: 'gstin', l: 'Landlord GSTIN', ph: '06AABCS1234M1ZX' },
      { k: 'panNo', l: 'Landlord PAN', ph: 'AABCS1234M' },
      { k: 'bankName', l: 'Bank name', ph: 'HDFC Bank' },
      { k: 'bankBranch', l: 'Branch', ph: 'Sector-14, Gurugram' },
      { k: 'bankAcc', l: 'Account number', ph: '50100XXXXXXXXXX' },
      { k: 'bankIfsc', l: 'IFSC code', ph: 'HDFC0001234' },
      { k: 'bankMicr', l: 'MICR code', ph: '110240029' }
    ],
    head: ['Code', 'Project', 'City', 'GSTIN'],
    cols: (r) => [r.code, r.name, r.city || '—', r.gstin || '—']
  },
  blocks: {
    sing: 'Block',
    fields: [{ k: 'name', l: 'Block name', req: 1, ph: 'North Wing' }, { k: 'assetId', l: 'Project', req: 1, ref: 'assets' }, { k: 'totalFloors', l: 'Total floors', type: 'number', ph: '4' }],
    head: ['Code', 'Block', 'Project', 'Floors'],
    cols: (r, db) => [r.code, r.name, nameOf(db.assets, r.assetId), `${r.totalFloors || 0} floors`]
  },
  units: {
    sing: 'Unit',
    fields: [
      { k: 'name', l: 'Unit name / no', req: 1, ph: 'N-101' },
      { k: 'assetId', l: 'Project', req: 1, ref: 'assets' },
      { k: 'blockId', l: 'Block', req: 1, ref: 'blocks' },
      { k: 'floor', l: 'Floor', type: 'number', ph: '1' },
      { k: 'unitType', l: 'Unit type', type: 'select', opts: ['', 'SHOP', 'KIOSK', 'CAFÉ', 'ANCHOR', 'OFFICE', 'OTHER'] },
      { k: 'plc', l: 'PLC (location/facing)', ph: 'Front Facing / Corner' },
      { k: 'carpetArea', l: 'Carpet area (sq ft)', type: 'number', ph: '2200' },
      { k: 'coveredArea', l: 'Covered area (sq ft)', type: 'number', ph: '2400' },
      { k: 'builtupArea', l: 'Super/Built-up area (sq ft)', type: 'number', ph: '2600' },
      { k: 'owner', l: 'Owner (customer)', ph: 'Unit owner name' }
    ],
    head: ['Code', 'Unit', 'Type', 'PLC', 'Carpet', 'Covered', 'Super', 'Status'],
    cols: (r, db) => [r.code, r.name, r.unitType || '—', r.plc || '—', (+r.carpetArea || 0).toLocaleString('en-IN'), (+r.coveredArea || 0).toLocaleString('en-IN'), (+r.builtupArea || 0).toLocaleString('en-IN'), r.status]
  },
  brands: {
    sing: 'Brand',
    fields: [
      { k: 'name', l: 'Brand name', req: 1, ph: 'Brewhouse Cafe' },
      { k: 'companyId', l: 'Company', req: 1, ref: 'companies' },
      { k: 'panNo', l: 'Brand PAN', ph: 'AABCB1234L' },
      { k: 'gstin', l: 'Brand GSTIN', ph: '06AABCB1234L1ZX' },
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
    head: ['Code', 'Brand', 'Company', 'Projects', 'Type', 'Stage', 'Tenure', 'SD (₹)'],
    cols: (r, db) => {
      const projectNames = [...new Set((db.leases || [])
        .filter((l) => l.brandId === r.id)
        .map((l) => { const u = findById(db.units, l.unitId); const a = u && findById(db.assets, u.assetId); return a?.name; })
        .filter(Boolean))];
      return [r.code, r.name, nameOf(db.companies, r.companyId), projectNames.length ? projectNames.join(', ') : '—',
        r.brandType || r.category || '—', r.stage || '—', r.tenureYears ? r.tenureYears + ' yr' : '—',
        r.securityDeposit ? (+r.securityDeposit).toLocaleString('en-IN') : '—'];
    }
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
  { v: 'assets', label: 'Projects' },
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
  { v: 'reportcenter', label: 'Report Center (Excel)' },
  { v: 'gstrecon', label: 'GST Reconciliation' },
  { v: 'tdsrecon', label: 'TDS Reconciliation' },
  { v: 'agreementrecon', label: 'Agreement Recon' },
  { v: 'sdrecon', label: 'SD Reconciliation' },
  { grp: 'Admin' },
  { v: 'deletions', label: 'Pending Deletions' }
];

export const PAGES = {
  dashboard: { t: 'Dashboard', s: 'Portfolio, billing and disbursement at a glance' },
  inventory: { t: 'Inventory', s: 'Units by project, block and floor with occupancy status' },
  companies: { t: 'Company Master', s: 'Legal entities that own brands' },
  assets: { t: 'Project Master', s: 'Properties under management' },
  blocks: { t: 'Block Master', s: 'Wings/blocks within an asset' },
  units: { t: 'Unit Master', s: 'Leasable units with carpet & built-up area' },
  brands: { t: 'Brand Master', s: 'Tenant brands, categories and the project(s) each operates in' },
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
  reportcenter: { t: 'Report Center', s: 'Download every report as an Excel workbook (.xlsx)' },
  gstrecon: { t: 'GST Reconciliation', s: 'CGST / SGST / IGST invoiced vs collected, month-wise' },
  tdsrecon: { t: 'TDS Reconciliation', s: 'TDS deducted on collections — for Form 26Q / 27Q' },
  agreementrecon: { t: 'Agreement Reconciliation', s: 'Lease terms vs actual billing per brand and unit' },
  sdrecon: { t: 'Security Deposit Reconciliation', s: 'SD agreed, collected, adjusted and balance per lease' },
  deletions: { t: 'Pending Deletions', s: 'Approve or reject deletion requests raised by users' }
};
