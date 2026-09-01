USE SmartDeskApp;
GO
/* ============================================================
   Leasing & Billing — Schema Migration v2
   Smart World Developers — Gems-2 Finance Requirements
   Run AFTER base schema.sql (or schema_existing_db.sql).
   All statements are idempotent — safe to re-run.
   Schema variable :  set DB_SCHEMA in .env (default dbo / leasing)
   ============================================================ */

/* ── Companies: add PAN + GSTIN ── */
IF COL_LENGTH('leasing.Companies','PanNo') IS NULL
  ALTER TABLE leasing.Companies ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Companies','Gstin') IS NULL
  ALTER TABLE leasing.Companies ADD Gstin NVARCHAR(20) NULL;
GO

/* ── Brands: add PAN + GSTIN ── */
IF COL_LENGTH('leasing.Brands','PanNo') IS NULL
  ALTER TABLE leasing.Brands ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Brands','Gstin') IS NULL
  ALTER TABLE leasing.Brands ADD Gstin NVARCHAR(20) NULL;
GO

/* ── Assets: add landlord GSTIN, PAN, full bank details ── */
IF COL_LENGTH('leasing.Assets','Gstin') IS NULL
  ALTER TABLE leasing.Assets ADD Gstin NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Assets','PanNo') IS NULL
  ALTER TABLE leasing.Assets ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Assets','BankName') IS NULL
  ALTER TABLE leasing.Assets ADD BankName NVARCHAR(150) NULL;
IF COL_LENGTH('leasing.Assets','BankBranch') IS NULL
  ALTER TABLE leasing.Assets ADD BankBranch NVARCHAR(150) NULL;
IF COL_LENGTH('leasing.Assets','BankAcc') IS NULL
  ALTER TABLE leasing.Assets ADD BankAcc NVARCHAR(60) NULL;
IF COL_LENGTH('leasing.Assets','BankIfsc') IS NULL
  ALTER TABLE leasing.Assets ADD BankIfsc NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Assets','BankMicr') IS NULL
  ALTER TABLE leasing.Assets ADD BankMicr NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Assets','LandlordName') IS NULL
  ALTER TABLE leasing.Assets ADD LandlordName NVARCHAR(300) NULL;
IF COL_LENGTH('leasing.Assets','LandlordAddress') IS NULL
  ALTER TABLE leasing.Assets ADD LandlordAddress NVARCHAR(500) NULL;
GO

/* ── Leases: HSN/SAC code, payment terms, IGST flag, pool group ── */
IF COL_LENGTH('leasing.Leases','HsnCode') IS NULL
  ALTER TABLE leasing.Leases ADD HsnCode NVARCHAR(20) NULL DEFAULT '997212'; -- SAC: rental of non-residential commercial property
IF COL_LENGTH('leasing.Leases','PaymentTermsDays') IS NULL
  ALTER TABLE leasing.Leases ADD PaymentTermsDays INT NULL DEFAULT 7;        -- 7-day default per finance team
IF COL_LENGTH('leasing.Leases','IgstApplicable') IS NULL
  ALTER TABLE leasing.Leases ADD IgstApplicable BIT NOT NULL DEFAULT 0;     -- 0=CGST+SGST, 1=IGST
IF COL_LENGTH('leasing.Leases','PoolGroupId') IS NULL
  ALTER TABLE leasing.Leases ADD PoolGroupId NVARCHAR(40) NULL;              -- pool billing group
GO

/* ── Invoices: GST bifurcation (CGST/SGST/IGST), HSN, payment terms, pool ── */
IF COL_LENGTH('leasing.Invoices','CgstAmt') IS NULL
  ALTER TABLE leasing.Invoices ADD CgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('leasing.Invoices','SgstAmt') IS NULL
  ALTER TABLE leasing.Invoices ADD SgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('leasing.Invoices','IgstAmt') IS NULL
  ALTER TABLE leasing.Invoices ADD IgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('leasing.Invoices','HsnCode') IS NULL
  ALTER TABLE leasing.Invoices ADD HsnCode NVARCHAR(20) NULL;
IF COL_LENGTH('leasing.Invoices','PaymentTermsDays') IS NULL
  ALTER TABLE leasing.Invoices ADD PaymentTermsDays INT NULL DEFAULT 7;
