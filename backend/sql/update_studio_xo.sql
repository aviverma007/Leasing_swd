/* ============================================================
   Studio XO (Flamingo by Studio-XO) — final working data update
   Source: Book2 final working for Studio XO — 'Revised RCD consent' sheet
   Updates 22 units (K-1..K-06, R-01A..R-04D):
     Units  : CarpetArea, BuiltupArea (super), Owner (customer name)
     Leases : CdStatus, SdRate (brand 129.78/sqft), SecurityDeposit /
              SdReceived / Deposit = Brand SD received
   Customer-side SD (owner's own SD rate/amount) is recorded in the lease's
   CustomerDocRemarks for reference until a dedicated field is decided.
   Idempotent — safe to re-run. Run against SmartDeskApp (192.168.66.33,1433).
   ============================================================ */
USE SmartDeskApp;
GO

-- ── K-1 · Mr. Nishant Aggarwal ──
UPDATE leasing.Units SET CarpetArea=143.88, BuiltupArea=327.15, Owner='Mr. Nishant Aggarwal'
WHERE Name IN ('K-01','K-1');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=127372.58, l.SdReceived=127372.58, l.Deposit=127372.58,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.98,145.00; Brand SD: Rs.129.78/sqft = Rs.127,372.58; Diff Rs.29,227.58 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-01','K-1');

-- ── K-02 · Mr. Ravinder Singh ──
UPDATE leasing.Units SET CarpetArea=127.04, BuiltupArea=384.96, Owner='Mr. Ravinder Singh'
WHERE Name IN ('K-02','K-2');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=149880.33, l.SdReceived=149880.33, l.Deposit=149880.33,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.115,488.00; Brand SD: Rs.129.78/sqft = Rs.149,880.33; Diff Rs.34,392.33 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-02','K-2');

-- ── K-03 · Umesh ──
UPDATE leasing.Units SET CarpetArea=90.34, BuiltupArea=326.46, Owner='Umesh'
WHERE Name IN ('K-03','K-3');
UPDATE l SET l.CdStatus='Executed', l.SdRate=129.78,
       l.SecurityDeposit=127103.94, l.SdReceived=127103.94, l.Deposit=127103.94,
       l.CustomerDocRemarks='Customer SD: Rs.115/sqft = Rs.112,628.70; Brand SD: Rs.129.78/sqft = Rs.127,103.94; Diff Rs.14,475.24 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-03','K-3');

-- ── R-01A · Mr. Neeraj Kathuria ──
UPDATE leasing.Units SET CarpetArea=201.91, BuiltupArea=809.9, Owner='Mr. Neeraj Kathuria'
WHERE Name IN ('R-01A','R-1A');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315326.47, l.SdReceived=315326.47, l.Deposit=315326.47,
       l.CustomerDocRemarks='Customer SD: Rs.125/sqft = Rs.303,712.50; Brand SD: Rs.129.78/sqft = Rs.315,326.47; Diff Rs.11,613.97 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-01A','R-1A');

-- ── R-01B · Mr. Neeraj Kathuria ──
UPDATE leasing.Units SET CarpetArea=208.64, BuiltupArea=809.9, Owner='Mr. Neeraj Kathuria'
WHERE Name IN ('R-01B','R-1B');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315326.47, l.SdReceived=315326.47, l.Deposit=315326.47,
       l.CustomerDocRemarks='Customer SD: Rs.125/sqft = Rs.303,712.50; Brand SD: Rs.129.78/sqft = Rs.315,326.47; Diff Rs.11,613.97 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-01B','R-1B');

-- ── R-01C · Mr. Neeraj Kathuria ──
UPDATE leasing.Units SET CarpetArea=208.64, BuiltupArea=809.9, Owner='Mr. Neeraj Kathuria'
WHERE Name IN ('R-01C','R-1C');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315326.47, l.SdReceived=315326.47, l.Deposit=315326.47,
       l.CustomerDocRemarks='Customer SD: Rs.125/sqft = Rs.303,712.50; Brand SD: Rs.129.78/sqft = Rs.315,326.47; Diff Rs.11,613.97 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-01C','R-1C');

-- ── R-01D · Mrs. Rashmi Kathuria ──
UPDATE leasing.Units SET CarpetArea=208.64, BuiltupArea=809.9, Owner='Mrs. Rashmi Kathuria'
WHERE Name IN ('R-01D','R-1D');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315326.47, l.SdReceived=315326.47, l.Deposit=315326.47,
       l.CustomerDocRemarks='Customer SD: Rs.125/sqft = Rs.303,712.50; Brand SD: Rs.129.78/sqft = Rs.315,326.47; Diff Rs.11,613.97 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-01D','R-1D');

