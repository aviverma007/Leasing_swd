/* ============================================================
   Gems-2 Unit Seed — DIRECT SQL (no backend/API needed)
   Run in SSMS against SmartDeskApp. Idempotent: re-run safe.
   Uses schema: leasing   (change if your DB_SCHEMA differs)
   - Reuses the existing project whose name contains 'gems' or 'adhikaansh'
   - Creates company/project if missing
   - Creates blocks Commercial 06/08/09 if missing
   - Inserts all 90 units (skips any that already exist by name)
   ============================================================ */
USE SmartDeskApp;
GO
DECLARE @assetId VARCHAR(40), @companyId VARCHAR(40);

-- company
SELECT TOP 1 @companyId = Id FROM leasing.Companies WHERE Name LIKE '%adhikaansh%' OR Name LIKE '%gems%';
IF @companyId IS NULL BEGIN
  SET @companyId = 'gems2-co';
  INSERT INTO leasing.Companies (Id, Code, Name) VALUES (@companyId, 'CO-G2', 'Adhikaansh Realtors Pvt. Ltd.');
END

-- project (asset)
SELECT TOP 1 @assetId = Id FROM leasing.Assets WHERE Name LIKE '%gems%' OR Name LIKE '%adhikaansh%';
IF @assetId IS NULL BEGIN
  SET @assetId = 'gems2-ast';
  INSERT INTO leasing.Assets (Id, Code, Name, City) VALUES (@assetId, 'AST-G2', 'Gems 2 (Adhikaansh Realtors Pvt. Ltd.)', 'Gurgaon');
END
PRINT 'Using asset: ' + @assetId;

-- ── Commercial 06 ──
DECLARE @blkC06 VARCHAR(40);
SELECT TOP 1 @blkC06 = Id FROM leasing.Blocks WHERE AssetId=@assetId AND Name LIKE '%06%';
IF @blkC06 IS NULL BEGIN
  SET @blkC06 = 'gems2-blk-c06';
  INSERT INTO leasing.Blocks (Id, Code, Name, AssetId, TotalFloors) VALUES (@blkC06, 'BLK-C06', 'Commercial 06', @assetId, 4);
