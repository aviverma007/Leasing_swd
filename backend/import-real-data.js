/* FULL import of Orchard Street leasing data from the Excel, populating the complete
   field set from both sheets ('Latest Customer Data' + 'BRAND Final Data').
   Prereqs: DB reset (npm run reset-leasing), backend running, ADMIN creds in .env,
            import_source.xlsx in this folder, migrations applied (npm run setup-db).
   Run:  npm run import-real
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const XLSX = require('xlsx');

const BASE = `http://localhost:${process.env.PORT || 5096}/api`;
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let TOKEN = '';

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
  TOKEN = r.token; console.log('✓ Logged in as admin');
}

const FLOOR_BLOCK = { 'Ground': 'Ground Floor', '1st': 'First Floor', '2nd': 'Second Floor', '3rd': 'Third Floor' };
const FLOOR_NUM = { 'Ground': 0, '1st': 1, '2nd': 2, '3rd': 3 };

function serialToISO(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  const iso = d.toISOString().slice(0, 10);
  return iso >= '2000-01-01' && iso <= '2100-01-01' ? iso : null;
}
function asDate(v) { return serialToISO(v) || null; }
function asNum(v) { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : null; }
function asStr(v) { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s; }
function normBrand(s) { return String(s || '').toLowerCase().replace(/limited|ltd|salon|pharmacies|pharmacy|by studio.*|\(.*\)|[^a-z0-9]/g, '').trim(); }

function rentParse(v) {
  if (v == null) return { basis: null, mg: 0 };
  const s = String(v).trim();
  if (s === '' || /^self/i.test(s)) return { basis: null, mg: 0 };
  const m = s.match(/^([\d.]+)\s*\/?-?$/);
  if (m) return { basis: 'PerSqFt', mg: parseFloat(m[1]) };
  const digits = s.replace(/[^\d.]/g, '');
  return digits ? { basis: 'PerSqFt', mg: parseFloat(digits) } : { basis: null, mg: 0 };
}

function parseCustomer(wb) {
  const ws = wb.Sheets['Latest Customer Data'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[5];
    if (!name) continue;
    const floorLbl = r[6] ? String(r[6]).trim() : 'Ground';
    const rent = rentParse(r[45]);
    out.push({
      name: String(name).trim(),
      floor: FLOOR_NUM[floorLbl] ?? 0,
      block: FLOOR_BLOCK[floorLbl] || 'Ground Floor',
      super: asNum(r[7]) || 0, carpet: asNum(r[8]) || 0,
      owner: asStr(r[9]) || '', brand: asStr(r[30]) || '', btype: asStr(r[32]) || '',
      basis: rent.basis, mg: rent.mg,
      cust: {
        leasingHod: asStr(r[1]), bookingDate: asDate(r[4]), tcv: asNum(r[10]),
        calledIncludingTax: asNum(r[11]), channelPartner: asStr(r[13]),
        physicalPossessionStatus: asStr(r[15]), handoverStatus: asStr(r[16]),
        customerDocRemarks: asStr(r[21]), availableFor: asStr(r[25]),
        consentStatus: asStr(r[26]), lms: asStr(r[27]), cdStatus: asStr(r[28]),
        cdExecutionDate: asDate(r[29]), loiDate: asDate(r[31]), brandStatus: asStr(r[33]),
        registrationStatus: asStr(r[34]), agreementRegistrationDate: asDate(r[35]),
        agreementStatus: asStr(r[36]), dealStatus: asStr(r[37]), signedAgreementDate: asDate(r[38]),
        agreementConsultant: asStr(r[39]), rmName: asStr(r[40]),
        standardRemarks: asStr(r[44]), detailedRemarks: asStr(r[46])
      }
    });
  }
  return out;
}

function parseBrandTerms(wb) {
  const ws = wb.Sheets['BRAND Final Data'];
  if (!ws) return { byKey: {}, list: [] };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const byKey = {}; const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const brand = r[3];
    if (!brand) continue;
    const name = String(brand).trim();
    const key = normBrand(name);
    if (!key || byKey[key]) continue;
    const terms = {
      name,
      project: asStr(r[2]), unitRef: asStr(r[5]), superArea: asNum(r[4]),
      chequeClearanceDate: asDate(r[6]), loiDate: asDate(r[7]), dealApprovalDate: asDate(r[8]),
      agreementSignedBrand: asStr(r[9]), agreementSignedInvestor: asStr(r[10]),
      agreementRegistrationDate: asDate(r[11]), docLeaseCommencementDate: asDate(r[12]),
      actualHandoverDate: asDate(r[13]), docOperationalDate: asDate(r[14]),
      actualOperationalDate: asDate(r[15]), docRentCommencementDate: asDate(r[16]),
      actualRcdDate: asDate(r[17]), channelPartner: asStr(r[18]), rmName: asStr(r[19]),
      stage: asStr(r[20]), operationalStatus: asStr(r[21]), percentWork: asNum(r[22]),
      loanRs: asNum(r[23]), capex: asNum(r[24]), capexReleased: asNum(r[25]), capexDue: asNum(r[26]),
      tenureYears: asNum(r[27]), lockinMonths: asNum(r[28]), minGuaranteePsf: asNum(r[29]),
      sdRate: asNum(r[30]), sdSchedule: asStr(r[31]), securityDeposit: asNum(r[32]),
      sdDue: asNum(r[33]), sdReceived: asNum(r[34]), sdBalance: asNum(r[35]), sdFutureDue: asNum(r[36]),
      camSchedule: asStr(r[37]), camDeposit: asNum(r[38]), camDue: asNum(r[39]),
      camReceived: asNum(r[40]), camBalance: asNum(r[41]), camFutureDue: asNum(r[42]),
      revenueSharePct: asNum(r[43]), fitoutPeriod: asStr(r[44]), brokerageTerms: asStr(r[45]),
      brokerageDisbursal: asStr(r[46]), brokerageRate: asNum(r[47]), brokerageAmount: asNum(r[48]),
      brokerageDue: asNum(r[49]), brokeragePaid: asNum(r[50]), brokerageBalance: asNum(r[51]),
      futureBrokerage: asNum(r[52]), dealWith: asStr(r[56]), billingRemarks: asStr(r[57]), category: asStr(r[59])
    };
    byKey[key] = terms; list.push(terms);
  }
  return { byKey, list };
}

function loadWorkbook() {
  const file = path.join(__dirname, 'import_source.xlsx');
  if (!fs.existsSync(file)) {
    console.error(`✗ import_source.xlsx not found in ${__dirname}. Copy your Excel there (renamed) and re-run.`);
    process.exit(1);
  }
  return XLSX.readFile(file);
}
function clean(obj) { const o = {}; for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '') o[k] = v; return o; }

async function importReal() {
  const wb = loadWorkbook();
  const units = parseCustomer(wb);
  const { byKey: brandTerms, list: brandList } = parseBrandTerms(wb);
  console.log(`\nParsed ${units.length} units (customer sheet); ${brandList.length} brands (BRAND Final Data).`);

  const company = await call('POST', '/companies', { name: 'Smart World Developers' });
  const asset = await call('POST', '/assets', { name: 'Orchard Street', city: 'Gurgaon' });
  console.log('✓ Company + Asset created');

  const blockByName = {};
  for (const bn of ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor']) {
    const b = await call('POST', '/blocks', { name: bn, assetId: asset.id, totalFloors: 1 });
    blockByName[bn] = b.id;
  }
  console.log('✓ 4 floor-blocks created');

  // ---- Brands: authoritative list from BRAND Final Data (all of them, with terms) ----
  // brand-type comes from the customer sheet where available (by fuzzy name)
  const custType = {};
  for (const u of units) if (u.brand) custType[normBrand(u.brand)] = u.btype || null;
  const CAT = { 'F&B': 'F&B', 'Salon': 'Services', 'Health': 'Services', 'Departmental store': 'Other', 'Bank': 'Services', 'Laundry': 'Services', 'Pharmacy': 'Other' };
  const brandIdByKey = {};
  for (const t of brandList) {
    const btype = custType[normBrand(t.name)] || null;
    const body = clean({
      name: t.name, companyId: company.id,
      category: btype ? (CAT[btype] || 'Other') : (t.category || 'Other'),
      address: 'Orchard Street, Gurgaon',
      brandType: btype,
      ...clean(t)   // all the BRAND Final Data terms onto the brand master
    });
    const b = await call('POST', '/brands', body);
    brandIdByKey[normBrand(t.name)] = b.id;
  }
  // any brand that appears in the customer sheet but NOT in BRAND Final Data — create it too
  for (const u of units) {
    if (!u.brand) continue;
    const k = normBrand(u.brand);
    if (!brandIdByKey[k]) {
      const b = await call('POST', '/brands', clean({ name: u.brand, companyId: company.id, category: CAT[u.btype] || 'Other', address: 'Orchard Street, Gurgaon', brandType: u.btype }));
      brandIdByKey[k] = b.id;
    }
  }
  console.log(`✓ ${Object.keys(brandIdByKey).length} brands created (all from BRAND Final Data + any extra from customer sheet)`);

  // ---- Units (all 109, with owner) from customer sheet ----
  const unitByName = {};
  for (const u of units) {
    const rec = await call('POST', '/units', {
      name: u.name, assetId: asset.id, blockId: blockByName[u.block] || blockByName['Ground Floor'],
      floor: u.floor, carpetArea: u.carpet, builtupArea: u.super, owner: u.owner
    });
    unitByName[u.name] = rec.id;
  }
  console.log(`✓ ${Object.keys(unitByName).length} units created`);

  // ---- Leases: only where a unit has a brand (customer sheet). Terms from brand sheet + customer row ----
  const today = new Date().toISOString().slice(0, 10);
  let made = 0, dated = 0, withFin = 0;
  for (const u of units) {
    if (!u.brand) continue;
    const unitId = unitByName[u.name];
    const brandId = brandIdByKey[normBrand(u.brand)];
    if (!unitId || !brandId) continue;
    const terms = brandTerms[normBrand(u.brand)] || {};
    const startDate = terms.docLeaseCommencementDate || today;
    const months = terms.tenureYears ? Math.round(terms.tenureYears * 12) : 36;
    if (terms.docLeaseCommencementDate) dated++;
    if (terms.securityDeposit || terms.camDeposit) withFin++;
    const body = clean({
      brandId, unitId, startDate, months,
      rentalType: 'MG', mgBasis: u.basis === 'PerSqFt' ? 'PerSqFt' : 'Lumpsum', mg: u.mg || 0,
      revSharePct: terms.revenueSharePct || 0, cam: 0, utility: 0, esc: 0,
      deposit: terms.securityDeposit || 0, gst: 18, brandType: u.btype,
      ...clean(u.cust),
      ...clean(terms),
      minGuaranteePsf: terms.minGuaranteePsf != null ? terms.minGuaranteePsf : (u.basis === 'PerSqFt' ? u.mg : null)
    });
    delete body.name; // terms.name would clash — leases have no name field
    try { await call('POST', '/leases', body); made++; }
    catch (e) { console.log(`   (lease skip ${u.name}/${u.brand}: ${e.message})`); }
  }
  console.log(`✓ ${made} leases created (${dated} with real commencement dates, ${withFin} with SD/CAM financials)`);
  return { company: company.code, asset: asset.code, blocks: 4, brands: Object.keys(brandIdByKey).length, units: Object.keys(unitByName).length, leases: made };
}

async function run() {
  try { const h = await call('GET', '/health'); if (!h.ok) throw new Error('health'); }
  catch (e) { console.error('✗ API not reachable — start backend (npm start).\n  ' + e.message); process.exit(1); }
  await login();
  const existing = await call('GET', '/units').catch(() => []);
  if (existing.length > 0) {
    console.error(`\n✗ ${existing.length} units already exist. Run 'npm run reset-leasing' first for a clean import.`);
    process.exit(1);
  }
  const summary = await importReal();
  console.log('\n===== IMPORT COMPLETE =====');
  console.log(summary);
  console.log('\nOpen the app -> Leases -> edit any lease to see the full field set across the tabs.');
}
run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