IF COL_LENGTH('leasing.Invoices','PoolGroupId') IS NULL
  ALTER TABLE leasing.Invoices ADD PoolGroupId NVARCHAR(40) NULL;
GO

/* ── Collections: Security Deposit adjustment column ── */
IF COL_LENGTH('leasing.Collections','SdAdjAmt') IS NULL
  ALTER TABLE leasing.Collections ADD SdAdjAmt DECIMAL(18,2) NOT NULL DEFAULT 0; -- amount adjusted from SD
IF COL_LENGTH('leasing.Collections','SdNote') IS NULL
  ALTER TABLE leasing.Collections ADD SdNote NVARCHAR(300) NULL;
GO

/* ── Settings: key-value store for global config ── */
IF OBJECT_ID('leasing.Settings','U') IS NULL
CREATE TABLE leasing.Settings (
  Id         VARCHAR(40)   PRIMARY KEY,
  SettingKey NVARCHAR(100) NOT NULL,
  Value      NVARCHAR(MAX) NULL,
  UpdatedAt  DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM leasing.Settings WHERE SettingKey='dummy') BEGIN
  CREATE UNIQUE INDEX UX_Settings_Key ON leasing.Settings(SettingKey);
END
GO

/* ── Insert default HSN/SAC for existing active leases ── */
UPDATE leasing.Leases SET HsnCode='997212' WHERE HsnCode IS NULL;
UPDATE leasing.Leases SET PaymentTermsDays=7 WHERE PaymentTermsDays IS NULL;
GO

PRINT 'Migration v2 completed successfully.';

/* ── Safety net: unit detail + project RERA columns (also in update_gems2_details.sql) ── */
IF COL_LENGTH('leasing.Units','UnitType') IS NULL ALTER TABLE leasing.Units ADD UnitType NVARCHAR(30) NULL;
IF COL_LENGTH('leasing.Units','Plc') IS NULL ALTER TABLE leasing.Units ADD Plc NVARCHAR(80) NULL;
IF COL_LENGTH('leasing.Units','CoveredArea') IS NULL ALTER TABLE leasing.Units ADD CoveredArea DECIMAL(18,2) NULL;
IF COL_LENGTH('leasing.Assets','ReraNo') IS NULL ALTER TABLE leasing.Assets ADD ReraNo NVARCHAR(100) NULL;
IF COL_LENGTH('leasing.Assets','OcStatus') IS NULL ALTER TABLE leasing.Assets ADD OcStatus NVARCHAR(50) NULL;
GO

/* ── Verification: list all new columns ── */
SELECT t.name AS TableName, c.name AS ColumnName
FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name='leasing' AND c.name IN ('PanNo','Gstin','CgstAmt','SgstAmt','IgstAmt','HsnCode','PaymentTermsDays','SdAdjAmt','PoolGroupId','IgstApplicable','BankName','BankAcc','UnitType','Plc','CoveredArea','ReraNo','OcStatus')
ORDER BY t.name, c.name;
PRINT 'All finance columns verified.';

/* ── e-Invoice reference fields (NIC-IRP format): Ack No, Ack Date, Place of Supply ── */
IF COL_LENGTH('leasing.Invoices','AckNo') IS NULL ALTER TABLE leasing.Invoices ADD AckNo VARCHAR(20) NULL;
IF COL_LENGTH('leasing.Invoices','AckDate') IS NULL ALTER TABLE leasing.Invoices ADD AckDate DATETIME2 NULL;
IF COL_LENGTH('leasing.Invoices','PlaceOfSupply') IS NULL ALTER TABLE leasing.Invoices ADD PlaceOfSupply NVARCHAR(60) NULL;
GO
UPDATE leasing.Invoices SET PlaceOfSupply='HARYANA' WHERE PlaceOfSupply IS NULL;
UPDATE leasing.Invoices SET AckNo=CAST(CAST(RAND(CHECKSUM(NEWID()))*899999999999 AS BIGINT)+100000000000 AS VARCHAR(20)) WHERE AckNo IS NULL;
UPDATE leasing.Invoices SET AckDate=SYSDATETIME() WHERE AckDate IS NULL;
GO
PRINT 'e-Invoice fields added.';

/* ── Per-lease alert opt-in ── */
IF COL_LENGTH('leasing.Leases','AlertsEnabled') IS NULL ALTER TABLE leasing.Leases ADD AlertsEnabled BIT NOT NULL DEFAULT 1;
GO