-- ── R-02A · Mr. Ankit Sharma ──
UPDATE leasing.Units SET CarpetArea=204.33, BuiltupArea=810.87, Owner='Mr. Ankit Sharma'
WHERE Name IN ('R-02A','R-2A');
UPDATE l SET l.CdStatus='Executed', l.SdRate=129.78,
       l.SecurityDeposit=315704.13, l.SdReceived=315704.13, l.Deposit=315704.13,
       l.CustomerDocRemarks='Customer SD: Rs.115/sqft = Rs.279,750.15; Brand SD: Rs.129.78/sqft = Rs.315,704.13; Diff Rs.35,953.98 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-02A','R-2A');

-- ── R-02B · Mr. Gaurav Sharma ──
UPDATE leasing.Units SET CarpetArea=205.47, BuiltupArea=810.87, Owner='Mr. Gaurav Sharma'
WHERE Name IN ('R-02B','R-2B');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315704.13, l.SdReceived=315704.13, l.Deposit=315704.13,
       l.CustomerDocRemarks='Customer SD: Rs.130/sqft = Rs.316,239.30; Brand SD: Rs.129.78/sqft = Rs.315,704.13; Diff Rs.-535.17 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-02B','R-2B');

-- ── R-02C · Mr. Gaurav Sharma ──
UPDATE leasing.Units SET CarpetArea=205.47, BuiltupArea=810.87, Owner='Mr. Gaurav Sharma'
WHERE Name IN ('R-02C','R-2C');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315704.13, l.SdReceived=315704.13, l.Deposit=315704.13,
       l.CustomerDocRemarks='Customer SD: Rs.130/sqft = Rs.316,239.30; Brand SD: Rs.129.78/sqft = Rs.315,704.13; Diff Rs.-535.17 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-02C','R-2C');

-- ── R-02D · Mr. Sumit Gupta ──
UPDATE leasing.Units SET CarpetArea=204.39, BuiltupArea=810.87, Owner='Mr. Sumit Gupta'
WHERE Name IN ('R-02D','R-2D');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=315704.13, l.SdReceived=315704.13, l.Deposit=315704.13,
       l.CustomerDocRemarks='Customer SD: Rs.120/sqft = Rs.291,913.20; Brand SD: Rs.129.78/sqft = Rs.315,704.13; Diff Rs.23,790.93 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-02D','R-2D');

-- ── R-03A · Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra ──
UPDATE leasing.Units SET CarpetArea=210.43, BuiltupArea=676.09, Owner='Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra'
WHERE Name IN ('R-03A','R-3A');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263228.88, l.SdReceived=263228.88, l.Deposit=263228.88,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.202,827.00; Brand SD: Rs.129.78/sqft = Rs.263,228.88; Diff Rs.60,401.88 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-03A','R-3A');

-- ── R-03B · Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra ──
UPDATE leasing.Units SET CarpetArea=211.36, BuiltupArea=676.09, Owner='Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra'
WHERE Name IN ('R-03B','R-3B');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263228.88, l.SdReceived=263228.88, l.Deposit=263228.88,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.202,827.00; Brand SD: Rs.129.78/sqft = Rs.263,228.88; Diff Rs.60,401.88 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-03B','R-3B');

-- ── R-03C · Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra ──
UPDATE leasing.Units SET CarpetArea=211.36, BuiltupArea=676.09, Owner='Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra'
WHERE Name IN ('R-03C','R-3C');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263228.88, l.SdReceived=263228.88, l.Deposit=263228.88,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.202,827.00; Brand SD: Rs.129.78/sqft = Rs.263,228.88; Diff Rs.60,401.88 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-03C','R-3C');

-- ── R-03D · Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra ──
UPDATE leasing.Units SET CarpetArea=210.22, BuiltupArea=676.09, Owner='Mr. Pushpinder Malhotra ; Mr. Shalinder Kumar Malhotra'
WHERE Name IN ('R-03D','R-3D');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263228.88, l.SdReceived=263228.88, l.Deposit=263228.88,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.202,827.00; Brand SD: Rs.129.78/sqft = Rs.263,228.88; Diff Rs.60,401.88 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-03D','R-3D');

-- ── R-04A · Mrs. Mala Mayar ; Ms. Kanika Mayar ──
UPDATE leasing.Units SET CarpetArea=209.59, BuiltupArea=677.11, Owner='Mrs. Mala Mayar ; Ms. Kanika Mayar'
WHERE Name IN ('R-04A','R-4A');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263626.01, l.SdReceived=263626.01, l.Deposit=263626.01,
       l.CustomerDocRemarks='Customer SD: Rs.115/sqft = Rs.233,602.95; Brand SD: Rs.129.78/sqft = Rs.263,626.01; Diff Rs.30,023.06 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-04A','R-4A');

