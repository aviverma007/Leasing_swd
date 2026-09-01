/* ============================================================
   Leasing & Billing — Schema Migration v2
   Smart World Developers — Gems-2 Finance Requirements
   Run AFTER base schema.sql (or schema_existing_db.sql).
   All statements are idempotent — safe to re-run.
   Schema variable :  set DB_SCHEMA in .env (default dbo / leasing)
   ============================================================ */

/* ── Companies: add PAN + GSTIN ── */
IF COL_LENGTH('$(SCHEMA).Companies','PanNo') IS NULL
  ALTER TABLE $(SCHEMA).Companies ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Companies','Gstin') IS NULL
  ALTER TABLE $(SCHEMA).Companies ADD Gstin NVARCHAR(20) NULL;
GO

/* ── Brands: add PAN + GSTIN ── */
IF COL_LENGTH('$(SCHEMA).Brands','PanNo') IS NULL
  ALTER TABLE $(SCHEMA).Brands ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Brands','Gstin') IS NULL
  ALTER TABLE $(SCHEMA).Brands ADD Gstin NVARCHAR(20) NULL;
GO

/* ── Assets: add landlord GSTIN, PAN, full bank details ── */
IF COL_LENGTH('$(SCHEMA).Assets','Gstin') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD Gstin NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','PanNo') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD PanNo NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','BankName') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD BankName NVARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','BankBranch') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD BankBranch NVARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','BankAcc') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD BankAcc NVARCHAR(60) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','BankIfsc') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD BankIfsc NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','BankMicr') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD BankMicr NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','LandlordName') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD LandlordName NVARCHAR(300) NULL;
IF COL_LENGTH('$(SCHEMA).Assets','LandlordAddress') IS NULL
  ALTER TABLE $(SCHEMA).Assets ADD LandlordAddress NVARCHAR(500) NULL;
GO

/* ── Leases: HSN/SAC code, payment terms, IGST flag, pool group ── */
IF COL_LENGTH('$(SCHEMA).Leases','HsnCode') IS NULL
  ALTER TABLE $(SCHEMA).Leases ADD HsnCode NVARCHAR(20) NULL DEFAULT '997212'; -- SAC: rental of non-residential commercial property
IF COL_LENGTH('$(SCHEMA).Leases','PaymentTermsDays') IS NULL
  ALTER TABLE $(SCHEMA).Leases ADD PaymentTermsDays INT NULL DEFAULT 7;        -- 7-day default per finance team
IF COL_LENGTH('$(SCHEMA).Leases','IgstApplicable') IS NULL
  ALTER TABLE $(SCHEMA).Leases ADD IgstApplicable BIT NOT NULL DEFAULT 0;     -- 0=CGST+SGST, 1=IGST
IF COL_LENGTH('$(SCHEMA).Leases','PoolGroupId') IS NULL
  ALTER TABLE $(SCHEMA).Leases ADD PoolGroupId NVARCHAR(40) NULL;              -- pool billing group
GO

/* ── Invoices: GST bifurcation (CGST/SGST/IGST), HSN, payment terms, pool ── */
IF COL_LENGTH('$(SCHEMA).Invoices','CgstAmt') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD CgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('$(SCHEMA).Invoices','SgstAmt') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD SgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('$(SCHEMA).Invoices','IgstAmt') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD IgstAmt DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('$(SCHEMA).Invoices','HsnCode') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD HsnCode NVARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Invoices','PaymentTermsDays') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD PaymentTermsDays INT NULL DEFAULT 7;
IF COL_LENGTH('$(SCHEMA).Invoices','PoolGroupId') IS NULL
  ALTER TABLE $(SCHEMA).Invoices ADD PoolGroupId NVARCHAR(40) NULL;
GO

/* ── Collections: Security Deposit adjustment column ── */
IF COL_LENGTH('$(SCHEMA).Collections','SdAdjAmt') IS NULL
  ALTER TABLE $(SCHEMA).Collections ADD SdAdjAmt DECIMAL(18,2) NOT NULL DEFAULT 0; -- amount adjusted from SD
IF COL_LENGTH('$(SCHEMA).Collections','SdNote') IS NULL
  ALTER TABLE $(SCHEMA).Collections ADD SdNote NVARCHAR(300) NULL;
GO

/* ── Settings: key-value store for global config ── */
IF OBJECT_ID('$(SCHEMA).Settings','U') IS NULL
CREATE TABLE $(SCHEMA).Settings (
  Id         VARCHAR(40)   PRIMARY KEY,
  SettingKey NVARCHAR(100) NOT NULL,
  Value      NVARCHAR(MAX) NULL,
  UpdatedAt  DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Settings WHERE SettingKey='dummy') BEGIN
  CREATE UNIQUE INDEX UX_Settings_Key ON $(SCHEMA).Settings(SettingKey);
END
GO

/* ── Insert default HSN/SAC for existing active leases ── */
UPDATE $(SCHEMA).Leases SET HsnCode='997212' WHERE HsnCode IS NULL;
UPDATE $(SCHEMA).Leases SET PaymentTermsDays=7 WHERE PaymentTermsDays IS NULL;
GO

PRINT 'Migration v2 completed successfully.';

/* ── e-Invoice reference fields ── */
IF COL_LENGTH('$(SCHEMA).Invoices','AckNo') IS NULL ALTER TABLE $(SCHEMA).Invoices ADD AckNo VARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).Invoices','AckDate') IS NULL ALTER TABLE $(SCHEMA).Invoices ADD AckDate DATETIME2 NULL;
IF COL_LENGTH('$(SCHEMA).Invoices','PlaceOfSupply') IS NULL ALTER TABLE $(SCHEMA).Invoices ADD PlaceOfSupply NVARCHAR(60) NULL;
GO
