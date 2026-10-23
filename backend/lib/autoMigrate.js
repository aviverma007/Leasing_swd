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
  ['Units', 'CoveredArea', 'DECIMAL(18,2) NULL'],
  // ── v3: separated masters & lifecycle ──
  ['Units', 'CustomerId', 'VARCHAR(40) NULL'],
  ['Leases', 'RenewedToId', 'VARCHAR(40) NULL'],
  ['Leases', 'ExitDate', 'DATE NULL'],
  ['Leases', 'BrokerId', 'VARCHAR(40) NULL'],
  ['Leases', 'LifecycleStage', "VARCHAR(30) NOT NULL DEFAULT 'Active'"],
  ['Brands', 'LesseeCompanyNote', 'NVARCHAR(300) NULL'],
  // ── v4: maker–checker workflow on documents ──
  ...['Invoices', 'Leases', 'Collections', 'CreditNotes'].flatMap(t => [
    [t, 'DocStatus', 'VARCHAR(20) NULL'],
    [t, 'SubmittedBy', 'NVARCHAR(150) NULL'],
    [t, 'SubmittedAt', 'DATETIME2 NULL'],
    [t, 'ApprovedBy', 'NVARCHAR(150) NULL'],
    [t, 'ApprovedAt', 'DATETIME2 NULL'],
    [t, 'RejectReason', 'NVARCHAR(400) NULL'],
    [t, 'CreatedBy', 'NVARCHAR(150) NULL'],
    [t, 'CreatedAt', 'DATETIME2 NULL']
  ])
];

