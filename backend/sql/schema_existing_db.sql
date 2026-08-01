/* ============================================================
   ScoopSense Leasing & Billing — schema for an EXISTING database
   Creates all objects under a dedicated [leasing] schema so they
   NEVER collide with your existing dbo.* tables.
   Run this in SSMS while connected to your existing database.
   Nothing here drops or alters any existing object.
   ============================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'leasing')
    EXEC('CREATE SCHEMA leasing');
GO

/* ---------- sequence counters (for CO-0001, AST-0001 style codes) ---------- */
IF OBJECT_ID('leasing.Sequences','U') IS NULL
CREATE TABLE leasing.Sequences(
    Prefix   VARCHAR(10) PRIMARY KEY,
    LastVal  INT NOT NULL DEFAULT 0
);
GO

/* ---------- masters ---------- */
IF OBJECT_ID('leasing.Companies','U') IS NULL
CREATE TABLE leasing.Companies(
    Id      VARCHAR(40) PRIMARY KEY,
    Code    VARCHAR(20) UNIQUE NOT NULL,
    Name    NVARCHAR(200) NOT NULL
);
GO

IF OBJECT_ID('leasing.Assets','U') IS NULL
CREATE TABLE leasing.Assets(
    Id      VARCHAR(40) PRIMARY KEY,
    Code    VARCHAR(20) UNIQUE NOT NULL,
    Name    NVARCHAR(200) NOT NULL,
    City    NVARCHAR(100) NULL
);
GO

IF OBJECT_ID('leasing.Blocks','U') IS NULL
CREATE TABLE leasing.Blocks(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    Name         NVARCHAR(200) NOT NULL,
    AssetId      VARCHAR(40) NOT NULL REFERENCES leasing.Assets(Id),
    TotalFloors  INT NULL
);
GO

IF OBJECT_ID('leasing.Units','U') IS NULL
CREATE TABLE leasing.Units(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    Name         NVARCHAR(100) NOT NULL,
    AssetId      VARCHAR(40) NOT NULL REFERENCES leasing.Assets(Id),
    BlockId      VARCHAR(40) NOT NULL REFERENCES leasing.Blocks(Id),
    Floor        INT NULL,
    CarpetArea   DECIMAL(18,2) NULL,
    BuiltupArea  DECIMAL(18,2) NULL,
    Status       VARCHAR(20) NOT NULL DEFAULT 'Vacant'  -- Vacant / Leased / On Hold
);
GO

IF OBJECT_ID('leasing.Brands','U') IS NULL
CREATE TABLE leasing.Brands(
    Id               VARCHAR(40) PRIMARY KEY,
    Code             VARCHAR(20) UNIQUE NOT NULL,
    Name             NVARCHAR(200) NOT NULL,
    CompanyId        VARCHAR(40) NOT NULL REFERENCES leasing.Companies(Id),
    Category         NVARCHAR(50) NULL,
    RegularAddress   NVARCHAR(400) NULL,
    Address          NVARCHAR(400) NULL
);
GO

IF OBJECT_ID('leasing.Users','U') IS NULL
CREATE TABLE leasing.Users(
    Id        VARCHAR(40) PRIMARY KEY,
    Code      VARCHAR(20) UNIQUE NOT NULL,
    Email     NVARCHAR(200) NOT NULL,
    Password  NVARCHAR(200) NOT NULL,
    Role      VARCHAR(50) NOT NULL,   -- Manager / Leasing Head / Finance Head / Center/Portfolio Head / Owner Representative
    Active    VARCHAR(20) NOT NULL DEFAULT 'Active'
);
GO

