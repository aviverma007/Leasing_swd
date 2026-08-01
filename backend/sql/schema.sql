/* ============================================================
   ScoopSense Leasing & Billing — SQL Server schema
   Run this in SSMS against your SQL Server instance.
   Creates database LeasingBillingDB and all tables.
   ============================================================ */

IF DB_ID('LeasingBillingDB') IS NULL
BEGIN
    CREATE DATABASE LeasingBillingDB;
END
GO

USE LeasingBillingDB;
GO

/* ---------- sequence counters (for CO-0001, AST-0001 style codes) ---------- */
IF OBJECT_ID('dbo.Sequences','U') IS NULL
CREATE TABLE dbo.Sequences(
    Prefix   VARCHAR(10) PRIMARY KEY,
    LastVal  INT NOT NULL DEFAULT 0
);
GO

/* ---------- masters ---------- */
IF OBJECT_ID('dbo.Companies','U') IS NULL
CREATE TABLE dbo.Companies(
    Id      VARCHAR(40) PRIMARY KEY,
    Code    VARCHAR(20) UNIQUE NOT NULL,
    Name    NVARCHAR(200) NOT NULL
);
GO

IF OBJECT_ID('dbo.Assets','U') IS NULL
CREATE TABLE dbo.Assets(
    Id      VARCHAR(40) PRIMARY KEY,
    Code    VARCHAR(20) UNIQUE NOT NULL,
    Name    NVARCHAR(200) NOT NULL,
    City    NVARCHAR(100) NULL
);
GO

IF OBJECT_ID('dbo.Blocks','U') IS NULL
CREATE TABLE dbo.Blocks(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    Name         NVARCHAR(200) NOT NULL,
    AssetId      VARCHAR(40) NOT NULL REFERENCES dbo.Assets(Id),
    TotalFloors  INT NULL
);
GO

IF OBJECT_ID('dbo.Units','U') IS NULL
CREATE TABLE dbo.Units(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    Name         NVARCHAR(100) NOT NULL,
    AssetId      VARCHAR(40) NOT NULL REFERENCES dbo.Assets(Id),
    BlockId      VARCHAR(40) NOT NULL REFERENCES dbo.Blocks(Id),
    Floor        INT NULL,
    CarpetArea   DECIMAL(18,2) NULL,
    BuiltupArea  DECIMAL(18,2) NULL,
    Status       VARCHAR(20) NOT NULL DEFAULT 'Vacant'  -- Vacant / Leased / On Hold
);
GO

IF OBJECT_ID('dbo.Brands','U') IS NULL
CREATE TABLE dbo.Brands(
    Id               VARCHAR(40) PRIMARY KEY,
    Code             VARCHAR(20) UNIQUE NOT NULL,
    Name             NVARCHAR(200) NOT NULL,
    CompanyId        VARCHAR(40) NOT NULL REFERENCES dbo.Companies(Id),
    Category         NVARCHAR(50) NULL,
    RegularAddress   NVARCHAR(400) NULL,
    Address          NVARCHAR(400) NULL
);
GO

IF OBJECT_ID('dbo.Users','U') IS NULL
CREATE TABLE dbo.Users(
    Id        VARCHAR(40) PRIMARY KEY,
    Code      VARCHAR(20) UNIQUE NOT NULL,
    Email     NVARCHAR(200) NOT NULL,
    Password  NVARCHAR(200) NOT NULL,
    Role      VARCHAR(50) NOT NULL,   -- Manager / Leasing Head / Finance Head / Center/Portfolio Head / Owner Representative
    Active    VARCHAR(20) NOT NULL DEFAULT 'Active',
    PwdChangedAt DATETIME2 NULL
);
GO

