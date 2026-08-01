/* Bulk TEST data — populates 3-4+ records in EVERY tab, via the running API.
   Backend must be running (npm start).  Run:  node test-bulk.js
   All records are prefixed [TEST] so they are easy to find and remove.

   Creates:
     4 Companies, 3 Assets, 4 Blocks, 8 Units, 5 Brands, 3 Users
     6 Leases (mix of MG / MG-vs-RS / Pure RS)
     Sales for rev-share leases (last & this month)
     Invoices for last & this month
     Collections against last month's rent invoices
     3 Investor Units (approved)
     Disbursements for last month where rent was collected
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
const monthsAgoDate = (m) => iso(new Date(new Date().setMonth(new Date().getMonth() - m)));
function ymOffset(months) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months); return iso(d).slice(0, 7); }

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
  console.log(`\nCreating BULK test data via ${BASE} ...\n`);
  try { const h = await call('GET', '/health'); if (!h.ok) throw new Error('health not ok'); }
  catch (e) { console.error('✗ API not reachable — start the backend (npm start) first.\n  ' + e.message); process.exit(1); }
  await login();

  const thisYm = ymOffset(0), lastYm = ymOffset(-1);
  const start3 = monthsAgoDate(3);

  /* ---------- Companies (4) ---------- */
  const companies = [];
  for (const n of ['Acme Holdings Pvt Ltd', 'Bluewave Hospitality LLP', 'Northstar Retail Pvt Ltd', 'Vertex Ventures Pvt Ltd']) {
    companies.push(await call('POST', '/companies', { name: `[TEST] ${n}` }));
  }
  console.log('Companies:', companies.map(c => c.code).join(', '));

  /* ---------- Assets (3) ---------- */
  const assets = [];
  for (const [n, city] of [['Sunrise Plaza', 'Gurgaon'], ['Lakeview Mall', 'Pune'], ['Metro Square', 'Mumbai']]) {
    assets.push(await call('POST', '/assets', { name: `[TEST] ${n}`, city }));
  }
  console.log('Assets   :', assets.map(a => a.code).join(', '));

  /* ---------- Blocks (4) ---------- */
  const blocks = [];
  const blockDefs = [['East Block', 0, 5], ['West Block', 0, 4], ['North Wing', 1, 3], ['Main Block', 2, 6]];
  for (const [n, ai, fl] of blockDefs) {
    blocks.push(await call('POST', '/blocks', { name: `[TEST] ${n}`, assetId: assets[ai].id, totalFloors: fl }));
  }
  console.log('Blocks   :', blocks.map(b => b.code).join(', '));

  /* ---------- Units (8) ---------- */
  const units = [];
  const unitDefs = [
    ['E-101', 0, 0, 1, 1800, 2100], ['E-102', 0, 0, 1, 1200, 1450], ['E-201', 0, 0, 2, 2600, 3000],
    ['W-101', 0, 1, 1, 1500, 1800], ['W-102', 0, 1, 1, 900, 1080],
    ['N-101', 1, 2, 1, 3200, 3700], ['N-102', 1, 2, 1, 1100, 1300],
    ['M-101', 2, 3, 1, 5200, 6100]
  ];
  for (const [n, ai, bi, fl, ca, ba] of unitDefs) {
    units.push(await call('POST', '/units', { name: `[TEST] ${n}`, assetId: assets[ai].id, blockId: blocks[bi].id, floor: fl, carpetArea: ca, builtupArea: ba }));
  }
  console.log('Units    :', units.map(u => u.code).join(', '));

  /* ---------- Brands (5) ---------- */
  const brands = [];
  const brandDefs = [
    ['Cafe Aurora', 1, 'F&B'], ['Trendline Apparel', 0, 'Fashion'], ['GadgetHub', 2, 'Electronics'],
    ['FreshMart Hyper', 3, 'Hypermarket'], ['UrbanFit Studio', 0, 'Services']
  ];
  for (const [n, ci, cat] of brandDefs) {
    brands.push(await call('POST', '/brands', { name: `[TEST] ${n}`, companyId: companies[ci].id, category: cat, regularAddress: 'Reg office', address: 'Store address' }));
  }
  console.log('Brands   :', brands.map(b => b.code).join(', '));

  /* ---------- Users (3) ---------- */
  const users = [];
  const userDefs = [
    ['leasing.test@acme.io', 'Leasing Head'], ['manager.test@acme.io', 'Manager'], ['portfolio.test@acme.io', 'Center/Portfolio Head']
  ];
  for (const [email, role] of userDefs) {
    users.push(await call('POST', '/users', { email: `[TEST] ${email}`, password: 'ChangeMe@123', role, active: 'Active' }));
  }
  console.log('Users    :', users.map(u => u.code).join(', '));

  /* ---------- Leases (6, mixed types) ---------- */
  const L = (brand, unit, o) => call('POST', '/leases', {
    brandId: brand.id, unitId: unit.id, startDate: start3, months: o.months,
    rentalType: o.type, mgBasis: o.basis, mg: o.mg, revSharePct: o.rs || 0,
    cam: o.cam, utility: o.util, esc: o.esc || 0, deposit: o.dep, gst: 18
  });
  const leases = [];
  leases.push(await L(brands[0], units[0], { months: 36, type: 'MG', basis: 'PerSqFt', mg: 90, cam: 20, util: 12, esc: 5, dep: 500000 }));
  leases.push(await L(brands[1], units[1], { months: 24, type: 'MGvsRS', basis: 'Lumpsum', mg: 120000, rs: 10, cam: 18, util: 10, esc: 5, dep: 360000 }));
  leases.push(await L(brands[2], units[2], { months: 36, type: 'PureRS', basis: 'Lumpsum', mg: 0, rs: 12, cam: 18, util: 10, dep: 600000 }));
  leases.push(await L(brands[3], units[5], { months: 60, type: 'MG', basis: 'PerSqFt', mg: 75, cam: 22, util: 14, esc: 5, dep: 1400000 }));
  leases.push(await L(brands[4], units[3], { months: 24, type: 'MGvsRS', basis: 'Lumpsum', mg: 95000, rs: 9, cam: 16, util: 9, esc: 5, dep: 300000 }));
  leases.push(await L(brands[0], units[7], { months: 36, type: 'PureRS', basis: 'Lumpsum', mg: 0, rs: 14, cam: 20, util: 12, dep: 800000 }));
  console.log('Leases   :', leases.map(l => l.code).join(', '));

  /* ---------- Sales for rev-share leases (last & this month) ---------- */
  const rsLeaseAmts = [[leases[1], 2000000], [leases[2], 3500000], [leases[4], 1400000], [leases[5], 4200000]];
  for (const ym of [lastYm, thisYm]) {
    for (const [l, amt] of rsLeaseAmts) await call('POST', '/sales', { leaseId: l.id, ym, amount: amt });
  }
  console.log('Sales    : entered for 4 rev-share leases (', lastYm, '&', thisYm, ')');

  /* ---------- Invoices for last & this month ---------- */
  for (const ym of [lastYm, thisYm]) {
    for (const l of leases) await call('POST', '/invoices/generate', { ym, scope: l.id });
  }
  console.log('Invoices : generated for', lastYm, '&', thisYm);

  /* ---------- Collections against last month's MG/RevShare invoices ---------- */
  const invoices = await call('GET', '/invoices');
  const leaseIds = new Set(leases.map(l => l.id));
  const toCollect = invoices.filter(i => leaseIds.has(i.leaseId) && i.ym === lastYm && ['MG', 'RevShare'].includes(i.type) && i.status !== 'Paid');
  let collected = 0;
  for (const inv of toCollect) {
    const bal = inv.balance ?? (inv.total - (inv.paid || 0));
    await call('POST', '/collections', { invoiceId: inv.id, date: lastYm + '-15', amount: bal, tdsPct: 2, instrument: 'NEFT', ref: 'UTR' + inv.no.replace(/\W/g, '') });
    collected++;
  }
  console.log('Collect  : captured', collected, 'rent receipt(s) for', lastYm);

  /* ---------- Investor Units (3, approved) ---------- */
  const iuDefs = [
    { unit: units[0], floor: 1, investors: [{ name: 'Horizon Capital', areaPct: 100, disbursePct: 100, gst: true, nri: false, bankName: 'HDFC Bank', acc: '5521XXXX7788', ifsc: 'HDFC0000123' }] },
    { unit: units[5], floor: 1, investors: [
      { name: 'Coastline Holdings', areaPct: 60, disbursePct: 60, gst: true, nri: false, bankName: 'Axis Bank', acc: '9182XXXX2290', ifsc: 'UTIB0001234' },
      { name: 'R. Kapoor (NRI)', areaPct: 40, disbursePct: 40, gst: false, nri: true, bankName: 'ICICI Bank', acc: '7735XXXX4821', ifsc: 'ICIC0000112' }
    ] },
    { unit: units[2], floor: 2, investors: [{ name: 'Meridian Trust', areaPct: 100, disbursePct: 100, gst: true, nri: false, bankName: 'SBI', acc: '2290XXXX1102', ifsc: 'SBIN0000456' }] }
  ];
  const investorUnits = [];
  for (const d of iuDefs) {
    const iu = await call('POST', '/investor-units', {
      unitId: d.unit.id, floor: d.floor, actingRole: 'Leasing Head',
      investors: d.investors.map(x => ({ ...x, name: '[TEST] ' + x.name, start: monthsAgoDate(12) }))
    });
    await call('POST', `/investor-units/${iu.id}/approve`, { actingRole: 'Finance Head' });
    investorUnits.push(iu);
  }
  console.log('Investors:', investorUnits.map(i => i.code).join(', '), '(approved)');

  /* ---------- Disbursements for last month (where rent was collected) ---------- */
  const cand = await call('GET', `/disbursement/candidates?ym=${lastYm}`);
  let disbursed = 0;
  for (const c of (cand.pending || [])) {
    if (c.holdReason) continue;
    const rent = Math.round(c.rentShare);
    if (rent <= 0) continue;
    await call('POST', '/disbursement/process', {
      investorUnitId: c.investorUnitId, invIdx: c.invIdx, month: lastYm, rentGross: rent,
      deductions: { brokerage: 0, mgmtFee: Math.round(rent * 0.02), fitout: 0, stampDuty: 0, camVacant: 0, other: 0 },
      tdsPct: c.nri ? 31.2 : 2, outstanding: 0, mode: 'NEFT', ref: 'TESTUTR' + (disbursed + 1), narration: '', remarks: '[TEST] auto', actingRole: 'Finance Head'
    });
    disbursed++;
  }
  console.log('Disburse : processed', disbursed, 'voucher(s) for', lastYm);

  console.log('\n✓ Bulk test data created. Sign in and browse — every tab now has [TEST] rows.');
  console.log('  Note: on "Process Disbursement", set the month picker to ' + lastYm + ' to see the vouchers.\n');
}

run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
