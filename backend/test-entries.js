/* Inserts a few clearly-labelled TEST entries by calling the running API.
   The backend must be running first (npm start).
   Run with:  node test-entries.js
   Every record name is prefixed with [TEST] so you can spot and delete them easily. */

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
  console.log(`\nCreating TEST entries via ${BASE} ...\n`);

  // 1) health check so we fail fast with a clear message
  try {
    const h = await call('GET', '/health');
    if (!h.ok) throw new Error('health not ok');
  } catch (e) {
    console.error('✗ Could not reach the API. Start the backend first with:  npm start');
    console.error('  (' + e.message + ')');
    process.exit(1);
  }
  await login();

  // 2) Company -> Asset -> Block -> Unit -> Brand
  const company = await call('POST', '/companies', { name: '[TEST] Acme Holdings Pvt Ltd' });
  console.log('✓ Company :', company.code, company.name);

  const asset = await call('POST', '/assets', { name: '[TEST] Sunrise Plaza', city: 'Gurgaon' });
  console.log('✓ Asset   :', asset.code, asset.name);

  const block = await call('POST', '/blocks', { name: '[TEST] East Block', assetId: asset.id, totalFloors: 5 });
  console.log('✓ Block   :', block.code, block.name);

  const unit = await call('POST', '/units', {
    name: '[TEST] E-101', assetId: asset.id, blockId: block.id, floor: 1, carpetArea: 1800, builtupArea: 2100
  });
  console.log('✓ Unit    :', unit.code, unit.name, `(${unit.status})`);

  const brand = await call('POST', '/brands', {
    name: '[TEST] Cafe Aurora', companyId: company.id, category: 'F&B',
    regularAddress: 'Reg office, Gurgaon', address: 'Store at Sunrise Plaza'
  });
  console.log('✓ Brand   :', brand.code, brand.name);

  // 3) A lease on that unit (MG on carpet area)
  const lease = await call('POST', '/leases', {
    brandId: brand.id, unitId: unit.id, startDate: new Date().toISOString().slice(0, 10),
    months: 36, rentalType: 'MG', mgBasis: 'PerSqFt', mg: 75, revSharePct: 8,
    cam: 20, utility: 12, esc: 5, deposit: 500000, gst: 18
  });
  console.log('✓ Lease   :', lease.code, '->', brand.name, 'in', unit.name);

  // 4) Generate this month's invoices for that lease
  const ym = new Date().toISOString().slice(0, 7);
  const gen = await call('POST', '/invoices/generate', { ym, scope: lease.id });
  console.log(`✓ Invoices: ${gen.count} generated for ${ym}`);

  console.log('\nDone. Open the app (http://localhost:96) — the new rows are prefixed with [TEST].');
  console.log('To remove them later, just delete the [TEST] rows from the UI, or drop the leasing.* rows.\n');
}

run().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
