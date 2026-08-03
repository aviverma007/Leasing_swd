/* Import real Orchard Street leasing data from the Excel, replacing TEST data.
   Prereqs: backend running (npm start), ADMIN_ID/ADMIN_PASSWORD in .env,
            openpyxl-parsed parsed_units.json present (regenerated below if missing).
   Run:  node import-real-data.js
   Steps: 1) log in as admin  2) delete all [TEST] records  3) create masters + units + leases
*/
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = `http://localhost:${process.env.PORT || 5096}/api`;
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let TOKEN = '';

// ---- parse the Excel ('Latest Customer Data' sheet) into unit records ----
const FLOOR_BLOCK = { 'Ground': 'Ground Floor', '1st': 'First Floor', '2nd': 'Second Floor', '3rd': 'Third Floor' };
const FLOOR_NUM = { 'Ground': 0, '1st': 1, '2nd': 2, '3rd': 3 };

function rentParse(v) {
  if (v === null || v === undefined) return { basis: null, mg: 0, note: '' };
  const s = String(v).trim();
  if (s === '') return { basis: null, mg: 0, note: '' };
  if (/^self/i.test(s)) return { basis: null, mg: 0, note: 'self-use' };
  const m = s.match(/^([\d.]+)\s*\/?-?$/);
  if (m) return { basis: 'PerSqFt', mg: parseFloat(m[1]), note: '' };
  const digits = s.replace(/[^\d.]/g, '');
  if (digits) return { basis: 'PerSqFt', mg: parseFloat(digits), note: '' };
  return { basis: null, mg: 0, note: s };
}

// Excel serial date -> ISO
function serialToISO(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  const iso = d.toISOString().slice(0, 10);
  return iso >= '2000-01-01' && iso <= '2100-01-01' ? iso : null;
}
// normalize a brand name for fuzzy matching
function normBrand(s) {
  return String(s || '').toLowerCase()
    .replace(/limited|ltd|salon|pharmacies|pharmacy|by studio.*|\(.*\)|[^a-z0-9]/g, '')
    .trim();
}
// Parse 'BRAND Final Data' -> { normalizedBrand: { start, months } }
function parseBrandTerms(wb) {
  const ws = wb.Sheets['BRAND Final Data'];
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const brand = r[3];
    if (!brand) continue;
    const start = serialToISO(r[12]);        // As Per Document Lease Commencement Date
    const tenureYrs = typeof r[27] === 'number' ? r[27] : null;
    const months = tenureYrs ? Math.round(tenureYrs * 12) : null;
    const key = normBrand(brand);
    if (!key) continue;
    if (!map[key] || (start && !map[key].start)) {
      map[key] = { start: start || (map[key] && map[key].start) || null, months: months || (map[key] && map[key].months) || null };
    }
  }
  return map;
}

function parseExcel() {
  const file = path.join(__dirname, 'import_source.xlsx');
  if (!fs.existsSync(file)) {
    console.error(`✗ import_source.xlsx not found in ${__dirname}.`);
    console.error('  Place the leasing Excel there and rename it to import_source.xlsx, then re-run.');
    process.exit(1);
  }
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets['Latest Customer Data'];
  if (!ws) { console.error("✗ Sheet 'Latest Customer Data' not found."); process.exit(1); }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // header is row 0; data from row 1. Columns (0-based): 5=Unit,6=Floor,7=Super,8=Carpet,9=Owner,30=Brand,32=BrandType,45=Rent
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[5];
    if (!name) continue;
    const floorLbl = r[6] ? String(r[6]).trim() : 'Ground';
    const rent = rentParse(r[45]);
    out.push({
      name: String(name).trim(),
      floor_lbl: floorLbl,
      floor: FLOOR_NUM[floorLbl] ?? 0,
      block: FLOOR_BLOCK[floorLbl] || 'Ground Floor',
      super: r[7] ? Math.round(Number(r[7]) * 100) / 100 : 0,
      carpet: r[8] ? Math.round(Number(r[8]) * 100) / 100 : 0,
      owner: r[9] ? String(r[9]).trim() : '',
      brand: r[30] ? String(r[30]).trim() : '',
      btype: r[32] ? String(r[32]).trim() : '',
      basis: rent.basis, mg: rent.mg, note: rent.note
    });
  }
  const brandTerms = parseBrandTerms(wb);
  return { units: out, brandTerms };
}

