const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
/* Full end-to-end TEST data covering EVERY module, via the running API.
   Backend must be running (npm start). Run:  node test-entries-full.js
   All records are prefixed [TEST] so they are easy to find and remove.

   Flow built:
     Company -> Asset -> Block -> Units -> Brands -> Users
     -> Leases (MG, MG-vs-RS, Pure RS)
     -> Sales (for the rev-share leases)
     -> Invoices generated for last month + this month
     -> Collections against last month's invoices (so rent is "received")
     -> Investor Unit (approved, maker-checker)
     -> Disbursement processed for last month (uses the collected rent)
*/

const BASE = `http://localhost:${process.env.PORT || 5096}/api`;
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let TOKEN = '';

async function call(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${data.error || res.status}`);
  return data;
}

const iso = (d) => d.toISOString().slice(0, 10);
function ymOffset(months) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return iso(d).slice(0, 7);
}

async function login() {
  if (!ADMIN_PASSWORD) {
    console.error('✗ ADMIN_PASSWORD is not set in .env — cannot authenticate to seed data.');
    process.exit(1);
  }
  try {
    const r = await call('POST', '/auth/login', { username: ADMIN_ID, password: ADMIN_PASSWORD });
    TOKEN = r.token;
  } catch (e) {
    console.error('✗ Admin login failed:', e.message);
    console.error('  Check ADMIN_ID / ADMIN_PASSWORD in .env match your login.');
    process.exit(1);
  }
}

async function run() {
  console.log(`\nCreating FULL test data via ${BASE} ...\n`);

  try {
    const h = await call('GET', '/health');
    if (!h.ok) throw new Error('health not ok');
  } catch (e) {
    console.error('✗ Could not reach the API. Start the backend first with:  npm start');
    console.error('  (' + e.message + ')');
    process.exit(1);
  }
  await login();

  const thisYm = ymOffset(0);
  const lastYm = ymOffset(-1);

  /* ---------- Masters ---------- */
  const company = await call('POST', '/companies', { name: '[TEST] Acme Holdings Pvt Ltd' });
  console.log('Company :', company.code, company.name);

  const company2 = await call('POST', '/companies', { name: '[TEST] Bluewave Hospitality LLP' });
  console.log('Company :', company2.code, company2.name);

  const asset = await call('POST', '/assets', { name: '[TEST] Sunrise Plaza', city: 'Gurgaon' });
  console.log('Asset   :', asset.code, asset.name);

  const block = await call('POST', '/blocks', { name: '[TEST] East Block', assetId: asset.id, totalFloors: 5 });
  console.log('Block   :', block.code, block.name);

  const unitA = await call('POST', '/units', { name: '[TEST] E-101', assetId: asset.id, blockId: block.id, floor: 1, carpetArea: 1800, builtupArea: 2100 });
  const unitB = await call('POST', '/units', { name: '[TEST] E-102', assetId: asset.id, blockId: block.id, floor: 1, carpetArea: 1200, builtupArea: 1450 });
  const unitC = await call('POST', '/units', { name: '[TEST] E-201', assetId: asset.id, blockId: block.id, floor: 2, carpetArea: 2600, builtupArea: 3000 });
  console.log('Units   :', unitA.code, unitB.code, unitC.code);

  const brandA = await call('POST', '/brands', { name: '[TEST] Cafe Aurora', companyId: company2.id, category: 'F&B', regularAddress: 'Reg office, Gurgaon', address: 'Store at Sunrise Plaza' });
  const brandB = await call('POST', '/brands', { name: '[TEST] Trendline Apparel', companyId: company.id, category: 'Fashion', regularAddress: 'Reg office, Delhi', address: 'Store at Sunrise Plaza' });
  const brandC = await call('POST', '/brands', { name: '[TEST] GadgetHub', companyId: company.id, category: 'Electronics', regularAddress: 'Reg office, Noida', address: 'Store at Sunrise Plaza' });
  console.log('Brands  :', brandA.code, brandB.code, brandC.code);

  const user = await call('POST', '/users', { email: '[TEST] finance.test@acme.io', password: 'ChangeMe@123', role: 'Finance Head', active: 'Active' });
  console.log('User    :', user.code, user.email);

  /* ---------- Leases (one of each rental type) ---------- */
  const leaseMG = await call('POST', '/leases', {
    brandId: brandA.id, unitId: unitA.id, startDate: iso(new Date(new Date().setMonth(new Date().getMonth() - 3))),
    months: 36, rentalType: 'MG', mgBasis: 'PerSqFt', mg: 90, revSharePct: 0, cam: 20, utility: 12, esc: 5, deposit: 500000, gst: 18
  });
  const leaseMGvsRS = await call('POST', '/leases', {
    brandId: brandB.id, unitId: unitB.id, startDate: iso(new Date(new Date().setMonth(new Date().getMonth() - 3))),
    months: 24, rentalType: 'MGvsRS', mgBasis: 'Lumpsum', mg: 120000, revSharePct: 10, cam: 18, utility: 10, esc: 5, deposit: 360000, gst: 18
  });
  const leasePureRS = await call('POST', '/leases', {
    brandId: brandC.id, unitId: unitC.id, startDate: iso(new Date(new Date().setMonth(new Date().getMonth() - 3))),
    months: 36, rentalType: 'PureRS', mgBasis: 'Lumpsum', mg: 0, revSharePct: 12, cam: 18, utility: 10, esc: 0, deposit: 600000, gst: 18
  });
  console.log('Leases  :', leaseMG.code, '(MG)', leaseMGvsRS.code, '(MG-vs-RS)', leasePureRS.code, '(Pure RS)');

  /* ---------- Sales for the rev-share leases (last & this month) ---------- */
  for (const ym of [lastYm, thisYm]) {
    await call('POST', '/sales', { leaseId: leaseMGvsRS.id, ym, amount: 2000000 });
    await call('POST', '/sales', { leaseId: leasePureRS.id, ym, amount: 3500000 });
  }
  console.log('Sales   : entered for MG-vs-RS and Pure-RS leases (', lastYm, '&', thisYm, ')');

  /* ---------- Generate invoices for last & this month (all TEST leases) ---------- */
  for (const ym of [lastYm, thisYm]) {
    for (const l of [leaseMG, leaseMGvsRS, leasePureRS]) {
      await call('POST', '/invoices/generate', { ym, scope: l.id });
    }
  }
  console.log('Invoices: generated for', lastYm, '&', thisYm);

  /* ---------- Collect last month's MG/RevShare invoices (so rent is received) ---------- */
  const invoices = await call('GET', '/invoices');
  const testLeaseIds = new Set([leaseMG.id, leaseMGvsRS.id, leasePureRS.id]);
  const lastMonthRentInvs = invoices.filter(i =>
    testLeaseIds.has(i.leaseId) && i.ym === lastYm && ['MG', 'RevShare'].includes(i.type) && i.status !== 'Paid'
  );
  let collected = 0;
  for (const inv of lastMonthRentInvs) {
    const bal = inv.balance ?? (inv.total - (inv.paid || 0));
    await call('POST', '/collections', {
      invoiceId: inv.id, date: lastYm + '-15', amount: bal, tdsPct: 2, instrument: 'NEFT', ref: 'UTR' + inv.no.replace(/\W/g, '')
    });
    collected++;
  }
  console.log('Collect : captured', collected, 'rent receipt(s) for', lastYm);

  /* ---------- Investor Unit on unit A (single 100% investor), then approve ---------- */
  const iu = await call('POST', '/investor-units', {
    unitId: unitA.id, floor: 1, actingRole: 'Leasing Head',
    investors: [{
      name: '[TEST] Horizon Capital', areaPct: 100, disbursePct: 100, start: iso(new Date()),
      gst: true, nri: false, bankName: 'HDFC Bank', acc: '5521XXXX7788', ifsc: 'HDFC0000123'
    }]
  });
  await call('POST', `/investor-units/${iu.id}/approve`, { actingRole: 'Finance Head' });
  console.log('Investor:', iu.code, '(Horizon Capital) — approved');

  /* ---------- Process disbursement for last month (uses collected rent on unit A) ---------- */
  const cand = await call('GET', `/disbursement/candidates?ym=${lastYm}`);
  const target = (cand.pending || []).find(c => c.investorUnitId === iu.id && !c.holdReason);
  if (target) {
    const rent = Math.round(target.rentShare);
    await call('POST', '/disbursement/process', {
      investorUnitId: iu.id, invIdx: target.invIdx, month: lastYm, rentGross: rent,
      deductions: { brokerage: 0, mgmtFee: Math.round(rent * 0.02), fitout: 0, stampDuty: 0, camVacant: 0, other: 0 },
      tdsPct: 2, outstanding: 0, mode: 'NEFT', ref: 'TESTUTR001', narration: '', remarks: '[TEST] auto', actingRole: 'Finance Head'
    });
    console.log('Disburse: processed for', lastYm, '— rent share ₹' + rent);
  } else {
    console.log('Disburse: no ready candidate (rent may not have been collected) — skipped');
  }

  console.log('\n✓ Full test data created. Open the app (http://localhost:96):');
  console.log('  Companies, Units, Brands, Leases, Sales, Invoices, Collections, Investor Units,');
  console.log('  and Process Disbursement (pick month ' + lastYm + ') all now have [TEST] rows.\n');
}

run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
