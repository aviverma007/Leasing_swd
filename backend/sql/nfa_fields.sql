/* NFA (Note for Approval) fields that aren't already on leasing.Leases.
   Idempotent per-column ALTERs. Adjust schema if not 'leasing'. */
SET NOCOUNT ON;

DECLARE @cols TABLE (name SYSNAME, def NVARCHAR(200));
INSERT INTO @cols (name, def) VALUES
 ('NfaClientName','NVARCHAR(200) NULL'),
 ('NfaOpportunityId','NVARCHAR(80) NULL'),
 ('NfaUnitStatus','NVARCHAR(120) NULL'),            -- CD Executed / Not Executed / Unsold
 ('NfaLeaseAgreementStatus','NVARCHAR(120) NULL'),  -- With M3M / With Landlord
 ('NfaSpaStatus','NVARCHAR(200) NULL'),
 ('NfaLeaseGuaranteeStatus','NVARCHAR(120) NULL'),
 ('NfaLandlordDetails','NVARCHAR(400) NULL'),
 ('NfaLessor','NVARCHAR(200) NULL'),                -- legal entity / landlord
 ('NfaRentEscalation','NVARCHAR(200) NULL'),
 ('NfaTotalFitoutCost','DECIMAL(18,2) NULL'),
 ('NfaFitoutSupport','NVARCHAR(300) NULL'),
 ('NfaFitoutChargesBorneBy','NVARCHAR(200) NULL'),
 ('NfaFitoutCamFreePeriod','NVARCHAR(120) NULL'),
 ('NfaFitoutRentFreePeriod','NVARCHAR(120) NULL'),
 ('NfaRentSdSchedule','NVARCHAR(1500) NULL'),       -- prose payment schedule
 ('NfaCamSdSchedule','NVARCHAR(1500) NULL'),
 ('NfaStampDuty','NVARCHAR(300) NULL'),
 ('NfaDeveloperScope','NVARCHAR(500) NULL'),
 ('NfaAdditionalTerms','NVARCHAR(1000) NULL'),
 ('NfaSignage','NVARCHAR(300) NULL'),
 ('NfaOccupancyClause','NVARCHAR(500) NULL'),
 ('NfaOperationalTerms','NVARCHAR(1000) NULL'),     -- operational/RCD prose
 ('NfaFitoutSupportCheque','NVARCHAR(300) NULL'),
 ('NfaLockinRentalCheque','NVARCHAR(300) NULL'),
 ('NfaChequeReceivedDetails','NVARCHAR(500) NULL'),
 ('NfaPreparedBy','NVARCHAR(150) NULL'),
 ('NfaPreparedDate','DATE NULL'),
 ('NfaProposedBy','NVARCHAR(150) NULL'),
 ('NfaHod','NVARCHAR(150) NULL'),
 ('NfaApprovedBy1','NVARCHAR(150) NULL'),
 ('NfaApprovedBy2','NVARCHAR(150) NULL'),
 ('NfaCostToCompany','DECIMAL(18,2) NULL');

DECLARE @n SYSNAME, @d NVARCHAR(200), @sqlx NVARCHAR(400);
DECLARE c CURSOR FOR SELECT name, def FROM @cols;
OPEN c; FETCH NEXT FROM c INTO @n, @d;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH('leasing.Leases', @n) IS NULL
  BEGIN
    SET @sqlx = 'ALTER TABLE leasing.Leases ADD ' + QUOTENAME(@n) + ' ' + @d + ';';
    EXEC sp_executesql @sqlx;
  END
  FETCH NEXT FROM c INTO @n, @d;
END
CLOSE c; DEALLOCATE c;

PRINT 'leasing.Leases extended with NFA fields.';
GO