-- ── R-04B · Mr. Anupam Kumar ; Mr. Rakesh Ranjan ──
UPDATE leasing.Units SET CarpetArea=211.02, BuiltupArea=677.11, Owner='Mr. Anupam Kumar ; Mr. Rakesh Ranjan'
WHERE Name IN ('R-04B','R-4B');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263626.01, l.SdReceived=263626.01, l.Deposit=263626.01,
       l.CustomerDocRemarks='Customer SD: Rs.115/sqft = Rs.233,602.95; Brand SD: Rs.129.78/sqft = Rs.263,626.01; Diff Rs.30,023.06 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-04B','R-4B');

-- ── R-04C · M/s. Mittaltech Steel And Cement Private Limited ──
UPDATE leasing.Units SET CarpetArea=211.02, BuiltupArea=677.11, Owner='M/s. Mittaltech Steel And Cement Private Limited'
WHERE Name IN ('R-04C','R-4C');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=263626.01, l.SdReceived=263626.01, l.Deposit=263626.01,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.203,133.00; Brand SD: Rs.129.78/sqft = Rs.263,626.01; Diff Rs.60,493.01 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-04C','R-4C');

-- ── R-04D · Mr. Amit Verma ; Mrs. Richa Verma ──
UPDATE leasing.Units SET CarpetArea=200.81, BuiltupArea=677.11, Owner='Mr. Amit Verma ; Mrs. Richa Verma'
WHERE Name IN ('R-04D','R-4D');
UPDATE l SET l.CdStatus='Executed', l.SdRate=129.78,
       l.SecurityDeposit=263626.01, l.SdReceived=263626.01, l.Deposit=263626.01,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.203,133.00; Brand SD: Rs.129.78/sqft = Rs.263,626.01; Diff Rs.60,493.01 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('R-04D','R-4D');

-- ── K-04 · Mr. Vishal Goyal ──
UPDATE leasing.Units SET CarpetArea=90.6, BuiltupArea=327.08, Owner='Mr. Vishal Goyal'
WHERE Name IN ('K-04','K-4');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=127345.33, l.SdReceived=127345.33, l.Deposit=127345.33,
       l.CustomerDocRemarks='Customer SD: Rs.115/sqft = Rs.112,842.60; Brand SD: Rs.129.78/sqft = Rs.127,345.33; Diff Rs.14,502.73 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-04','K-4');

-- ── K-05 · Ms. Aikta Tyagi ──
UPDATE leasing.Units SET CarpetArea=109.74, BuiltupArea=321.2, Owner='Ms. Aikta Tyagi'
WHERE Name IN ('K-05','K-5');
UPDATE l SET l.CdStatus='Not Executed', l.SdRate=129.78,
       l.SecurityDeposit=125056.01, l.SdReceived=125056.01, l.Deposit=125056.01,
       l.CustomerDocRemarks='Customer SD: Rs.100/sqft = Rs.96,360.00; Brand SD: Rs.129.78/sqft = Rs.125,056.01; Diff Rs.28,696.01 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-05','K-5');

-- ── K-06 · Ms. Jyoti Nagpal ──
UPDATE leasing.Units SET CarpetArea=126.07, BuiltupArea=286.91, Owner='Ms. Jyoti Nagpal'
WHERE Name IN ('K-06','K-6');
UPDATE l SET l.CdStatus='Executed', l.SdRate=129.78,
       l.SecurityDeposit=111705.54, l.SdReceived=111705.54, l.Deposit=111705.54,
       l.CustomerDocRemarks='Customer SD: Rs.120/sqft = Rs.103,287.60; Brand SD: Rs.129.78/sqft = Rs.111,705.54; Diff Rs.8,417.94 (Studio XO final working, Oct-26)'
FROM leasing.Leases l JOIN leasing.Units u ON u.Id=l.UnitId
WHERE u.Name IN ('K-06','K-6');

GO
/* ── Verification ── */
SELECT u.Name AS Unit, u.CarpetArea, u.BuiltupArea, u.Owner,
       l.Code AS Lease, l.CdStatus, l.SdRate, l.Deposit AS BrandSdReceived
FROM leasing.Units u
LEFT JOIN leasing.Leases l ON l.UnitId=u.Id
WHERE u.Name LIKE 'K-%' OR u.Name LIKE 'R-0%'
ORDER BY u.Name;
SELECT COUNT(*) AS UnitsWithOwner FROM leasing.Units
WHERE (Name LIKE 'K-%' OR Name LIKE 'R-0%') AND Owner IS NOT NULL AND Owner<>'';
PRINT 'Studio XO data update complete — expect 22 units with owner.';