/* ---------- leasing & billing ---------- */
IF OBJECT_ID('dbo.Leases','U') IS NULL
CREATE TABLE dbo.Leases(
    Id           VARCHAR(40) PRIMARY KEY,
    Code         VARCHAR(20) UNIQUE NOT NULL,
    BrandId      VARCHAR(40) NOT NULL REFERENCES dbo.Brands(Id),
    UnitId       VARCHAR(40) NOT NULL REFERENCES dbo.Units(Id),
    AssetId      VARCHAR(40) NOT NULL REFERENCES dbo.Assets(Id),
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

IF OBJECT_ID('dbo.Sales','U') IS NULL
CREATE TABLE dbo.Sales(
    Id       VARCHAR(40) PRIMARY KEY,
    LeaseId  VARCHAR(40) NOT NULL REFERENCES dbo.Leases(Id),
    Ym       CHAR(7) NOT NULL,          -- yyyy-mm
    Amount   DECIMAL(18,2) NOT NULL
);
GO

IF OBJECT_ID('dbo.Invoices','U') IS NULL
CREATE TABLE dbo.Invoices(
    Id        VARCHAR(40) PRIMARY KEY,
    No        VARCHAR(20) UNIQUE NOT NULL,
    Type      VARCHAR(20) NOT NULL,     -- MG / RevShare / CAM / Utility / Adhoc
    LeaseId   VARCHAR(40) NOT NULL REFERENCES dbo.Leases(Id),
    BrandId   VARCHAR(40) NOT NULL REFERENCES dbo.Brands(Id),
    UnitId    VARCHAR(40) NOT NULL REFERENCES dbo.Units(Id),
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

IF OBJECT_ID('dbo.Collections','U') IS NULL
CREATE TABLE dbo.Collections(
    Id          VARCHAR(40) PRIMARY KEY,
    No          VARCHAR(20) UNIQUE NOT NULL,
    InvoiceId   VARCHAR(40) NOT NULL REFERENCES dbo.Invoices(Id),
    CollDate    DATE NOT NULL,
    Amount      DECIMAL(18,2) NOT NULL,
    TdsPct      DECIMAL(9,3) NOT NULL DEFAULT 0,
    Tds         DECIMAL(18,2) NOT NULL DEFAULT 0,
    Instrument  VARCHAR(20) NOT NULL,   -- NEFT / RTGS / UPI / Cheque / Cash / Card
    Ref         NVARCHAR(100) NULL
);
GO

IF OBJECT_ID('dbo.InvestorUnits','U') IS NULL
CREATE TABLE dbo.InvestorUnits(
    Id         VARCHAR(40) PRIMARY KEY,
    Code       VARCHAR(20) UNIQUE NOT NULL,
    UnitId     VARCHAR(40) NOT NULL REFERENCES dbo.Units(Id),
    Floor      INT NULL,
    Status     VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending / Approved
    Maker      NVARCHAR(100) NULL,
    Checker    NVARCHAR(100) NULL,
    Remarks    NVARCHAR(400) NULL,
    CreatedAt  DATE NOT NULL
);
GO

IF OBJECT_ID('dbo.InvestorUnitInvestors','U') IS NULL
CREATE TABLE dbo.InvestorUnitInvestors(
    Id              VARCHAR(40) PRIMARY KEY,
    InvestorUnitId  VARCHAR(40) NOT NULL REFERENCES dbo.InvestorUnits(Id) ON DELETE CASCADE,
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

IF OBJECT_ID('dbo.Disbursals','U') IS NULL
CREATE TABLE dbo.Disbursals(
    Id              VARCHAR(40) PRIMARY KEY,
    No              VARCHAR(20) UNIQUE NOT NULL,
    Month           CHAR(7) NOT NULL,
    InvestorUnitId  VARCHAR(40) NOT NULL REFERENCES dbo.InvestorUnits(Id),
    InvIdx          INT NOT NULL,
    InvestorName    NVARCHAR(200) NOT NULL,
    UnitId          VARCHAR(40) NOT NULL REFERENCES dbo.Units(Id),
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

IF OBJECT_ID('dbo.ChangeLog','U') IS NULL
CREATE TABLE dbo.ChangeLog(
    Id      VARCHAR(40) PRIMARY KEY,
    LogDate DATE NOT NULL,
    Type    NVARCHAR(100) NOT NULL,
    Ref     NVARCHAR(100) NULL,
    Detail  NVARCHAR(400) NULL,
    ByUser  NVARCHAR(100) NULL
);
GO

/* helpful indexes */
CREATE NONCLUSTERED INDEX IX_Units_Asset ON dbo.Units(AssetId);
CREATE NONCLUSTERED INDEX IX_Units_Block ON dbo.Units(BlockId);
CREATE NONCLUSTERED INDEX IX_Leases_Unit ON dbo.Leases(UnitId);
CREATE NONCLUSTERED INDEX IX_Leases_Brand ON dbo.Leases(BrandId);
CREATE NONCLUSTERED INDEX IX_Invoices_Lease ON dbo.Invoices(LeaseId);
CREATE NONCLUSTERED INDEX IX_Invoices_Ym ON dbo.Invoices(Ym);
CREATE NONCLUSTERED INDEX IX_Collections_Invoice ON dbo.Collections(InvoiceId);
CREATE NONCLUSTERED INDEX IX_Sales_Lease ON dbo.Sales(LeaseId);
CREATE NONCLUSTERED INDEX IX_Disbursals_Month ON dbo.Disbursals(Month);
CREATE NONCLUSTERED INDEX IX_Disbursals_InvUnit ON dbo.Disbursals(InvestorUnitId);
GO


IF OBJECT_ID('dbo.DeletionRequests','U') IS NULL
CREATE TABLE dbo.DeletionRequests(
    Id           VARCHAR(40) PRIMARY KEY,
    Entity       VARCHAR(40)  NOT NULL,
    RecordId     VARCHAR(40)  NOT NULL,
    Label        NVARCHAR(300) NULL,
    Reason       NVARCHAR(400) NULL,
    Status       VARCHAR(20)  NOT NULL DEFAULT 'Pending',
    RequestedBy  NVARCHAR(150) NULL,
    RequestedRole VARCHAR(50) NULL,
    RequestedAt  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    DecidedBy    NVARCHAR(150) NULL,
    DecidedAt    DATETIME2 NULL,
    DecisionNote NVARCHAR(400) NULL
);
GO

PRINT 'LeasingBillingDB schema created successfully.';