END
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-01' OR Name='G-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-01', 'C06-G-01', 'Commercial 06 - G-01', @assetId, @blkC06, 0, 394.82, 939.91, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-02' OR Name='G-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-02', 'C06-G-02', 'Commercial 06 - G-02', @assetId, @blkC06, 0, 395.9, 847.34, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-03' OR Name='G-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-03', 'C06-G-03', 'Commercial 06 - G-03', @assetId, @blkC06, 0, 396.55, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-04' OR Name='G-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-04', 'C06-G-04', 'Commercial 06 - G-04', @assetId, @blkC06, 0, 396.55, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-05' OR Name='G-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-05', 'C06-G-05', 'Commercial 06 - G-05', @assetId, @blkC06, 0, 396.55, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-06' OR Name='G-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-06', 'C06-G-06', 'Commercial 06 - G-06', @assetId, @blkC06, 0, 396.55, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-07' OR Name='G-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-07', 'C06-G-07', 'Commercial 06 - G-07', @assetId, @blkC06, 0, 396.55, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-08' OR Name='G-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-08', 'C06-G-08', 'Commercial 06 - G-08', @assetId, @blkC06, 0, 372, 833.35, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-09' OR Name='G-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-09', 'C06-G-09', 'Commercial 06 - G-09', @assetId, @blkC06, 0, 87.83, 2143.33, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - G-10' OR Name='G-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-g-10', 'C06-G-10', 'Commercial 06 - G-10', @assetId, @blkC06, 0, 49.3, 1288.24, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-01' OR Name='F-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-01', 'C06-F-01', 'Commercial 06 - F-01', @assetId, @blkC06, 1, 318.08, 707.41, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-02' OR Name='F-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-02', 'C06-F-02', 'Commercial 06 - F-02', @assetId, @blkC06, 1, 329.49, 708.49, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-03' OR Name='F-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-03', 'C06-F-03', 'Commercial 06 - F-03', @assetId, @blkC06, 1, 310, 688.68, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-04' OR Name='F-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-04', 'C06-F-04', 'Commercial 06 - F-04', @assetId, @blkC06, 1, 327.76, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-05' OR Name='F-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-05', 'C06-F-05', 'Commercial 06 - F-05', @assetId, @blkC06, 1, 327.87, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-06' OR Name='F-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-06', 'C06-F-06', 'Commercial 06 - F-06', @assetId, @blkC06, 1, 327.76, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-07' OR Name='F-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-07', 'C06-F-07', 'Commercial 06 - F-07', @assetId, @blkC06, 1, 327.87, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-08' OR Name='F-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-08', 'C06-F-08', 'Commercial 06 - F-08', @assetId, @blkC06, 1, 327.76, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-09' OR Name='F-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-09', 'C06-F-09', 'Commercial 06 - F-09', @assetId, @blkC06, 1, 327.87, 693.2, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-10' OR Name='F-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-10', 'C06-F-10', 'Commercial 06 - F-10', @assetId, @blkC06, 1, 299.89, 668.66, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-11' OR Name='F-11'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-11', 'C06-F-11', 'Commercial 06 - F-11', @assetId, @blkC06, 1, 327.01, 708.49, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - F-12' OR Name='F-12'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-f-12', 'C06-F-12', 'Commercial 06 - F-12', @assetId, @blkC06, 1, 318.29, 707.41, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-01' OR Name='S-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-01', 'C06-S-01', 'Commercial 06 - S-01', @assetId, @blkC06, 2, 361.78, 798.04, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-02' OR Name='S-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-02', 'C06-S-02', 'Commercial 06 - S-02', @assetId, @blkC06, 2, 241.65, 538.85, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-03' OR Name='S-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-03', 'C06-S-03', 'Commercial 06 - S-03', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-04' OR Name='S-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-04', 'C06-S-04', 'Commercial 06 - S-04', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-05' OR Name='S-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-05', 'C06-S-05', 'Commercial 06 - S-05', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-06' OR Name='S-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-06', 'C06-S-06', 'Commercial 06 - S-06', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-07' OR Name='S-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-07', 'C06-S-07', 'Commercial 06 - S-07', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-08' OR Name='S-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-08', 'C06-S-08', 'Commercial 06 - S-08', @assetId, @blkC06, 2, 255.64, 542.51, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-09' OR Name='S-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-09', 'C06-S-09', 'Commercial 06 - S-09', @assetId, @blkC06, 2, 229.81, 516.24, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - S-10' OR Name='S-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-s-10', 'C06-S-10', 'Commercial 06 - S-10', @assetId, @blkC06, 2, 348, 780.17, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-01' OR Name='T-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-01', 'C06-T-01', 'Commercial 06 - T-01', @assetId, @blkC06, 3, 274.16, 620.65, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-02' OR Name='T-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-02', 'C06-T-02', 'Commercial 06 - T-02', @assetId, @blkC06, 3, 366.08, 817.85, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-03' OR Name='T-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-03', 'C06-T-03', 'Commercial 06 - T-03', @assetId, @blkC06, 3, 389.98, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-04' OR Name='T-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-04', 'C06-T-04', 'Commercial 06 - T-04', @assetId, @blkC06, 3, 389.98, 843.9, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-05' OR Name='T-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-05', 'C06-T-05', 'Commercial 06 - T-05', @assetId, @blkC06, 3, 370.07, 825.6, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC06 AND (Name='Commercial 06 - T-06' OR Name='T-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c06-t-06', 'C06-T-06', 'Commercial 06 - T-06', @assetId, @blkC06, 3, 237.56, 559.73, 'Vacant');

-- ── Commercial 08 ──
DECLARE @blkC08 VARCHAR(40);
SELECT TOP 1 @blkC08 = Id FROM leasing.Blocks WHERE AssetId=@assetId AND Name LIKE '%08%';
IF @blkC08 IS NULL BEGIN
  SET @blkC08 = 'gems2-blk-c08';
  INSERT INTO leasing.Blocks (Id, Code, Name, AssetId, TotalFloors) VALUES (@blkC08, 'BLK-C08', 'Commercial 08', @assetId, 4);
END
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - G-01' OR Name='G-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-g-01', 'C08-G-01', 'Commercial 08 - G-01', @assetId, @blkC08, 0, 471.68, 1022.36, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - G-02' OR Name='G-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-g-02', 'C08-G-02', 'Commercial 08 - G-02', @assetId, @blkC08, 0, 582.66, 1238.94, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - F-01' OR Name='F-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-f-01', 'C08-F-01', 'Commercial 08 - F-01', @assetId, @blkC08, 1, 471.68, 1022.36, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - F-02' OR Name='F-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-f-02', 'C08-F-02', 'Commercial 08 - F-02', @assetId, @blkC08, 1, 547.67, 1163.16, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - F-03' OR Name='F-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-f-03', 'C08-F-03', 'Commercial 08 - F-03', @assetId, @blkC08, 1, 231.64, 514.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC08 AND (Name='Commercial 08 - S-01' OR Name='S-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c08-s-01', 'C08-S-01', 'Commercial 08 - S-01', @assetId, @blkC08, 2, 537.45, 1132.59, 'Vacant');

