/* Add password-changed tracking to the Users table. Run in SSMS.
   Safe/idempotent — only adds the column if missing. Adjust schema name if not 'leasing'. */
IF COL_LENGTH('leasing.Users','PwdChangedAt') IS NULL
    ALTER TABLE leasing.Users ADD PwdChangedAt DATETIME2 NULL;
GO
PRINT 'Users.PwdChangedAt ready.';
