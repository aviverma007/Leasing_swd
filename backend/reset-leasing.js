/* Runs sql/reset_leasing.sql against the configured DB.
   >>> BACK UP SmartDeskApp FIRST — this deletes ALL leasing data. <<<
   Usage:  node reset-leasing.js         (asks for confirmation)
           node reset-leasing.js --yes   (skips the prompt)
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const readline = require('readline');
const { getPool } = require('./db');

async function run() {
  const sqlText = fs.readFileSync(path.join(__dirname, 'sql', 'reset_leasing.sql'), 'utf8');
  const pool = await getPool();

  // split on GO batches (simple)
  const batches = sqlText.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);

  console.log('This will DELETE ALL leasing data (companies, assets, blocks, units,');
  console.log('brands, leases, sales, invoices, collections, investor units, disbursals).');
  console.log('Login users are preserved. dbo.* SmartDesk tables are untouched.\n');

  const proceed = process.argv.includes('--yes');
  if (!proceed) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(res => rl.question("Type 'RESET' to proceed: ", res));
    rl.close();
    if (ans.trim() !== 'RESET') { console.log('Aborted.'); process.exit(0); }
  }

  for (const b of batches) {
    await pool.request().batch(b);
  }
  console.log('\n✓ Leasing data cleared. You can now run: npm run import-real');
  process.exit(0);
}
run().catch(e => { console.error('✗ Reset failed:', e.message); process.exit(1); });