-- ── Commercial 09 ──
DECLARE @blkC09 VARCHAR(40);
SELECT TOP 1 @blkC09 = Id FROM leasing.Blocks WHERE AssetId=@assetId AND Name LIKE '%09%';
IF @blkC09 IS NULL BEGIN
  SET @blkC09 = 'gems2-blk-c09';
  INSERT INTO leasing.Blocks (Id, Code, Name, AssetId, TotalFloors) VALUES (@blkC09, 'BLK-C09', 'Commercial 09', @assetId, 4);
END
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-01' OR Name='G-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-01', 'C09-G-01', 'Commercial 09 - G-01', @assetId, @blkC09, 0, 325.72, 713.37, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-02' OR Name='G-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-02', 'C09-G-02', 'Commercial 09 - G-02', @assetId, @blkC09, 0, 317.22, 672.99, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-03' OR Name='G-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-03', 'C09-G-03', 'Commercial 09 - G-03', @assetId, @blkC09, 0, 317.22, 668.44, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-04' OR Name='G-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-04', 'C09-G-04', 'Commercial 09 - G-04', @assetId, @blkC09, 0, 317.22, 668.44, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-05' OR Name='G-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-05', 'C09-G-05', 'Commercial 09 - G-05', @assetId, @blkC09, 0, 317.22, 668.44, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-06' OR Name='G-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-06', 'C09-G-06', 'Commercial 09 - G-06', @assetId, @blkC09, 0, 317.22, 668.44, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-07' OR Name='G-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-07', 'C09-G-07', 'Commercial 09 - G-07', @assetId, @blkC09, 0, 315.22, 680.31, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-08' OR Name='G-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-08', 'C09-G-08', 'Commercial 09 - G-08', @assetId, @blkC09, 0, 250.26, 572.73, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-09' OR Name='G-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-09', 'C09-G-09', 'Commercial 09 - G-09', @assetId, @blkC09, 0, 148.97, 329.38, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-10' OR Name='G-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-10', 'C09-G-10', 'Commercial 09 - G-10', @assetId, @blkC09, 0, 202.04, 430.34, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-11' OR Name='G-11'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-11', 'C09-G-11', 'Commercial 09 - G-11', @assetId, @blkC09, 0, 207.75, 442.4, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-12' OR Name='G-12'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-12', 'C09-G-12', 'Commercial 09 - G-12', @assetId, @blkC09, 0, 207.75, 442.4, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - G-14' OR Name='G-14'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-g-14', 'C09-G-14', 'Commercial 09 - G-14', @assetId, @blkC09, 0, 207.21, 448.64, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-01' OR Name='F-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-01', 'C09-F-01', 'Commercial 09 - F-01', @assetId, @blkC09, 1, 262.21, 579.1, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-02' OR Name='F-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-02', 'C09-F-02', 'Commercial 09 - F-02', @assetId, @blkC09, 1, 255, 540.14, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-03' OR Name='F-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-03', 'C09-F-03', 'Commercial 09 - F-03', @assetId, @blkC09, 1, 255, 540.14, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-04' OR Name='F-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-04', 'C09-F-04', 'Commercial 09 - F-04', @assetId, @blkC09, 1, 255, 540.14, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-05' OR Name='F-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-05', 'C09-F-05', 'Commercial 09 - F-05', @assetId, @blkC09, 1, 255, 540.14, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-06' OR Name='F-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-06', 'C09-F-06', 'Commercial 09 - F-06', @assetId, @blkC09, 1, 255, 540.14, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-07' OR Name='F-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-07', 'C09-F-07', 'Commercial 09 - F-07', @assetId, @blkC09, 1, 253.49, 549.93, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-08' OR Name='F-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-08', 'C09-F-08', 'Commercial 09 - F-08', @assetId, @blkC09, 1, 308.28, 685.67, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-09' OR Name='F-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-09', 'C09-F-09', 'Commercial 09 - F-09', @assetId, @blkC09, 1, 148.97, 329.38, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-10' OR Name='F-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-10', 'C09-F-10', 'Commercial 09 - F-10', @assetId, @blkC09, 1, 202.04, 430.34, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-11' OR Name='F-11'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-11', 'C09-F-11', 'Commercial 09 - F-11', @assetId, @blkC09, 1, 207.75, 442.4, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-12' OR Name='F-12'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-12', 'C09-F-12', 'Commercial 09 - F-12', @assetId, @blkC09, 1, 207.75, 442.4, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-14' OR Name='F-14'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-14', 'C09-F-14', 'Commercial 09 - F-14', @assetId, @blkC09, 1, 207.21, 444.12, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - F-15' OR Name='F-15'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-f-15', 'C09-F-15', 'Commercial 09 - F-15', @assetId, @blkC09, 1, 158.93, 347.89, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-01' OR Name='S-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-01', 'C09-S-01', 'Commercial 09 - S-01', @assetId, @blkC09, 2, 241.33, 534.54, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-02' OR Name='S-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-02', 'C09-S-02', 'Commercial 09 - S-02', @assetId, @blkC09, 2, 234.55, 497.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-03' OR Name='S-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-03', 'C09-S-03', 'Commercial 09 - S-03', @assetId, @blkC09, 2, 234.55, 497.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-04' OR Name='S-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-04', 'C09-S-04', 'Commercial 09 - S-04', @assetId, @blkC09, 2, 234.55, 497.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-05' OR Name='S-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-05', 'C09-S-05', 'Commercial 09 - S-05', @assetId, @blkC09, 2, 234.55, 497.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-06' OR Name='S-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-06', 'C09-S-06', 'Commercial 09 - S-06', @assetId, @blkC09, 2, 234.55, 497.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-07' OR Name='S-07'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-07', 'C09-S-07', 'Commercial 09 - S-07', @assetId, @blkC09, 2, 233.15, 506.34, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-08' OR Name='S-08'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-08', 'C09-S-08', 'Commercial 09 - S-08', @assetId, @blkC09, 2, 111.62, 250.59, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-09' OR Name='S-09'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-09', 'C09-S-09', 'Commercial 09 - S-09', @assetId, @blkC09, 2, 169.75, 364.04, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-10' OR Name='S-10'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-10', 'C09-S-10', 'Commercial 09 - S-10', @assetId, @blkC09, 2, 199.56, 425.18, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-11' OR Name='S-11'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-11', 'C09-S-11', 'Commercial 09 - S-11', @assetId, @blkC09, 2, 199.89, 426.25, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-12' OR Name='S-12'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-12', 'C09-S-12', 'Commercial 09 - S-12', @assetId, @blkC09, 2, 199.46, 427.55, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - S-14' OR Name='S-14'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-s-14', 'C09-S-14', 'Commercial 09 - S-14', @assetId, @blkC09, 2, 158.98, 347.98, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-01' OR Name='T-01'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-01', 'C09-T-01', 'Commercial 09 - T-01', @assetId, @blkC09, 3, 109.15, 556.61, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-02' OR Name='T-02'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-02', 'C09-T-02', 'Commercial 09 - T-02', @assetId, @blkC09, 3, 168.67, 690.3, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-03' OR Name='T-03'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-03', 'C09-T-03', 'Commercial 09 - T-03', @assetId, @blkC09, 3, 198.6, 751.44, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-04' OR Name='T-04'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-04', 'C09-T-04', 'Commercial 09 - T-04', @assetId, @blkC09, 3, 198.92, 752.52, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-05' OR Name='T-05'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-05', 'C09-T-05', 'Commercial 09 - T-05', @assetId, @blkC09, 3, 198.92, 752.52, 'Vacant');
IF NOT EXISTS (SELECT 1 FROM leasing.Units WHERE BlockId=@blkC09 AND (Name='Commercial 09 - T-06' OR Name='T-06'))
  INSERT INTO leasing.Units (Id, Code, Name, AssetId, BlockId, Floor, CarpetArea, BuiltupArea, Status) VALUES ('g2-c09-t-06', 'C09-T-06', 'Commercial 09 - T-06', @assetId, @blkC09, 3, 224.97, 862.41, 'Vacant');

GO
SELECT b.Name AS Block, COUNT(*) AS Units FROM leasing.Units u JOIN leasing.Blocks b ON b.Id=u.BlockId
WHERE u.AssetId IN (SELECT Id FROM leasing.Assets WHERE Name LIKE '%gems%' OR Name LIKE '%adhikaansh%')
GROUP BY b.Name;
PRINT 'Gems-2 unit seed complete.';