async function call(method, p, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} -> ${data.error || res.status}`);
  return data;
}

async function login() {
  if (!ADMIN_PASSWORD) { console.error('✗ ADMIN_PASSWORD not set in .env'); process.exit(1); }
  const r = await call('POST', '/auth/login', { username: ADMIN_ID, password: ADMIN_PASSWORD });
  TOKEN = r.token;
  console.log('✓ Logged in as admin');
}

// ---- delete all [TEST] records, in FK-safe order ----
async function clearTest() {
  console.log('\nClearing [TEST] data...');
  const isTest = (s) => typeof s === 'string' && s.includes('[TEST]');

  // disbursals: void then (admin) delete not supported; they cascade via investor unit delete guard.
  // Order: sales -> collections -> invoices -> leases -> investor units -> brands -> units -> blocks -> assets -> companies -> users
  const steps = [
    ['sales', '/sales', (x, db) => isTest(brandNameForLease(db, x.leaseId))],
  ];

  // Simpler & robust: pull everything, then delete by [TEST] markers with dependency order.
  const [companies, assets, blocks, units, brands, users, leases, sales, invoices, collections, investorUnits, disbursals] =
    await Promise.all(['companies','assets','blocks','units','brands','users','leases','sales','invoices','collections','investor-units','disbursement']
      .map(p => call('GET', '/' + p).catch(() => [])));

  const testBrandIds = new Set(brands.filter(b => isTest(b.name)).map(b => b.id));
  const testUnitIds = new Set(units.filter(u => isTest(u.name)).map(u => u.id));
  const testLeaseIds = new Set(leases.filter(l => testBrandIds.has(l.brandId) || testUnitIds.has(l.unitId)).map(l => l.id));

  let n = 0;
  // sales for test leases
  for (const s of sales) if (testLeaseIds.has(s.leaseId)) { await del('/sales/' + s.id); n++; }
  // collections for invoices of test leases
  const testInvoiceIds = new Set(invoices.filter(i => testLeaseIds.has(i.leaseId) || testBrandIds.has(i.brandId)).map(i => i.id));
  for (const c of collections) if (testInvoiceIds.has(c.invoiceId)) { await del('/collections/' + c.id); n++; }
  // invoices
  for (const i of invoices) if (testInvoiceIds.has(i.id)) { await del('/invoices/' + i.id); n++; }
  // investor units (delete disbursal-linked ones may be blocked; try void first is out of scope — just try)
  for (const iv of investorUnits) {
    const anyTestInvestor = (iv.investors || []).some(x => isTest(x.name));
    if (anyTestInvestor || testUnitIds.has(iv.unitId)) { try { await del('/investor-units/' + iv.id); n++; } catch (e) { console.log('   (skip investor unit ' + iv.code + ': ' + e.message + ')'); } }
  }
  // leases
  for (const l of leases) if (testLeaseIds.has(l.id)) { try { await del('/leases/' + l.id); n++; } catch (e) { console.log('   (skip lease ' + l.code + ': ' + e.message + ')'); } }
  // brands
  for (const b of brands) if (testBrandIds.has(b.id)) { await del('/brands/' + b.id); n++; }
  // units
  for (const u of units) if (testUnitIds.has(u.id)) { try { await del('/units/' + u.id); n++; } catch (e) { console.log('   (skip unit ' + u.code + ': ' + e.message + ')'); } }
  // blocks (test blocks)
  for (const b of blocks) if (isTest(b.name)) { try { await del('/blocks/' + b.id); n++; } catch (e) {} }
  // assets
  for (const a of assets) if (isTest(a.name)) { try { await del('/assets/' + a.id); n++; } catch (e) {} }
  // companies
  for (const c of companies) if (isTest(c.name)) { try { await del('/companies/' + c.id); n++; } catch (e) {} }
  // users
  for (const u of users) if (isTest(u.email)) { try { await del('/users/' + u.id); n++; } catch (e) {} }

  console.log(`✓ Removed ${n} [TEST] record(s)`);
}
function brandNameForLease() { return ''; }
async function del(p) { return call('DELETE', p); } // admin -> immediate delete

// ---- import real data ----
async function importReal() {
  const { units, brandTerms } = parseExcel();
  console.log(`\nImporting ${units.length} units from Orchard Street...`);
  console.log(`  (loaded real lease terms for ${Object.keys(brandTerms).length} brand(s) from 'BRAND Final Data')`);

  // 1) Company
  const company = await call('POST', '/companies', { name: 'Smart World Developers' });
  console.log('✓ Company:', company.code);

  // 2) Asset
  const asset = await call('POST', '/assets', { name: 'Orchard Street', city: 'Gurgaon' });
  console.log('✓ Asset:', asset.code);

  // 3) Blocks (floors)
  const blockDefs = [['Ground Floor', 0], ['First Floor', 1], ['Second Floor', 2], ['Third Floor', 3]];
  const blockByName = {};
  for (const [bn, fl] of blockDefs) {
    const b = await call('POST', '/blocks', { name: bn, assetId: asset.id, totalFloors: 1 });
    blockByName[bn] = b.id;
  }
  console.log('✓ Blocks:', Object.keys(blockByName).join(', '));

  // 4) Brands (distinct, with type -> category mapping)
  const CAT = { 'F&B': 'F&B', 'Salon': 'Services', 'Health': 'Services', 'Departmental store': 'Other', 'Bank': 'Services', 'Laundry': 'Services', 'Pharmacy': 'Other' };
  const brandInfo = {};
  for (const u of units) if (u.brand) brandInfo[u.brand] = brandInfo[u.brand] || (u.btype || 'Other');
  const brandByName = {};
  for (const [bname, btype] of Object.entries(brandInfo)) {
    const b = await call('POST', '/brands', { name: bname, companyId: company.id, category: CAT[btype] || 'Other', regularAddress: '', address: 'Orchard Street, Gurgaon' });
    brandByName[bname] = b.id;
  }
  console.log(`✓ Brands: ${Object.keys(brandByName).length}`);

  // 5) Units (all 109, with owner + areas + status)
  const unitByName = {};
  let created = 0;
  for (const u of units) {
    const rec = await call('POST', '/units', {
      name: u.name, assetId: asset.id, blockId: blockByName[u.block] || blockByName['Ground Floor'],
      floor: u.floor, carpetArea: u.carpet, builtupArea: u.super, owner: u.owner
    });
    unitByName[u.name] = rec.id;
    created++;
  }
  console.log(`✓ Units: ${created}`);

  // 6) Leases for units that have a brand
  let leasesMade = 0, selfUse = 0, zeroRent = 0, datedLeases = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const u of units) {
    if (!u.brand) continue;
    const unitId = unitByName[u.name];
    const brandId = brandByName[u.brand];
    if (!unitId || !brandId) continue;
    // real terms from BRAND Final Data (fuzzy brand match); fall back to defaults
    const terms = brandTerms[normBrand(u.brand)] || {};
    const startDate = terms.start || today;
    const months = terms.months || 36;
    if (terms.start) datedLeases++;
    const body = {
      brandId, unitId, startDate, months,
      rentalType: 'MG',
      mgBasis: u.basis === 'PerSqFt' ? 'PerSqFt' : 'Lumpsum',
      mg: u.mg || 0,
      revSharePct: 0, cam: 0, utility: 0, esc: 0, deposit: 0, gst: 18
    };
    try {
      await call('POST', '/leases', body);
      leasesMade++;
      if (u.note === 'self-use') selfUse++;
      if (!u.mg) zeroRent++;
    } catch (e) {
      console.log(`   (lease skip ${u.name}/${u.brand}: ${e.message})`);
    }
  }
  console.log(`✓ Leases: ${leasesMade} (${datedLeases} with real commencement dates/tenure, ${selfUse} self-use, ${zeroRent} with 0 rent to fill)`);

  return { company, asset, blocks: Object.keys(blockByName).length, brands: Object.keys(brandByName).length, units: created, leases: leasesMade };
}

async function run() {
  try { const h = await call('GET', '/health'); if (!h.ok) throw new Error('health'); }
  catch (e) { console.error('✗ API not reachable — start backend (npm start).\n  ' + e.message); process.exit(1); }
  await login();
  await clearTest();
  const summary = await importReal();
  console.log('\n===== IMPORT COMPLETE =====');
  console.log(summary);
  console.log('\nSign in and review. Rent (₹/sq ft) is set where the Excel had a value; blanks/self-use leases were created at 0 so you can fill them in.');
}
run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
