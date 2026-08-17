/* Additive import: adds the "Commercial, Sector 89, Gurgaon" project alongside
   existing data. Does NOT touch Orchard Street or any other project.
   Prereqs: backend running, ADMIN creds in .env.
   Run:  node import_sec89.js
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
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

// ---- Verified unit data (carpet/super in sq ft; super area used as Built-up per app convention) ----
const FLOOR_NUM = { G: 0, F: 1, S: 2, T: 3 };
const FLOOR_LABEL = { G: 'Ground Floor', F: 'First Floor', S: 'Second Floor', T: 'Third Floor' };

// Commercial 06 — verified against every printed floor total (exact match)
const C06 = [
  // [name, desc, carpetSqft, superSqft]
  ['G-01','Shop',394.82,939.91], ['G-02','Shop',395.90,847.34], ['G-03','Shop',396.55,843.90],
  ['G-04','Shop',396.55,843.90], ['G-05','Shop',396.55,843.90], ['G-06','Shop',396.55,843.90],
  ['G-07','Shop',396.55,843.90], ['G-08','Shop',372.00,833.35], ['G-09','Kiosk',87.83,2143.33],
  ['G-10','Kiosk',49.30,1288.24],
  ['F-01','Shop',318.08,707.41], ['F-02','Shop',329.49,708.49], ['F-03','Shop',310.00,688.68],
  ['F-04','Shop',327.76,693.20], ['F-05','Shop',327.87,693.20], ['F-06','Shop',327.76,693.20],
  ['F-07','Shop',327.87,693.20], ['F-08','Shop',327.76,693.20], ['F-09','Shop',327.87,693.20],
  ['F-10','Shop',299.89,668.66], ['F-11','Shop',327.01,708.49], ['F-12','Shop',318.29,707.41],
  ['S-01','Shop',361.78,798.04], ['S-02','Shop',241.65,538.85], ['S-03','Shop',255.65,542.51],
  ['S-04','Shop',255.65,542.51], ['S-05','Shop',255.65,542.51], ['S-06','Shop',255.65,542.51],
  ['S-07','Shop',255.65,542.51], ['S-08','Shop',255.65,542.51], ['S-09','Shop',229.81,516.24],
  ['S-10','Shop',348.00,780.17],
  ['T-01','Cafe',274.16,620.65], ['T-02','Cafe',366.08,817.85], ['T-03','Cafe',389.98,843.90],
  ['T-04','Cafe',389.98,843.90], ['T-05','Cafe',370.07,825.60], ['T-06','Cafe',237.56,559.73]
];

// Commercial 08 — verified against every printed floor total (exact match)
const C08 = [
  ['G-01','Shop',593.419,1278.978], ['G-02','Shop',626.895,1345.500],
  ['F-01','Shop',486.210,1056.379], ['F-02','Shop',546.058,1175.752], ['F-03','Shop',231.641,516.284],
  ['S-01','Shop',556.606,1169.832], ['S-01-Terrace','Terrace',0,558.167]
];

async function makeBlockUnits(assetId, blockName, list) {
  const block = await call('POST', '/blocks', { name: blockName, assetId, totalFloors: 4 });
  let n = 0;
  for (const [name, desc, carpet, superA] of list) {
    const prefix = name[0];
    await call('POST', '/units', {
      name: `${blockName} - ${name}`, assetId, blockId: block.id,
      floor: FLOOR_NUM[prefix] ?? 0, carpetArea: carpet, builtupArea: superA, owner: ''
    });
    n++;
  }
  console.log(`✓ ${blockName}: ${n} units created`);
  return n;
}

async function run() {
  try { const h = await call('GET', '/health'); if (!h.ok) throw new Error('health'); }
  catch (e) { console.error('✗ API not reachable — start backend first.\n  ' + e.message); process.exit(1); }
  await login();

  // Reuse existing company if present, else create one
  const companies = await call('GET', '/companies');
  let company = companies.find(c => /smart world/i.test(c.name));
  if (!company) company = await call('POST', '/companies', { name: 'Smart World Developers' });
  console.log('✓ Using company:', company.name);

  const asset = await call('POST', '/assets', { name: 'Commercial, Sector 89, Gurgaon', city: 'Gurgaon' });
  console.log('✓ Project created:', asset.name);

  const n06 = await makeBlockUnits(asset.id, 'Commercial 06', C06);
  const n08 = await makeBlockUnits(asset.id, 'Commercial 08', C08);

  // Commercial 09: floor-total placeholders only (see note) — one summary unit per floor,
  // clearly named, so nothing is silently wrong. Replace with real per-unit rows once confirmed.
  const block09 = await call('POST', '/blocks', { name: 'Commercial 09', assetId: asset.id, totalFloors: 4 });
  const c09FloorTotals = [
    ['Ground Floor (TOTAL — pending unit-level entry)', 0, 3450.992, 7406.342],
    ['First Floor (TOTAL — pending unit-level entry)', 1, 3231.622, 6951.929],
    ['Second Floor (TOTAL — pending unit-level entry)', 2, 2686.479, 5768.944],
    ['Third Floor (TOTAL — pending unit-level entry)', 3, 1099.220, 2275.454]
  ];
  for (const [label, floor, carpet, superA] of c09FloorTotals) {
    await call('POST', '/units', { name: `Commercial 09 - ${label}`, assetId: asset.id, blockId: block09.id, floor, carpetArea: carpet, builtupArea: superA, owner: '' });
  }
  console.log('✓ Commercial 09: 4 floor-total placeholder units created (see note — replace with per-unit rows once confirmed)');

  console.log('\n===== DONE =====');
  console.log({ project: asset.name, blocks: 3, units: n06 + n08 + 4 });
}
run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
