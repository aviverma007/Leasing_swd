/* One-shot setup: creates LeasingBillingDB (if missing), runs schema.sql, verifies connection.
   Run from the backend/ folder AFTER filling in .env:  node setup-db.js
   This must run on a machine that can reach your SQL Server (e.g. 192.168.66.33). */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const targetDb = process.env.DB_DATABASE || 'LeasingBillingDB';
const schema = process.env.DB_SCHEMA || 'dbo';
// When using a non-dbo schema, we assume the database ALREADY exists (shared DB)
// and apply the schema-qualified script that does not CREATE DATABASE.
const useExistingDb = schema !== 'dbo';
const schemaFile = useExistingDb ? 'schema_existing_db.sql' : 'schema.sql';

const baseConfig = {
  server: process.env.DB_SERVER || '192.168.66.33',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 1433,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

// Split schema.sql on GO batch separators (mssql can't run multiple batches in one query)
function splitBatches(text) {
  return text
    .split(/^\s*GO\s*$/im)
    .map(s => s.trim())
    .filter(Boolean);
}

async function run() {
  console.log(`\n== Leasing & Billing DB setup ==`);
  console.log(`Server:   ${baseConfig.server}:${baseConfig.port}`);
  console.log(`Database: ${targetDb}`);
  console.log(`User:     ${baseConfig.user || '(not set!)'}\n`);

  if (!baseConfig.user || !baseConfig.password) {
    console.error('ERROR: DB_USER / DB_PASSWORD are not set in .env. Fill them in and re-run.');
    process.exit(1);
  }

  console.log(`Schema:   ${schema}${useExistingDb ? '  (adding to an EXISTING shared database — dbo.* tables are untouched)' : ''}\n`);

  // 1) In dedicated-DB mode, create the target DB if missing.
  //    In shared-DB mode (DB_SCHEMA != dbo), we do NOT create or alter the database.
  if (!useExistingDb) {
    let master;
    try {
      master = await new sql.ConnectionPool({ ...baseConfig, database: 'master' }).connect();
      console.log('✓ Connected to server (master).');
    } catch (e) {
      console.error('✗ Could not connect to the SQL Server. Check that:');
      console.error('  - the server/host and port are correct and reachable from this machine');
      console.error('  - SQL authentication is enabled and the user/password are valid');
      console.error('  - TCP/IP is enabled in SQL Server Configuration Manager');
      console.error('\nUnderlying error:', e.message);
      process.exit(1);
    }
    try {
      await master.request().query(
        `IF DB_ID('${targetDb}') IS NULL BEGIN CREATE DATABASE [${targetDb}]; END`
      );
      console.log(`✓ Database "${targetDb}" is present (created if it did not exist).`);
    } catch (e) {
      console.error(`✗ Failed to create database "${targetDb}":`, e.message);
      await master.close();
      process.exit(1);
    }
    await master.close();
  } else {
    console.log(`• Shared-DB mode: will NOT create/alter the database. Adding [${schema}] schema + its tables only.`);
  }

  // 2) Connect to the target DB and run the schema file batch-by-batch
  const schemaPath = path.join(__dirname, 'sql', schemaFile);
  let schemaSql = fs.readFileSync(schemaPath, 'utf8');
  // strip any CREATE DATABASE / USE prologue — we're already connected to the right DB
  schemaSql = schemaSql.replace(/IF DB_ID\([^)]*\)[\s\S]*?USE \[?LeasingBillingDB\]?;?/i, '');

  const pool = await new sql.ConnectionPool({ ...baseConfig, database: targetDb }).connect();
  console.log(`✓ Connected to "${targetDb}". Applying ${schemaFile}...`);

  const batches = splitBatches(schemaSql);
  let applied = 0;
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      applied++;
    } catch (e) {
      // Ignore "already exists" style errors so the script is idempotent
      if (/already an object named|already exists|There is already/i.test(e.message)) continue;
      console.error('  ! Batch error:', e.message.split('\n')[0]);
    }
  }
  console.log(`✓ Schema applied (${applied} batch(es) processed).`);

  // 3) Verify: list only THIS app's tables (in the configured schema)
  const tables = await pool.request().query(
    `SELECT t.name FROM sys.tables t
     JOIN sys.schemas s ON s.schema_id = t.schema_id
     WHERE s.name = '${schema}'
     ORDER BY t.name`
  );
  console.log(`\n[${schema}] tables now present (${tables.recordset.length}):`);
  tables.recordset.forEach(t => console.log(`   - ${schema}.${t.name}`));

  await pool.close();
  console.log('\n✓ Setup complete. Start the API with:  npm start');
  console.log('  Then open:  http://localhost:' + (process.env.PORT || 5096) + '/api/health');
  console.log('  (Optional) load demo data with:  npm run seed\n');
  process.exit(0);
}

run().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
