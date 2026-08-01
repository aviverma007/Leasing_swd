/* Deletion approval queue. Run in SSMS against your database.
   Works under whatever schema this app uses (leasing.* here). */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'leasing')
    EXEC('CREATE SCHEMA leasing');
GO

IF OBJECT_ID('leasing.DeletionRequests','U') IS NULL
CREATE TABLE leasing.DeletionRequests(
    Id           VARCHAR(40) PRIMARY KEY,
    Entity       VARCHAR(40)  NOT NULL,   -- companies / assets / .../ leases / sales / invoices / collections / investors
    RecordId     VARCHAR(40)  NOT NULL,
    Label        NVARCHAR(300) NULL,      -- human-readable description of the record
    Reason       NVARCHAR(400) NULL,
    Status       VARCHAR(20)  NOT NULL DEFAULT 'Pending',  -- Pending / Approved / Rejected
    RequestedBy  NVARCHAR(150) NULL,
    RequestedRole VARCHAR(50) NULL,
    RequestedAt  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    DecidedBy    NVARCHAR(150) NULL,
    DecidedAt    DATETIME2 NULL,
    DecisionNote NVARCHAR(400) NULL
);
GO

CREATE NONCLUSTERED INDEX IX_DelReq_Status ON leasing.DeletionRequests(Status);
CREATE NONCLUSTERED INDEX IX_DelReq_Record ON leasing.DeletionRequests(Entity, RecordId);
GO

PRINT 'DeletionRequests table ready.';
