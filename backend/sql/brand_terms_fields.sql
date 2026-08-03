/* Store BRAND Final Data terms on the Brand master so all 19 brands carry their
   deal/financial terms even without a unit, and so those terms can prefill future
   leases. All nullable & idempotent. Adjust schema if not 'leasing'. */
SET NOCOUNT ON;

DECLARE @cols TABLE (name SYSNAME, def NVARCHAR(200));
INSERT INTO @cols (name, def) VALUES
 ('Project','NVARCHAR(120) NULL'),
 ('UnitRef','NVARCHAR(200) NULL'),               -- raw "Unit no." text from the brand sheet
 ('SuperArea','DECIMAL(18,2) NULL'),
 ('ChequeClearanceDate','DATE NULL'),
 ('LoiDate','DATE NULL'),
 ('DealApprovalDate','DATE NULL'),
 ('AgreementSignedBrand','NVARCHAR(80) NULL'),
 ('AgreementSignedInvestor','NVARCHAR(80) NULL'),
 ('AgreementRegistrationDate','DATE NULL'),
 ('DocLeaseCommencementDate','DATE NULL'),
 ('ActualHandoverDate','DATE NULL'),
 ('DocOperationalDate','DATE NULL'),
 ('ActualOperationalDate','DATE NULL'),
 ('DocRentCommencementDate','DATE NULL'),
 ('ActualRcdDate','DATE NULL'),
 ('ChannelPartner','NVARCHAR(150) NULL'),
 ('RmName','NVARCHAR(150) NULL'),
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
 ('BrandType','NVARCHAR(80) NULL');

DECLARE @n SYSNAME, @d NVARCHAR(200), @sqlx NVARCHAR(400);
DECLARE c CURSOR FOR SELECT name, def FROM @cols;
OPEN c; FETCH NEXT FROM c INTO @n, @d;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH('leasing.Brands', @n) IS NULL
  BEGIN
    SET @sqlx = 'ALTER TABLE leasing.Brands ADD ' + QUOTENAME(@n) + ' ' + @d + ';';
    EXEC sp_executesql @sqlx;
  END
  FETCH NEXT FROM c INTO @n, @d;
END
CLOSE c; DEALLOCATE c;

PRINT 'leasing.Brands extended with BRAND Final Data term fields.';
GO
