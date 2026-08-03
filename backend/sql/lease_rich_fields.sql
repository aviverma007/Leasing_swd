/* Extend leasing.Leases with the full field set from the Excel (Customer sheet +
   BRAND Final Data sheet). All nullable & idempotent. Run in SSMS or via setup-db.
   Adjust schema name if not 'leasing'. */
SET NOCOUNT ON;

DECLARE @cols TABLE (name SYSNAME, def NVARCHAR(200));
INSERT INTO @cols (name, def) VALUES
 -- Customer sheet
 ('BookingDate','DATE NULL'),
 ('LoiDate','DATE NULL'),
 ('LeasingHod','NVARCHAR(150) NULL'),
 ('BrandStatus','NVARCHAR(80) NULL'),
 ('ConsentStatus','NVARCHAR(80) NULL'),
 ('Lms','NVARCHAR(120) NULL'),
 ('PhysicalPossessionStatus','NVARCHAR(80) NULL'),
 ('HandoverStatus','NVARCHAR(80) NULL'),
 ('Tcv','DECIMAL(18,2) NULL'),
 ('CalledIncludingTax','DECIMAL(18,2) NULL'),
 ('AvailableFor','NVARCHAR(80) NULL'),
 ('CdStatus','NVARCHAR(80) NULL'),
 ('CdExecutionDate','DATE NULL'),
 ('RegistrationStatus','NVARCHAR(80) NULL'),
 ('AgreementRegistrationDate','DATE NULL'),
 ('AgreementStatus','NVARCHAR(80) NULL'),
 ('DealStatus','NVARCHAR(80) NULL'),
 ('SignedAgreementDate','DATE NULL'),
 ('AgreementConsultant','NVARCHAR(150) NULL'),
 ('RmName','NVARCHAR(150) NULL'),
 ('CustomerDocRemarks','NVARCHAR(500) NULL'),
 ('StandardRemarks','NVARCHAR(500) NULL'),
 ('DetailedRemarks','NVARCHAR(1000) NULL'),
 -- BRAND Final Data sheet
 ('ChequeClearanceDate','DATE NULL'),
 ('DealApprovalDate','DATE NULL'),
 ('AgreementSignedBrand','NVARCHAR(80) NULL'),
 ('AgreementSignedInvestor','NVARCHAR(80) NULL'),
 ('DocLeaseCommencementDate','DATE NULL'),
 ('ActualHandoverDate','DATE NULL'),
 ('DocOperationalDate','DATE NULL'),
 ('ActualOperationalDate','DATE NULL'),
 ('DocRentCommencementDate','DATE NULL'),
 ('ActualRcdDate','DATE NULL'),
 ('ChannelPartner','NVARCHAR(150) NULL'),
 ('Stage','NVARCHAR(80) NULL'),
 ('OperationalStatus','NVARCHAR(80) NULL'),
 ('PercentWork','DECIMAL(6,2) NULL'),
 ('LoanRs','DECIMAL(18,2) NULL'),
 ('Capex','DECIMAL(18,2) NULL'),
 ('CapexReleased','DECIMAL(18,2) NULL'),
 ('CapexDue','DECIMAL(18,2) NULL'),
 ('TenureYears','DECIMAL(6,2) NULL'),
 ('LockinMonths','INT NULL'),
 ('MinGuaranteePsf','DECIMAL(12,2) NULL'),
 ('SdRate','DECIMAL(12,2) NULL'),
 ('SdSchedule','NVARCHAR(120) NULL'),
 ('SecurityDeposit','DECIMAL(18,2) NULL'),
 ('SdDue','DECIMAL(18,2) NULL'),
 ('SdReceived','DECIMAL(18,2) NULL'),
 ('SdBalance','DECIMAL(18,2) NULL'),
 ('SdFutureDue','DECIMAL(18,2) NULL'),
 ('CamSchedule','NVARCHAR(120) NULL'),
 ('CamDeposit','DECIMAL(18,2) NULL'),
 ('CamDue','DECIMAL(18,2) NULL'),
 ('CamReceived','DECIMAL(18,2) NULL'),
 ('CamBalance','DECIMAL(18,2) NULL'),
 ('CamFutureDue','DECIMAL(18,2) NULL'),
 ('RevenueSharePct','DECIMAL(6,2) NULL'),
 ('FitoutPeriod','NVARCHAR(80) NULL'),
 ('BrokerageTerms','NVARCHAR(200) NULL'),
 ('BrokerageDisbursal','NVARCHAR(120) NULL'),
 ('BrokerageRate','DECIMAL(12,2) NULL'),
 ('BrokerageAmount','DECIMAL(18,2) NULL'),
 ('BrokerageDue','DECIMAL(18,2) NULL'),
 ('BrokeragePaid','DECIMAL(18,2) NULL'),
 ('BrokerageBalance','DECIMAL(18,2) NULL'),
 ('FutureBrokerage','DECIMAL(18,2) NULL'),
 ('DealWith','NVARCHAR(150) NULL'),
 ('BillingRemarks','NVARCHAR(1000) NULL'),
 ('Category','NVARCHAR(80) NULL');

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

PRINT 'leasing.Leases extended with full Excel field set.';
GO
