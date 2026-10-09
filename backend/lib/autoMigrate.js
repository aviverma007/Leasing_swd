/* Auto-migration: runs once at backend startup and adds any column the
   application code expects but the database is missing. Every statement is
   guarded by COL_LENGTH, so it is idempotent and safe on every boot.
   This permanently removes the "Invalid column name 'X'" class of errors
   caused by deploying code before its matching SQL was run in SSMS. */
const { LEASE_FIELDS } = require('./leaseFields');

// [table, column, SQL type clause]
const BASE_COLUMNS = [
  // ── Invoices: GST bifurcation + e-invoice fields ──
  ['Invoices', 'CgstAmt', 'DECIMAL(18,2) NOT NULL DEFAULT 0'],
  ['Invoices', 'SgstAmt', 'DECIMAL(18,2) NOT NULL DEFAULT 0'],
  ['Invoices', 'IgstAmt', 'DECIMAL(18,2) NOT NULL DEFAULT 0'],
  ['Invoices', 'HsnCode', 'NVARCHAR(20) NULL'],
  ['Invoices', 'PaymentTermsDays', 'INT NULL DEFAULT 7'],
  ['Invoices', 'PoolGroupId', 'NVARCHAR(40) NULL'],
  ['Invoices', 'AckNo', 'VARCHAR(20) NULL'],
  ['Invoices', 'AckDate', 'DATETIME2 NULL'],
  ['Invoices', 'PlaceOfSupply', 'NVARCHAR(60) NULL'],
  // ── Leases: billing config + governance ──
  ['Leases', 'HsnCode', 'NVARCHAR(20) NULL'],
  ['Leases', 'PaymentTermsDays', 'INT NULL'],
  ['Leases', 'IgstApplicable', 'BIT NOT NULL DEFAULT 0'],
  ['Leases', 'PoolGroupId', 'NVARCHAR(40) NULL'],
  ['Leases', 'AlertsEnabled', 'BIT NOT NULL DEFAULT 1'],
  // ── Collections: SD adjustment ──
  ['Collections', 'SdAdjAmt', 'DECIMAL(18,2) NOT NULL DEFAULT 0'],
  ['Collections', 'SdNote', 'NVARCHAR(300) NULL'],
  // ── Companies / Brands: tax identities ──
  ['Companies', 'PanNo', 'NVARCHAR(20) NULL'],
  ['Companies', 'Gstin', 'NVARCHAR(20) NULL'],
  ['Brands', 'PanNo', 'NVARCHAR(20) NULL'],
  ['Brands', 'Gstin', 'NVARCHAR(20) NULL'],
  // ── Assets: landlord identity + bank + RERA ──
  ['Assets', 'Gstin', 'NVARCHAR(20) NULL'],
  ['Assets', 'PanNo', 'NVARCHAR(20) NULL'],
  ['Assets', 'BankName', 'NVARCHAR(150) NULL'],
  ['Assets', 'BankBranch', 'NVARCHAR(150) NULL'],
  ['Assets', 'BankAcc', 'NVARCHAR(60) NULL'],
  ['Assets', 'BankIfsc', 'NVARCHAR(20) NULL'],
  ['Assets', 'BankMicr', 'NVARCHAR(20) NULL'],
  ['Assets', 'LandlordName', 'NVARCHAR(300) NULL'],
  ['Assets', 'LandlordAddress', 'NVARCHAR(500) NULL'],
  ['Assets', 'ReraNo', 'NVARCHAR(100) NULL'],
  ['Assets', 'OcStatus', 'NVARCHAR(50) NULL'],
  // ── Units: detail fields from the commercial working file ──
  ['Units', 'UnitType', 'NVARCHAR(30) NULL'],
  ['Units', 'Plc', 'NVARCHAR(80) NULL'],
  ['Units', 'CoveredArea', 'DECIMAL(18,2) NULL']
];

// Every extended lease field from leaseFields.js is also ensured, so a new
// entry there never needs a hand-run ALTER again.
function leaseFieldClause(f) {
  const [, , type, len] = f;
  if (type === 'date') return 'DATE NULL';
  if (type === 'dec') return 'DECIMAL(18,2) NULL';
  if (type === 'int') return 'INT NULL';
  return `NVARCHAR(${len || 200}) NULL`;
}

async function autoMigrate(pool, sql, SCHEMA) {
  const columns = [
    ...BASE_COLUMNS,
    ...LEASE_FIELDS.map(f => ['Leases', f[1], leaseFieldClause(f)])
  ];
  let added = 0, failed = 0;
  for (const [table, col, clause] of columns) {
    try {
      const r = await pool.request().query(
        `SELECT COL_LENGTH('${SCHEMA}.${table}','${col}') AS len`);
      if (r.recordset[0].len == null) {
        await pool.request().query(
          `ALTER TABLE ${SCHEMA}.${table} ADD ${col} ${clause}`);
        console.log(`[autoMigrate] added ${SCHEMA}.${table}.${col}`);
        added++;
      }
    } catch (e) {
      failed++;
      console.error(`[autoMigrate] ${SCHEMA}.${table}.${col}: ${e.message}`);
    }
  }
  // Settings key-value table
  try {
    await pool.request().query(`IF OBJECT_ID('${SCHEMA}.Settings','U') IS NULL
      CREATE TABLE ${SCHEMA}.Settings (
        Id VARCHAR(40) PRIMARY KEY, SettingKey NVARCHAR(100) NOT NULL,
        Value NVARCHAR(MAX) NULL, UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME())`);
  } catch (e) { failed++; console.error('[autoMigrate] Settings table:', e.message); }
  // Sensible backfills for rows created before the columns existed
  try {
    await pool.request().query(`UPDATE ${SCHEMA}.Leases SET HsnCode='997212' WHERE HsnCode IS NULL;
      UPDATE ${SCHEMA}.Leases SET PaymentTermsDays=7 WHERE PaymentTermsDays IS NULL;
      UPDATE ${SCHEMA}.Invoices SET PlaceOfSupply='HARYANA' WHERE PlaceOfSupply IS NULL;`);
  } catch (e) { /* non-fatal */ }
  console.log(`[autoMigrate] schema check complete — ${added} column(s) added${failed ? `, ${failed} failed` : ''}.`);
}

module.exports = { autoMigrate };
