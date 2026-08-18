/* Import "Gems 2 / Adhikaansh" project (Commercial 06, 08, 09 at Sec-89, Gurgaon)
   from the digital area-statement Excel. SAFE BY DEFAULT: runs as a dry-run report
   unless you pass --write. Reuses any existing company/project matching
   "adhikaansh"/"gems" (case-insensitive) instead of creating a duplicate, and reuses
   blocks matching the block number (06/08/09) under that project.

   Run:  node import_gems2.js            (report only — writes nothing)
         node import_gems2.js --write    (actually creates/updates records)
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const BASE = `http://localhost:${process.env.PORT || 5096}/api`;
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const WRITE = process.argv.includes('--write');
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
  if (!ADMIN_PASSWORD) { console.error('X ADMIN_PASSWORD not set in .env'); process.exit(1); }
  const r = await call('POST', '/auth/login', { username: ADMIN_ID, password: ADMIN_PASSWORD });
  TOKEN = r.token; console.log('OK - logged in as admin');
}

// ---- Verified unit data: [unitCode, description, carpetAreaSqft, superAreaSqft] ----
// Commercial 06 — cross-checked against every printed floor total (exact match)
const C06 = [
  ['G-01','SHOP',394.82,939.91], ['G-02','SHOP',395.9,847.34], ['G-03','SHOP',396.55,843.9],
  ['G-04','SHOP',396.55,843.9], ['G-05','SHOP',396.55,843.9], ['G-06','SHOP',396.55,843.9],
  ['G-07','SHOP',396.55,843.9], ['G-08','SHOP',372.0,833.35], ['G-09','KIOSK',87.83,2143.33],
  ['G-10','KIOSK',49.3,1288.24],
  ['F-01','SHOP',318.08,707.41], ['F-02','SHOP',329.49,708.49], ['F-03','SHOP',310.0,688.68],
  ['F-04','SHOP',327.76,693.2], ['F-05','SHOP',327.87,693.2], ['F-06','SHOP',327.76,693.2],
  ['F-07','SHOP',327.87,693.2], ['F-08','SHOP',327.76,693.2], ['F-09','SHOP',327.87,693.2],
  ['F-10','SHOP',299.89,668.66], ['F-11','SHOP',327.01,708.49], ['F-12','SHOP',318.29,707.41],
  ['S-01','SHOP',361.78,798.04], ['S-02','SHOP',241.65,538.85], ['S-03','SHOP',255.64,542.51],
  ['S-04','SHOP',255.64,542.51], ['S-05','SHOP',255.64,542.51], ['S-06','SHOP',255.64,542.51],
  ['S-07','SHOP',255.64,542.51], ['S-08','SHOP',255.64,542.51], ['S-09','SHOP',229.81,516.24],
  ['S-10','SHOP',348.0,780.17],
  ['T-01','CAFÉ',274.16,620.65], ['T-02','CAFÉ',366.08,817.85], ['T-03','CAFÉ',389.98,843.9],
  ['T-04','CAFÉ',389.98,843.9], ['T-05','CAFÉ',370.07,825.6], ['T-06','CAFÉ',237.56,559.73]
];

// Commercial 08 — using the UPDATED "AS/ACTUAL OC" table (areas revised due to land
// issues at site, per the sheet's own note), not the original sanctioned/RERA figures.
const C08 = [
  ['G-01','SHOP',471.68,1022.36], ['G-02','SHOP',582.66,1238.94],
  ['F-01','SHOP',471.68,1022.36], ['F-02','SHOP',547.67,1163.16], ['F-03','SHOP',231.64,514.3],
  ['S-01','SHOP',537.45,1132.59]
];

// Commercial 09 — 46 units total (each Third-floor cafe's terrace area is merged into
// that cafe's own super area, since a terrace is not a separately leasable unit).
const C09 = [
  ['G-01','SHOP',325.72,713.37], ['G-02','SHOP',317.22,672.99], ['G-03','SHOP',317.22,668.44],
  ['G-04','SHOP',317.22,668.44], ['G-05','SHOP',317.22,668.44], ['G-06','SHOP',317.22,668.44],
  ['G-07','SHOP',315.22,680.31], ['G-08','SHOP',250.26,572.73], ['G-09','SHOP',148.97,329.38],
  ['G-10','SHOP',202.04,430.34], ['G-11','SHOP',207.75,442.4], ['G-12','SHOP',207.75,442.4],
  ['G-14','SHOP',207.21,448.64],
  ['F-01','SHOP',262.21,579.1], ['F-02','SHOP',255.0,540.14], ['F-03','SHOP',255.0,540.14],
  ['F-04','SHOP',255.0,540.14], ['F-05','SHOP',255.0,540.14], ['F-06','SHOP',255.0,540.14],
  ['F-07','SHOP',253.49,549.93], ['F-08','SHOP',308.28,685.67], ['F-09','SHOP',148.97,329.38],
  ['F-10','SHOP',202.04,430.34], ['F-11','SHOP',207.75,442.4], ['F-12','SHOP',207.75,442.4],
  ['F-14','SHOP',207.21,444.12], ['F-15','SHOP',158.93,347.89],
  ['S-01','SHOP',241.33,534.54], ['S-02','SHOP',234.55,497.3], ['S-03','SHOP',234.55,497.3],
  ['S-04','SHOP',234.55,497.3], ['S-05','SHOP',234.55,497.3], ['S-06','SHOP',234.55,497.3],
  ['S-07','SHOP',233.15,506.34], ['S-08','SHOP',111.62,250.59], ['S-09','SHOP',169.75,364.04],
  ['S-10','SHOP',199.56,425.18], ['S-11','SHOP',199.89,426.25], ['S-12','SHOP',199.46,427.55],
  ['S-14','SHOP',158.98,347.98],
  ['T-01','CAFÉ',109.15,556.61], ['T-02','CAFÉ',168.67,690.3], ['T-03','CAFÉ',198.6,751.44],
  ['T-04','CAFÉ',198.92,752.52], ['T-05','CAFÉ',198.92,752.52], ['T-06','CAFÉ',224.97,862.41]
];

const BLOCKS = { 'Commercial 06': C06, 'Commercial 08': C08, 'Commercial 09': C09 };
const MATCH = /adhikaansh|gems/i;

async function run() {
  try { const h = await call('GET', '/health'); if (!h.ok) throw new Error('health'); }
  catch (e) { console.error('X API not reachable - start the backend first.\n  ' + e.message); process.exit(1); }
  await login();

  console.log(WRITE ? '\n=== WRITE MODE — changes will be saved ===' : '\n=== DRY RUN — nothing will be written (pass --write to apply) ===');

  const companies = await call('GET', '/companies');
  const assets = await call('GET', '/assets');
  const blocksAll = await call('GET', '/blocks');
  const unitsAll = await call('GET', '/units');

  const matchedCompanies = companies.filter((c) => MATCH.test(c.name));
  const matchedAssets = assets.filter((a) => MATCH.test(a.name));

  console.log(`\nFound ${matchedCompanies.length} existing company(ies) matching "adhikaansh/gems":`);
  matchedCompanies.forEach((c) => console.log('   -', c.code, c.name));
  console.log(`Found ${matchedAssets.length} existing project(s) matching "adhikaansh/gems":`);
  matchedAssets.forEach((a) => console.log('   -', a.code, a.name));

  if (matchedAssets.length > 1) {
    console.error('\nX Multiple matching projects found — please tell me which one to use before I proceed.');
    process.exit(1);
  }

  let company = matchedCompanies[0];
  if (!company) {
    console.log(WRITE ? '\n-> Will CREATE company: Adhikaansh Realtors Pvt. Ltd.' : '\n-> Would CREATE company: Adhikaansh Realtors Pvt. Ltd.');
    if (WRITE) company = await call('POST', '/companies', { name: 'Adhikaansh Realtors Pvt. Ltd.' });
  } else {
    console.log('\n-> Reusing existing company:', company.name);
  }

  let asset = matchedAssets[0];
  if (!asset) {
    const projName = 'Gems 2 (Adhikaansh Realtors Pvt. Ltd.)';
    console.log(WRITE ? `-> Will CREATE project: ${projName}` : `-> Would CREATE project: ${projName}`);
    if (WRITE) asset = await call('POST', '/assets', { name: projName, city: 'Gurgaon' });
  } else {
    console.log('-> Reusing existing project:', asset.name);
  }

  const existingBlocksForAsset = asset ? blocksAll.filter((b) => b.assetId === asset.id) : [];
  let totalCreated = 0, totalUpdated = 0, totalUnchanged = 0;

  for (const [blockName, rows] of Object.entries(BLOCKS)) {
    const digits = blockName.match(/\d+/)[0];
    let block = existingBlocksForAsset.find((b) => b.name.includes(digits));
    if (!block) {
      console.log(`\n${WRITE ? 'CREATE' : 'Would create'} block: ${blockName}`);
      if (WRITE && asset) block = await call('POST', '/blocks', { name: blockName, assetId: asset.id, totalFloors: 4 });
    } else {
      console.log(`\nReusing block: ${block.name} (matched "${digits}")`);
    }

    const existingUnits = block ? unitsAll.filter((u) => u.blockId === block.id) : [];
    let created = 0, updated = 0, unchanged = 0;

    for (const [rawName, desc, carpet, superA] of rows) {
      const unitName = `${blockName} - ${rawName}`;
      const floorPrefix = rawName[0];
      const floorNum = { G: 0, F: 1, S: 2, T: 3 }[floorPrefix] ?? 0;
      const existing = existingUnits.find((u) => u.name === unitName || u.name === rawName);

      if (!existing) {
        created++;
        if (WRITE && asset && block) {
          await call('POST', '/units', { name: unitName, assetId: asset.id, blockId: block.id, floor: floorNum, carpetArea: carpet, builtupArea: superA, owner: '' });
        }
      } else {
        const changed = Math.abs((+existing.carpetArea || 0) - carpet) > 0.5 || Math.abs((+existing.builtupArea || 0) - superA) > 0.5;
        if (changed) {
          updated++;
          if (WRITE) await call('PUT', `/units/${existing.id}`, { name: existing.name, assetId: existing.assetId, blockId: existing.blockId, floor: existing.floor, carpetArea: carpet, builtupArea: superA, owner: existing.owner || '' });
        } else unchanged++;
      }
    }
    console.log(`   ${blockName}: ${rows.length} units in source -> ${created} to create, ${updated} to update (area changed), ${unchanged} unchanged`);
    totalCreated += created; totalUpdated += updated; totalUnchanged += unchanged;
  }

  console.log('\n===== SUMMARY =====');
  console.log({ mode: WRITE ? 'WRITE (applied)' : 'DRY RUN (nothing written)', unitsToCreate: totalCreated, unitsToUpdate: totalUpdated, unitsUnchanged: totalUnchanged });
  if (!WRITE) console.log('\nIf this looks right, re-run with:  node import_gems2.js --write   to apply it.');
}
run().catch((e) => { console.error('\nX Error:', e.message); process.exit(1); });
