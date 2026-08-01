/* Populates demo data — run with: node seed.js
   Mirrors the seed() function from the original ScoopSense prototype. */
require('dotenv').config();
const { sql, getPool } = require('./db');
const { uid, nextNo, addM, iso } = require('./lib/helpers');
const { genLeaseInvoices, syncRevShare } = require('./lib/billing');

const TODAY = iso(new Date());

async function run() {
  const pool = await getPool();
  console.log('Seeding demo data...');

  const co = async (name) => {
    const id = uid(), code = await nextNo(pool, sql, 'CO');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('name', sql.NVarChar(200), name)
      .query('INSERT INTO dbo.Companies (Id,Code,Name) VALUES (@id,@code,@name)');
    return { id, name };
  };
  const c1 = await co('Vertex Retail Ventures Pvt Ltd');
  const c2 = await co('Brewhouse Hospitality LLP');
  const c3 = await co('Northline Retail Pvt Ltd');

  const as = async (name, city) => {
    const id = uid(), code = await nextNo(pool, sql, 'AST');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('name', sql.NVarChar(200), name).input('city', sql.NVarChar(100), city)
      .query('INSERT INTO dbo.Assets (Id,Code,Name,City) VALUES (@id,@code,@name,@city)');
    return { id, name };
  };
  const a1 = await as('Meridian Mall', 'Mumbai');
  const a2 = await as('Lakeview Centre', 'Pune');

  const bl = async (name, asset, floors) => {
    const id = uid(), code = await nextNo(pool, sql, 'BLK');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('name', sql.NVarChar(200), name)
      .input('assetId', sql.VarChar(40), asset.id).input('floors', sql.Int, floors)
      .query('INSERT INTO dbo.Blocks (Id,Code,Name,AssetId,TotalFloors) VALUES (@id,@code,@name,@assetId,@floors)');
    return { id, name, assetId: asset.id };
  };
  const b1 = await bl('North Wing', a1, 4);
  const b2 = await bl('South Wing', a1, 4);
  const b3 = await bl('Main Block', a2, 3);

  const un = async (name, asset, block, floor, carpet, builtup) => {
    const id = uid(), code = await nextNo(pool, sql, 'UNT');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('name', sql.NVarChar(100), name)
      .input('assetId', sql.VarChar(40), asset.id).input('blockId', sql.VarChar(40), block.id).input('floor', sql.Int, floor)
      .input('carpet', sql.Decimal(18, 2), carpet).input('builtup', sql.Decimal(18, 2), builtup)
      .query(`INSERT INTO dbo.Units (Id,Code,Name,AssetId,BlockId,Floor,CarpetArea,BuiltupArea,Status)
        VALUES (@id,@code,@name,@assetId,@blockId,@floor,@carpet,@builtup,'Vacant')`);
    return { id, name, assetId: asset.id, carpetArea: carpet, builtupArea: builtup };
  };
  const u1 = await un('N-101', a1, b1, 1, 2200, 2600);
  const u3 = await un('S-201', a1, b2, 2, 3600, 4200);
  const u4 = await un('S-G05', a1, b2, 0, 900, 1080);
  const u5 = await un('M-101', a2, b3, 1, 5200, 6100);

  const br = async (name, company, category) => {
    const id = uid(), code = await nextNo(pool, sql, 'BRD');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('name', sql.NVarChar(200), name)
      .input('companyId', sql.VarChar(40), company.id).input('category', sql.NVarChar(50), category)
      .query(`INSERT INTO dbo.Brands (Id,Code,Name,CompanyId,Category,RegularAddress,Address) VALUES (@id,@code,@name,@companyId,@category,'','')`);
    return { id, name, companyId: company.id };
  };
  const br1 = await br('Vertex Hypermart', c1, 'Hypermarket');
  const br2 = await br('Brewhouse Cafe', c2, 'F&B');
  const br3 = await br('Northline Fashion', c3, 'Fashion');

  const usr = async (email, role, active) => {
    const id = uid(), code = await nextNo(pool, sql, 'USR');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('email', sql.NVarChar(200), email)
      .input('pw', sql.NVarChar(200), 'ChangeMe@123').input('role', sql.VarChar(50), role).input('active', sql.VarChar(20), active)
      .query('INSERT INTO dbo.Users (Id,Code,Email,Password,Role,Active) VALUES (@id,@code,@email,@pw,@role,@active)');
  };
  await usr('manager@scoopsense.io', 'Manager', 'Active');
  await usr('leasing@scoopsense.io', 'Leasing Head', 'Active');
  await usr('finance@scoopsense.io', 'Finance Head', 'Active');
  await usr('portfolio@scoopsense.io', 'Center/Portfolio Head', 'Active');

  const mkLease = async (brand, unit, o) => {
    const id = uid(), code = await nextNo(pool, sql, 'LSE');
    const endExclusive = addM(o.start, o.months);
    const endDate = iso(new Date(new Date(endExclusive + 'T00:00:00Z').getTime() - 86400000));
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
      .input('brandId', sql.VarChar(40), brand.id).input('unitId', sql.VarChar(40), unit.id).input('assetId', sql.VarChar(40), unit.assetId)
      .input('start', sql.Date, o.start).input('end', sql.Date, endDate).input('rentalType', sql.VarChar(20), o.rentalType)
      .input('mgBasis', sql.VarChar(20), o.mgBasis).input('mg', sql.Decimal(18, 2), o.mg).input('revSharePct', sql.Decimal(9, 3), o.revSharePct)
      .input('cam', sql.Decimal(18, 2), o.cam).input('utility', sql.Decimal(18, 2), o.utility).input('esc', sql.Decimal(9, 3), o.esc)
      .input('deposit', sql.Decimal(18, 2), o.deposit).input('gst', sql.Decimal(9, 3), o.gst)
      .query(`INSERT INTO dbo.Leases (Id,Code,BrandId,UnitId,AssetId,StartDate,EndDate,RentalType,MgBasis,Mg,RevSharePct,Cam,Utility,Esc,Deposit,Gst,OnHold,Status)
        VALUES (@id,@code,@brandId,@unitId,@assetId,@start,@end,@rentalType,@mgBasis,@mg,@revSharePct,@cam,@utility,@esc,@deposit,@gst,0,'Active')`);
    await pool.request().input('u', sql.VarChar(40), unit.id).query(`UPDATE dbo.Units SET Status='Leased' WHERE Id=@u`);
    return { id, unitId: unit.id, brandId: brand.id };
  };

  const l1 = await mkLease(br1, u5, { start: addM(TODAY, -5), months: 36, rentalType: 'MG', mgBasis: 'PerSqFt', mg: 85, revSharePct: 6, cam: 22, utility: 14, esc: 5, deposit: 1400000, gst: 18 });
  const l2 = await mkLease(br2, u4, { start: addM(TODAY, -3), months: 24, rentalType: 'MGvsRS', mgBasis: 'Lumpsum', mg: 180000, revSharePct: 12, cam: 20, utility: 12, esc: 5, deposit: 540000, gst: 18 });
  const l3 = await mkLease(br3, u3, { start: addM(TODAY, -2), months: 36, rentalType: 'PureRS', mgBasis: 'Lumpsum', mg: 0, revSharePct: 14, cam: 18, utility: 10, esc: 0, deposit: 600000, gst: 18 });
  const l4 = await mkLease(br1, u1, { start: addM(TODAY, -4), months: 60, rentalType: 'MG', mgBasis: 'PerSqFt', mg: 70, revSharePct: 5, cam: 20, utility: 12, esc: 5, deposit: 900000, gst: 18 });

  // Investor units
  const addInvestorUnit = async (unit, investors, status) => {
    const id = uid(), code = await nextNo(pool, sql, 'INV');
    await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code).input('unitId', sql.VarChar(40), unit.id)
      .input('floor', sql.Int, 0).input('status', sql.VarChar(20), status).input('maker', sql.NVarChar(100), 'Leasing Head')
      .input('checker', sql.NVarChar(100), status === 'Approved' ? 'Finance Head' : '').input('created', sql.Date, TODAY)
      .query(`INSERT INTO dbo.InvestorUnits (Id,Code,UnitId,Floor,Status,Maker,Checker,Remarks,CreatedAt) VALUES (@id,@code,@unitId,@floor,@status,@maker,@checker,'',@created)`);
    for (let i = 0; i < investors.length; i++) {
      const x = investors[i];
      await pool.request().input('id', sql.VarChar(40), uid()).input('iv', sql.VarChar(40), id).input('idx', sql.Int, i)
        .input('name', sql.NVarChar(200), x.name).input('area', sql.Decimal(9, 3), x.areaPct).input('disb', sql.Decimal(9, 3), x.disbursePct)
        .input('start', sql.Date, x.start).input('gst', sql.Bit, x.gst ? 1 : 0).input('nri', sql.Bit, x.nri ? 1 : 0)
        .input('bank', sql.NVarChar(150), x.bankName).input('acc', sql.NVarChar(60), x.acc).input('ifsc', sql.NVarChar(20), x.ifsc)
        .query(`INSERT INTO dbo.InvestorUnitInvestors (Id,InvestorUnitId,Idx,Name,AreaPct,DisbursePct,StartDate,Gst,Nri,BankName,Acc,Ifsc)
          VALUES (@id,@iv,@idx,@name,@area,@disb,@start,@gst,@nri,@bank,@acc,@ifsc)`);
    }
    return id;
  };
  await addInvestorUnit(u5, [
    { name: 'Coastline Holdings', areaPct: 60, disbursePct: 60, start: addM(TODAY, -24), gst: true, nri: false, bankName: 'Axis Bank', acc: '9182XXXX2290', ifsc: 'UTIB0001234' },
    { name: 'R. Kapoor (NRI)', areaPct: 40, disbursePct: 40, start: addM(TODAY, -24), gst: false, nri: true, bankName: 'HDFC Bank', acc: '5521XXXX7735', ifsc: 'HDFC0000567' }
  ], 'Approved');
  await addInvestorUnit(u1, [
    { name: 'S. Mehta', areaPct: 100, disbursePct: 100, start: addM(TODAY, -40), gst: true, nri: false, bankName: 'SBI', acc: '2290XXXX1102', ifsc: 'SBIN0000456' }
  ], 'Approved');

  // Generate invoices for last 2 months for each lease, then some sales for RS leases
  const allLeases = [l1, l2, l3, l4];
  for (const l of allLeases) {
    for (let k = 2; k >= 1; k--) {
      const ym = addM(TODAY, -k).slice(0, 7);
      await genLeaseInvoices(pool, l.id, ym);
    }
  }
  for (const l of [l2, l3]) {
    for (let k = 2; k >= 1; k--) {
      const ym = addM(TODAY, -k).slice(0, 7);
      const amt = l.id === l3.id ? 4200000 : 1600000;
      await pool.request().input('id', sql.VarChar(40), uid()).input('l', sql.VarChar(40), l.id).input('y', sql.Char(7), ym).input('amt', sql.Decimal(18, 2), amt)
        .query('INSERT INTO dbo.Sales (Id,LeaseId,Ym,Amount) VALUES (@id,@l,@y,@amt)');
      await syncRevShare(pool, l.id, ym);
    }
  }

  console.log('Seed complete.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