/* ---------- leasing & billing ---------- */
IF OBJECT_ID('leasing.Leases','U') IS NULL
CREATE TABLE leasing.Leases(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    BrandId      VARCHAR(40) NOT NULL REFERENCES leasing.Brands(Id),
    UnitId       VARCHAR(40) NOT NULL REFERENCES leasing.Units(Id),
    AssetId      VARCHAR(40) NOT NULL REFERENCES leasing.Assets(Id),
    StartDate    DATE NOT NULL,
    EndDate      DATE NOT NULL,
    RentalType   VARCHAR(20) NOT NULL,   -- MG / MGvsRS / PureRS / VarRS
    MgBasis      VARCHAR(20) NULL,       -- Lumpsum / PerSqFt
    Mg           DECIMAL(18,2) NULL,
    RevSharePct  DECIMAL(9,3) NULL,
    Cam          DECIMAL(18,2) NULL,
    Utility      DECIMAL(18,2) NULL,
    Esc          DECIMAL(9,3) NULL,
    Deposit      DECIMAL(18,2) NULL,
    Gst          DECIMAL(9,3) NULL,
    OnHold       BIT NOT NULL DEFAULT 0,
    HoldRemarks  NVARCHAR(400) NULL,
    Status       VARCHAR(20) NOT NULL DEFAULT 'Active'
);
GO

IF OBJECT_ID('leasing.Sales','U') IS NULL
CREATE TABLE leasing.Sales(
    Id       VARCHAR(40) PRIMARY KEY,
    LeaseId  VARCHAR(40) NOT NULL REFERENCES leasing.Leases(Id),
    Ym       CHAR(7) NOT NULL,          -- yyyy-mm
    Amount   DECIMAL(18,2) NOT NULL
);
GO

IF OBJECT_ID('leasing.Invoices','U') IS NULL
CREATE TABLE leasing.Invoices(
    Id        VARCHAR(40) PRIMARY KEY,
    No        VARCHAR(20) UNIQUE NOT NULL,
    Type      VARCHAR(20) NOT NULL,     -- MG / RevShare / CAM / Utility / Adhoc
    LeaseId   VARCHAR(40) NOT NULL REFERENCES leasing.Leases(Id),
    BrandId   VARCHAR(40) NOT NULL REFERENCES leasing.Brands(Id),
    UnitId    VARCHAR(40) NOT NULL REFERENCES leasing.Units(Id),
    Ym        CHAR(7) NOT NULL,
    Descr     NVARCHAR(300) NULL,
    Amount    DECIMAL(18,2) NOT NULL,
    GstPct    DECIMAL(9,3) NULL,
    GstAmt    DECIMAL(18,2) NULL,
    Total     DECIMAL(18,2) NOT NULL,
    DueDate   DATE NOT NULL,
    Irn       VARCHAR(64) NULL,
    Status    VARCHAR(20) NOT NULL DEFAULT 'Unpaid'  -- cached; true status computed from collections
);
GO

IF OBJECT_ID('leasing.Collections','U') IS NULL
CREATE TABLE leasing.Collections(
    Id          VARCHAR(40) PRIMARY KEY,
    No          VARCHAR(20) UNIQUE NOT NULL,
    InvoiceId   VARCHAR(40) NOT NULL REFERENCES leasing.Invoices(Id),
    CollDate    DATE NOT NULL,
    Amount      DECIMAL(18,2) NOT NULL,
    TdsPct      DECIMAL(9,3) NOT NULL DEFAULT 0,
    Tds         DECIMAL(18,2) NOT NULL DEFAULT 0,
    Instrument  VARCHAR(20) NOT NULL,   -- NEFT / RTGS / UPI / Cheque / Cash / Card
    Ref         NVARCHAR(100) NULL
);
GO

IF OBJECT_ID('leasing.InvestorUnits','U') IS NULL
CREATE TABLE leasing.InvestorUnits(
    Id         VARCHAR(40) PRIMARY KEY,
    Code       VARCHAR(20) UNIQUE NOT NULL,
    UnitId     VARCHAR(40) NOT NULL REFERENCES leasing.Units(Id),
    Floor      INT NULL,
    Status     VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending / Approved
    Maker      NVARCHAR(100) NULL,
    Checker    NVARCHAR(100) NULL,
    Remarks    NVARCHAR(400) NULL,
    CreatedAt  DATE NOT NULL
);
GO

