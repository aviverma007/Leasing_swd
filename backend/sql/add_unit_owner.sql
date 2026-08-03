/* Add Owner field to Units. Run in SSMS (or via npm run setup-db which includes it). */
IF COL_LENGTH('leasing.Units','Owner') IS NULL
    ALTER TABLE leasing.Units ADD Owner NVARCHAR(200) NULL;
GO
PRINT 'Units.Owner ready.';