// v3 tables — created when missing (idempotent)
const TABLES = [
  ['Customers', `CREATE TABLE {S}.Customers(
      Id VARCHAR(40) PRIMARY KEY,
      Code VARCHAR(20) UNIQUE NOT NULL,
      Name NVARCHAR(250) NOT NULL,
      CustType VARCHAR(20) NOT NULL DEFAULT 'Individual',
      PanNo NVARCHAR(20) NULL, Gstin NVARCHAR(20) NULL,
      Phone NVARCHAR(30) NULL, Email NVARCHAR(150) NULL,
      Address NVARCHAR(500) NULL,
      BankName NVARCHAR(150) NULL, BankAcc NVARCHAR(60) NULL, BankIfsc NVARCHAR(20) NULL,
      Nri BIT NOT NULL DEFAULT 0, Remarks NVARCHAR(500) NULL,
      Active VARCHAR(20) NOT NULL DEFAULT 'Active')`],
  ['Brokers', `CREATE TABLE {S}.Brokers(
      Id VARCHAR(40) PRIMARY KEY,
      Code VARCHAR(20) UNIQUE NOT NULL,
      Name NVARCHAR(250) NOT NULL,
      Firm NVARCHAR(250) NULL, PanNo NVARCHAR(20) NULL, Gstin NVARCHAR(20) NULL,
      Phone NVARCHAR(30) NULL, Email NVARCHAR(150) NULL,
      ReraNo NVARCHAR(100) NULL, Remarks NVARCHAR(500) NULL,
      Active VARCHAR(20) NOT NULL DEFAULT 'Active')`],
  ['CreditNotes', `CREATE TABLE {S}.CreditNotes(
      Id VARCHAR(40) PRIMARY KEY,
      No VARCHAR(20) UNIQUE NOT NULL,
      InvoiceId VARCHAR(40) NOT NULL,
      NoteType VARCHAR(10) NOT NULL DEFAULT 'Credit',
      NoteDate DATE NOT NULL,
      Amount DECIMAL(18,2) NOT NULL,
      GstAmt DECIMAL(18,2) NOT NULL DEFAULT 0,
      Total DECIMAL(18,2) NOT NULL,
      Reason NVARCHAR(400) NULL,
      CreatedBy NVARCHAR(150) NULL)`],
  ['LeaseDocs', `CREATE TABLE {S}.LeaseDocs(
      Id VARCHAR(40) PRIMARY KEY,
      LeaseId VARCHAR(40) NOT NULL,
      DocType NVARCHAR(60) NULL,
      FileName NVARCHAR(300) NOT NULL,
      StoredName NVARCHAR(300) NOT NULL,
      SizeBytes BIGINT NULL,
      UploadedBy NVARCHAR(150) NULL,
      UploadedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME())`],
  ['RoleProfiles', `CREATE TABLE {S}.RoleProfiles(
      Id VARCHAR(40) PRIMARY KEY,
      Name NVARCHAR(100) UNIQUE NOT NULL,
      AccessJson NVARCHAR(MAX) NOT NULL,
      CanApprove BIT NOT NULL DEFAULT 0,
      BuiltIn BIT NOT NULL DEFAULT 0)`],
  ['LeaseSettlements', `CREATE TABLE {S}.LeaseSettlements(
      Id VARCHAR(40) PRIMARY KEY,
      LeaseId VARCHAR(40) NOT NULL,
      ExitDate DATE NOT NULL,
      SdHeld DECIMAL(18,2) NOT NULL DEFAULT 0,
      Outstanding DECIMAL(18,2) NOT NULL DEFAULT 0,
      DeductionsJson NVARCHAR(MAX) NULL,
      TotalDeductions DECIMAL(18,2) NOT NULL DEFAULT 0,
      NetRefund DECIMAL(18,2) NOT NULL DEFAULT 0,
      Remarks NVARCHAR(500) NULL,
      CreatedBy NVARCHAR(150) NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME())`],
  ['Comments', `CREATE TABLE {S}.Comments(
      Id VARCHAR(40) PRIMARY KEY,
      EntityType VARCHAR(30) NOT NULL,
      EntityId VARCHAR(40) NOT NULL,
      Author NVARCHAR(150) NULL,
      Body NVARCHAR(2000) NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME())`],
  ['AuditLog', `CREATE TABLE {S}.AuditLog(
      Id VARCHAR(40) PRIMARY KEY,
      EntityType VARCHAR(30) NOT NULL,
      EntityId VARCHAR(40) NOT NULL,
      Action VARCHAR(30) NOT NULL,
      Detail NVARCHAR(MAX) NULL,
      ByUser NVARCHAR(150) NULL,
      At DATETIME2 NOT NULL DEFAULT SYSDATETIME());
      CREATE INDEX IX_AuditLog_Entity ON {S}.AuditLog(EntityType, EntityId)`],
  ['LeaseStageLog', `CREATE TABLE {S}.LeaseStageLog(
      Id VARCHAR(40) PRIMARY KEY,
      LeaseId VARCHAR(40) NOT NULL,
      FromStage VARCHAR(30) NULL,
      ToStage VARCHAR(30) NOT NULL,
      ChangedBy NVARCHAR(150) NULL,
      Remarks NVARCHAR(400) NULL,
      ChangedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME())`]
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
  // v3 tables
  for (const [name, ddl] of TABLES) {
    try {
      const r = await pool.request().query(`SELECT OBJECT_ID('${SCHEMA}.${name}','U') AS oid`);
      if (r.recordset[0].oid == null) {
        await pool.request().query(ddl.replace(/\{S\}/g, SCHEMA));
        console.log(`[autoMigrate] created table ${SCHEMA}.${name}`);
        added++;
      }
    } catch (e) { failed++; console.error(`[autoMigrate] table ${SCHEMA}.${name}:`, e.message); }
  }
  // Seed role profiles from the static matrix (once; Admin locked as BuiltIn full-access)
  try {
    const cnt = await pool.request().query(`SELECT COUNT(*) c FROM ${SCHEMA}.RoleProfiles`);
    if (cnt.recordset[0].c === 0) {
      const { ACCESS, APPROVER_ROLES } = require('./permissions');
      for (const [name, acc] of Object.entries(ACCESS)) {
        await pool.request()
          .input('id', 'rp-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
          .input('n', name)
          .input('j', JSON.stringify(acc))
          .input('ap', APPROVER_ROLES.includes(name) ? 1 : 0)
          .input('bi', name === 'Admin' ? 1 : 0)
          .query(`INSERT INTO ${SCHEMA}.RoleProfiles (Id,Name,AccessJson,CanApprove,BuiltIn) VALUES (@id,@n,@j,@ap,@bi)`);
      }
      console.log('[autoMigrate] seeded role profiles from the static access matrix');
    }
  } catch (e) { failed++; console.error('[autoMigrate] role seed:', e.message); }

  // One-time: promote free-text Unit.Owner into the Customers master and link units.
  try {
    const pending = await pool.request().query(`
      SELECT COUNT(*) c FROM ${SCHEMA}.Units
      WHERE ISNULL(Owner,'') <> '' AND CustomerId IS NULL`);
    if (pending.recordset[0].c > 0) {
      await pool.request().query(`
        ;WITH names AS (
          SELECT DISTINCT LTRIM(RTRIM(Owner)) AS Nm FROM ${SCHEMA}.Units
          WHERE ISNULL(Owner,'') <> ''
        )
        INSERT INTO ${SCHEMA}.Customers (Id, Code, Name, CustType)
        SELECT LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()),'-','')),
               'CUS-' + RIGHT('0000' + CAST(ROW_NUMBER() OVER (ORDER BY n.Nm)
                 + ISNULL((SELECT MAX(CAST(SUBSTRING(Code,5,10) AS INT)) FROM ${SCHEMA}.Customers WHERE Code LIKE 'CUS-%'),0) AS VARCHAR(10)), 4),
               n.Nm,
               CASE WHEN n.Nm LIKE 'M/s%' OR n.Nm LIKE '%Ltd%' OR n.Nm LIKE '%Limited%' OR n.Nm LIKE '%LLP%' THEN 'Company' ELSE 'Individual' END
        FROM names n
        WHERE NOT EXISTS (SELECT 1 FROM ${SCHEMA}.Customers c WHERE c.Name = n.Nm)`);
      await pool.request().query(`
        UPDATE u SET u.CustomerId = c.Id
        FROM ${SCHEMA}.Units u
        JOIN ${SCHEMA}.Customers c ON c.Name = LTRIM(RTRIM(u.Owner))
        WHERE ISNULL(u.Owner,'') <> '' AND u.CustomerId IS NULL`);
      console.log('[autoMigrate] promoted Unit.Owner text into Customers master and linked units');
    }
  } catch (e) { failed++; console.error('[autoMigrate] customer promotion:', e.message); }
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
  // Workflow backfill: anything created before the maker–checker workflow
  // (or inserted without a DocStatus) is treated as already approved.
  try {
    for (const t of ['Invoices', 'Leases', 'Collections', 'CreditNotes']) {
      await pool.request().query(`UPDATE ${SCHEMA}.${t} SET DocStatus='Approved' WHERE DocStatus IS NULL`);
    }
  } catch (e) { /* non-fatal */ }
  console.log(`[autoMigrate] schema check complete — ${added} column(s) added${failed ? `, ${failed} failed` : ''}.`);
}

module.exports = { autoMigrate };
