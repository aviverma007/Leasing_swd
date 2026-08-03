/* =====================================================================
   FULL RESET of all leasing data (SmartDeskApp, schema 'leasing').
   Deletes ALL rows from every leasing table in FK-safe (child->parent) order.
   Does NOT touch dbo.* (SmartDesk portal tables are untouched).
   Does NOT drop tables or schema — structure stays; only rows are removed.

   >>> BACK UP SmartDeskApp FIRST. This is irreversible. <<<

   Run in SSMS against SmartDeskApp, or via: npm run reset-leasing
   ===================================================================== */
SET NOCOUNT ON;

PRINT 'Deleting leasing data (child -> parent)...';

-- 1) deepest children first
IF OBJECT_ID('leasing.Disbursals','U') IS NOT NULL DELETE FROM leasing.Disbursals;
IF OBJECT_ID('leasing.Collections','U') IS NOT NULL DELETE FROM leasing.Collections;
IF OBJECT_ID('leasing.Sales','U') IS NOT NULL DELETE FROM leasing.Sales;
IF OBJECT_ID('leasing.Invoices','U') IS NOT NULL DELETE FROM leasing.Invoices;

-- 2) investor unit lines then units
IF OBJECT_ID('leasing.InvestorUnitInvestors','U') IS NOT NULL DELETE FROM leasing.InvestorUnitInvestors;
IF OBJECT_ID('leasing.InvestorUnits','U') IS NOT NULL DELETE FROM leasing.InvestorUnits;

-- 3) leases
IF OBJECT_ID('leasing.Leases','U') IS NOT NULL DELETE FROM leasing.Leases;

-- 4) deletion requests reference records by id (no FK, but clear anyway)
IF OBJECT_ID('leasing.DeletionRequests','U') IS NOT NULL DELETE FROM leasing.DeletionRequests;

-- 5) masters: units -> blocks -> assets ; brands -> companies
IF OBJECT_ID('leasing.Units','U') IS NOT NULL DELETE FROM leasing.Units;
IF OBJECT_ID('leasing.Blocks','U') IS NOT NULL DELETE FROM leasing.Blocks;
IF OBJECT_ID('leasing.Assets','U') IS NOT NULL DELETE FROM leasing.Assets;
IF OBJECT_ID('leasing.Brands','U') IS NOT NULL DELETE FROM leasing.Brands;
IF OBJECT_ID('leasing.Companies','U') IS NOT NULL DELETE FROM leasing.Companies;

-- 6) sequences (so codes restart cleanly). Users are KEPT (login accounts).
IF OBJECT_ID('leasing.Sequences','U') IS NOT NULL DELETE FROM leasing.Sequences;

PRINT 'Leasing data cleared. Users/login accounts were preserved.';
GO