IF OBJECT_ID('leasing.InvestorUnitInvestors','U') IS NULL
CREATE TABLE leasing.InvestorUnitInvestors(
    Id              VARCHAR(40) PRIMARY KEY,
    InvestorUnitId  VARCHAR(40) NOT NULL REFERENCES leasing.InvestorUnits(Id) ON DELETE CASCADE,
    Idx             INT NOT NULL,        -- position within the investor unit (0-based, mirrors invIdx)
    Name            NVARCHAR(200) NOT NULL,
    AreaPct         DECIMAL(9,3) NOT NULL DEFAULT 0,
    DisbursePct     DECIMAL(9,3) NOT NULL DEFAULT 0,
    StartDate       DATE NULL,
    Gst             BIT NOT NULL DEFAULT 1,
    Nri             BIT NOT NULL DEFAULT 0,
    BankName        NVARCHAR(150) NULL,
    Acc             NVARCHAR(60) NULL,
    Ifsc            NVARCHAR(20) NULL
);
GO

IF OBJECT_ID('leasing.Disbursals','U') IS NULL
CREATE TABLE leasing.Disbursals(
    Id              VARCHAR(40) PRIMARY KEY,
    No              VARCHAR(20) UNIQUE NOT NULL,
    Month           CHAR(7) NOT NULL,
    InvestorUnitId  VARCHAR(40) NOT NULL REFERENCES leasing.InvestorUnits(Id),
    InvIdx          INT NOT NULL,
    InvestorName    NVARCHAR(200) NOT NULL,
    UnitId          VARCHAR(40) NOT NULL REFERENCES leasing.Units(Id),
    BrandId         VARCHAR(40) NULL,
    RentGross       DECIMAL(18,2) NOT NULL DEFAULT 0,
    DeductionsJson  NVARCHAR(MAX) NULL,   -- {brokerage,mgmtFee,fitout,stampDuty,camVacant,other}
    TotalDeductions DECIMAL(18,2) NOT NULL DEFAULT 0,
    TdsPct          DECIMAL(9,3) NOT NULL DEFAULT 0,
    TdsAmt          DECIMAL(18,2) NOT NULL DEFAULT 0,
    Outstanding     DECIMAL(18,2) NOT NULL DEFAULT 0,
    NetPayable      DECIMAL(18,2) NOT NULL DEFAULT 0,
    Mode            VARCHAR(20) NULL,     -- NEFT / Cheque
    Ref             NVARCHAR(100) NULL,
    Bank            NVARCHAR(150) NULL,
    Acc             NVARCHAR(60) NULL,
    Ifsc            NVARCHAR(20) NULL,
    Nri             BIT NOT NULL DEFAULT 0,
    Narration       NVARCHAR(300) NULL,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Pending',  -- Pending / Processed / Void
    Maker           NVARCHAR(100) NULL,
    Checker         NVARCHAR(100) NULL,
    Remarks         NVARCHAR(400) NULL,
    CreatedAt       DATE NOT NULL
);
GO

IF OBJECT_ID('leasing.ChangeLog','U') IS NULL
CREATE TABLE leasing.ChangeLog(
    Id      VARCHAR(40) PRIMARY KEY,
    LogDate DATE NOT NULL,
    Type    NVARCHAR(100) NOT NULL,
    Ref     NVARCHAR(100) NULL,
    Detail  NVARCHAR(400) NULL,
    ByUser  NVARCHAR(100) NULL
);
GO

/* helpful indexes */
CREATE NONCLUSTERED INDEX IX_Units_Asset ON leasing.Units(AssetId);
CREATE NONCLUSTERED INDEX IX_Units_Block ON leasing.Units(BlockId);
CREATE NONCLUSTERED INDEX IX_Leases_Unit ON leasing.Leases(UnitId);
CREATE NONCLUSTERED INDEX IX_Leases_Brand ON leasing.Leases(BrandId);
CREATE NONCLUSTERED INDEX IX_Invoices_Lease ON leasing.Invoices(LeaseId);
CREATE NONCLUSTERED INDEX IX_Invoices_Ym ON leasing.Invoices(Ym);
CREATE NONCLUSTERED INDEX IX_Collections_Invoice ON leasing.Collections(InvoiceId);
CREATE NONCLUSTERED INDEX IX_Sales_Lease ON leasing.Sales(LeaseId);
CREATE NONCLUSTERED INDEX IX_Disbursals_Month ON leasing.Disbursals(Month);
CREATE NONCLUSTERED INDEX IX_Disbursals_InvUnit ON leasing.Disbursals(InvestorUnitId);
GO

PRINT 'LeasingBillingDB schema created successfully.';
