/* Import Center — bulk Excel upload for every data type.
   POST /api/import/:type  { rows: [...], commit: false }  → validates every row, returns per-row results
   POST /api/import/:type  { rows: [...], commit: true  }  → re-validates, inserts the valid rows
   Nothing touches the database in validate mode. Commits respect maker–checker:
   leases and collections land as Pending; sales upsert and resync rev-share.
   Every commit writes one summary audit entry plus the usual per-record 'created' audit. */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo, iso } = require('../lib/helpers');
const { canEdit } = require('../lib/permissions');
const { logAudit, userName } = require('../lib/audit');
const router = express.Router();

const MAX_ROWS = 2000;

/* ── helpers ─────────────────────────────────────────────────────────── */
const norm = (s) => String(s == null ? '' : s).trim();
const low = (s) => norm(s).toLowerCase();
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
/* Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, ISO datetime, Excel serial number */
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return iso(v);
  const s = norm(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.slice(0, 10)); return isNaN(d) ? NaN : s.slice(0, 10); }
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // DD/MM/YYYY (Indian)
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return (d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1) ? d.toISOString().slice(0, 10) : NaN;
  }
  if (/^\d{4,6}$/.test(s)) { // Excel serial
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return isNaN(d) ? NaN : d.toISOString().slice(0, 10);
  }
  return NaN;
}
/* Month: YYYY-MM, MM/YYYY, or any parsable date → its month */
function parseYm(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = norm(v);
  if (/^\d{4}-\d{2}$/.test(s)) { const mm = +s.slice(5, 7); return mm >= 1 && mm <= 12 ? s : NaN; }
  const m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2, '0')}`;
  const d = parseDate(s);
  return (d && d !== true && !Number.isNaN(d)) ? String(d).slice(0, 7) : NaN;
}
const yesNo = (v) => ['yes', 'y', 'true', '1'].includes(low(v));
/* case-insensitive lookup map name → row, with a near-miss suggester */
function makeLookup(rows, nameKey) {
  const map = new Map();
  rows.forEach((r) => map.set(low(r[nameKey]), r));
  return {
    get: (name) => map.get(low(name)) || null,
    suggest: (name) => {
      const strip = (s) => low(s).replace(/[^a-z0-9]/g, '');
      const n = strip(name);
      if (!n) return null;
      for (const [k, r] of map) { const ks = strip(k); if (ks.includes(n) || n.includes(ks)) return r[nameKey]; }
      return null;
    },
    has: (name) => map.has(low(name))
  };
}
/* read a field from a row by several acceptable header spellings */
function field(row, ...names) {
  const keys = Object.keys(row);
  for (const want of names) {
    const k = keys.find((x) => low(x).replace(/[^a-z0-9%]/g, '') === low(want).replace(/[^a-z0-9%]/g, ''));
    if (k !== undefined) return row[k];
  }
  return undefined;
}

/* ── per-type definitions: module (edit permission), validate(ctx,row), commit(pool,data,by) ── */
const TYPES = {

  units: {
    module: 'units', label: 'Unit',
    async ctx(pool) {
      const [u, a, b] = await Promise.all([
        pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Units`),
        pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Assets`),
        pool.request().query(`SELECT Id, Name, AssetId FROM ${SCHEMA}.Blocks`)
      ]);
      return { units: makeLookup(u.recordset, 'Name'), assets: makeLookup(a.recordset, 'Name'), blocks: makeLookup(b.recordset, 'Name'), assetRows: a.recordset, seen: new Set() };
    },
    validate(ctx, row) {
      const name = norm(field(row, 'Unit Name', 'Unit', 'Name'));
      if (!name) return { error: 'Unit Name is required.', col: 'Unit Name' };
      if (ctx.units.has(name)) return { error: `Unit "${name}" already exists — edit it in Unit Master instead.`, col: 'Unit Name' };
      if (ctx.seen.has(low(name))) return { error: `Duplicate in file: "${name}" appears more than once.`, col: 'Unit Name' };
      const assetName = norm(field(row, 'Asset', 'Asset Name', 'Project'));
      let assetId = null;
      if (assetName) {
        const a = ctx.assets.get(assetName);
        if (!a) { const sg = ctx.assets.suggest(assetName); return { error: `Asset "${assetName}" not found${sg ? ` — did you mean "${sg}"?` : '.'}`, col: 'Asset' }; }
        assetId = a.Id;
      } else if (ctx.assetRows.length === 1) assetId = ctx.assetRows[0].Id;
      const blockName = norm(field(row, 'Block'));
      let blockId = null;
      if (blockName) { const b = ctx.blocks.get(blockName); if (!b) return { error: `Block "${blockName}" not found.`, col: 'Block' }; blockId = b.Id; }
      const builtup = num(field(row, 'Builtup Area (sqft)', 'Builtup Area', 'Builtup'));
      const carpet = num(field(row, 'Carpet Area (sqft)', 'Carpet Area', 'Carpet'));
      const card = num(field(row, 'Card Rate (Rs/sqft)', 'Card Rate', 'CardRate'));
      for (const [v, l] of [[builtup, 'Builtup Area'], [carpet, 'Carpet Area'], [card, 'Card Rate']]) {
        if (Number.isNaN(v)) return { error: `${l} is not a number.`, col: l };
        if (v != null && v < 0) return { error: `${l} cannot be negative.`, col: l };
      }
      const status = norm(field(row, 'Status')) || 'Vacant';
      if (!['Vacant', 'Leased', 'Blocked'].includes(status)) return { error: `Status must be Vacant, Leased or Blocked (got "${status}").`, col: 'Status' };
      ctx.seen.add(low(name));
      return { data: { name, assetId, blockId, floor: num(field(row, 'Floor')) || 0, builtup, carpet, card, unitType: norm(field(row, 'Unit Type')), owner: norm(field(row, 'Owner')), status }, summary: `${name}${card ? ` · card ₹${card}/sqft` : ''}` };
    },
    async commit(pool, d, by) {
      const id = uid(); const code = await nextNo(pool, sql, 'UNT');
      await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('n', sql.NVarChar(200), d.name).input('a', sql.VarChar(40), d.assetId).input('b', sql.VarChar(40), d.blockId)
        .input('f', sql.Int, d.floor).input('bu', sql.Decimal(18, 2), d.builtup).input('ca', sql.Decimal(18, 2), d.carpet)
        .input('cr', sql.Decimal(18, 2), d.card).input('ut', sql.NVarChar(80), d.unitType || null)
        .input('ow', sql.NVarChar(150), d.owner || null).input('st', sql.VarChar(20), d.status)
        .query(`INSERT INTO ${SCHEMA}.Units (Id,Code,Name,AssetId,BlockId,Floor,BuiltupArea,CarpetArea,CardRate,UnitType,Owner,Status)
                VALUES (@id,@code,@n,@a,@b,@f,@bu,@ca,@cr,@ut,@ow,@st)`);
      await logAudit(pool, 'units', id, 'created', `Unit ${d.name} created (imported from Excel)`, by);
      return code;
    }
  },

  brands: {
    module: 'brands', label: 'Brand',
    async ctx(pool) {
      const b = await pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Brands`);
      return { brands: makeLookup(b.recordset, 'Name'), seen: new Set() };
    },
    validate(ctx, row) {
      const name = norm(field(row, 'Brand Name', 'Brand', 'Name'));
      if (!name) return { error: 'Brand Name is required.', col: 'Brand Name' };
      if (ctx.brands.has(name)) return { error: `Brand "${name}" already exists.`, col: 'Brand Name' };
      if (ctx.seen.has(low(name))) return { error: `Duplicate in file: "${name}".` };
      const email = norm(field(row, 'Billing Email', 'Email'));
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: `"${email}" is not a valid e-mail.`, col: 'Billing Email' };
      const gstin = norm(field(row, 'GSTIN'));
      if (gstin && gstin.length !== 15) return { error: `GSTIN must be 15 characters (got ${gstin.length}).`, col: 'GSTIN' };
      const pan = norm(field(row, 'PAN'));
      if (pan && !/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(pan)) return { error: `"${pan}" is not a valid PAN.`, col: 'PAN' };
      ctx.seen.add(low(name));
      return { data: { name, category: norm(field(row, 'Category')), email, gstin, pan, address: norm(field(row, 'Address')) }, summary: `${name}${email ? ' · ' + email : ''}` };
    },
    async commit(pool, d, by) {
      const id = uid(); const code = await nextNo(pool, sql, 'BRD');
      await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('n', sql.NVarChar(200), d.name).input('c', sql.NVarChar(100), d.category || null)
        .input('e', sql.NVarChar(200), d.email || null).input('g', sql.NVarChar(20), d.gstin || null)
        .input('p', sql.NVarChar(20), d.pan || null).input('ad', sql.NVarChar(400), d.address || null)
        .query(`INSERT INTO ${SCHEMA}.Brands (Id,Code,Name,Category,Email,Gstin,PanNo,Address) VALUES (@id,@code,@n,@c,@e,@g,@p,@ad)`);
      await logAudit(pool, 'brands', id, 'created', `Brand ${d.name} created (imported from Excel)`, by);
      return code;
    }
  },

  brokers: {
    module: 'brands', label: 'Broker',
    async ctx(pool) {
      const b = await pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Brokers`);
      return { brokers: makeLookup(b.recordset, 'Name'), seen: new Set() };
    },
    validate(ctx, row) {
      const name = norm(field(row, 'Broker Name', 'Broker', 'Name'));
      if (!name) return { error: 'Broker Name is required.', col: 'Broker Name' };
      if (ctx.brokers.has(name)) return { error: `Broker "${name}" already exists.`, col: 'Broker Name' };
      if (ctx.seen.has(low(name))) return { error: `Duplicate in file: "${name}".` };
      ctx.seen.add(low(name));
      return { data: { name, firm: norm(field(row, 'Firm')), phone: norm(field(row, 'Phone')), email: norm(field(row, 'Email')), pan: norm(field(row, 'PAN')), rera: norm(field(row, 'RERA No', 'RERA')) }, summary: name };
    },
    async commit(pool, d, by) {
      const id = uid(); const code = await nextNo(pool, sql, 'BRK');
      await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('n', sql.NVarChar(200), d.name).input('f', sql.NVarChar(200), d.firm || null)
        .input('ph', sql.NVarChar(40), d.phone || null).input('e', sql.NVarChar(200), d.email || null)
        .input('p', sql.NVarChar(20), d.pan || null).input('r', sql.NVarChar(60), d.rera || null)
        .query(`INSERT INTO ${SCHEMA}.Brokers (Id,Code,Name,Firm,Phone,Email,PanNo,ReraNo,Active) VALUES (@id,@code,@n,@f,@ph,@e,@p,@r,1)`);
      await logAudit(pool, 'brokers', id, 'created', `Broker ${d.name} created (imported from Excel)`, by);
      return code;
    }
  },

  customers: {
    module: 'units', label: 'Customer',
    async ctx(pool) {
      const c = await pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Customers`);
      return { customers: makeLookup(c.recordset, 'Name'), seen: new Set() };
    },
    validate(ctx, row) {
      const name = norm(field(row, 'Customer Name', 'Customer', 'Name'));
      if (!name) return { error: 'Customer Name is required.', col: 'Customer Name' };
      if (ctx.customers.has(name)) return { error: `Customer "${name}" already exists.`, col: 'Customer Name' };
      if (ctx.seen.has(low(name))) return { error: `Duplicate in file: "${name}".` };
      ctx.seen.add(low(name));
      return { data: { name, custType: norm(field(row, 'Type', 'Customer Type')), phone: norm(field(row, 'Phone')), email: norm(field(row, 'Email')), pan: norm(field(row, 'PAN')), gstin: norm(field(row, 'GSTIN')), address: norm(field(row, 'Address')), nri: yesNo(field(row, 'NRI (Yes/No)', 'NRI')) }, summary: name };
    },
    async commit(pool, d, by) {
      const id = uid(); const code = await nextNo(pool, sql, 'CUS');
      await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('n', sql.NVarChar(200), d.name).input('t', sql.NVarChar(60), d.custType || null)
        .input('ph', sql.NVarChar(40), d.phone || null).input('e', sql.NVarChar(200), d.email || null)
        .input('p', sql.NVarChar(20), d.pan || null).input('g', sql.NVarChar(20), d.gstin || null)
        .input('ad', sql.NVarChar(400), d.address || null).input('nri', sql.Bit, d.nri ? 1 : 0)
        .query(`INSERT INTO ${SCHEMA}.Customers (Id,Code,Name,CustType,Phone,Email,PanNo,Gstin,Address,Nri,Active) VALUES (@id,@code,@n,@t,@ph,@e,@p,@g,@ad,@nri,1)`);
      await logAudit(pool, 'customers', id, 'created', `Customer ${d.name} created (imported from Excel)`, by);
      return code;
    }
  },

  sales: {
    module: 'sales', label: 'Sales entry',
    async ctx(pool) {
      const l = await pool.request().query(`SELECT Id, Code, RentalType, Status FROM ${SCHEMA}.Leases`);
      return { leases: makeLookup(l.recordset, 'Code'), seen: new Set() };
    },
    validate(ctx, row) {
      const code = norm(field(row, 'Lease Code', 'Lease'));
      if (!code) return { error: 'Lease Code is required (e.g. LSE-0047).', col: 'Lease Code' };
      const lease = ctx.leases.get(code);
      if (!lease) { const sg = ctx.leases.suggest(code); return { error: `Lease "${code}" not found${sg ? ` — did you mean "${sg}"?` : '.'}`, col: 'Lease Code' }; }
      const ym = parseYm(field(row, 'Month (YYYY-MM)', 'Month', 'Ym'));
      if (!ym) return { error: 'Month is required (YYYY-MM, e.g. 2026-10).', col: 'Month' };
      if (Number.isNaN(ym)) return { error: `Month "${norm(field(row, 'Month (YYYY-MM)', 'Month', 'Ym'))}" is not a valid YYYY-MM.`, col: 'Month' };
      const amount = num(field(row, 'Sales Amount', 'Amount', 'Sales'));
      if (amount == null || Number.isNaN(amount)) return { error: 'Sales Amount is required and must be a number.', col: 'Sales Amount' };
      if (amount < 0) return { error: 'Sales Amount cannot be negative.', col: 'Sales Amount' };
      const key = low(code) + '|' + ym;
      if (ctx.seen.has(key)) return { error: `Duplicate in file: ${code} / ${ym} appears more than once.`, col: 'Month' };
      ctx.seen.add(key);
      return { data: { leaseId: lease.Id, code: lease.Code, ym, amount }, summary: `${lease.Code} · ${ym} · ₹${amount.toLocaleString('en-IN')}` };
    },
    async commit(pool, d, by) {
      const existing = await pool.request().input('l', sql.VarChar(40), d.leaseId).input('y', sql.Char(7), d.ym)
        .query(`SELECT TOP 1 Id FROM ${SCHEMA}.Sales WHERE LeaseId=@l AND Ym=@y`);
      if (existing.recordset[0]) {
        await pool.request().input('id', sql.VarChar(40), existing.recordset[0].Id).input('amt', sql.Decimal(18, 2), d.amount)
          .query(`UPDATE ${SCHEMA}.Sales SET Amount=@amt WHERE Id=@id`);
      } else {
        await pool.request().input('id', sql.VarChar(40), uid()).input('l', sql.VarChar(40), d.leaseId)
          .input('y', sql.Char(7), d.ym).input('amt', sql.Decimal(18, 2), d.amount)
          .query(`INSERT INTO ${SCHEMA}.Sales (Id,LeaseId,Ym,Amount) VALUES (@id,@l,@y,@amt)`);
      }
      const { genLeaseInvoices, syncRevShare } = require('../lib/billing');
      try { await genLeaseInvoices(pool, d.leaseId, d.ym); await syncRevShare(pool, d.leaseId, d.ym); } catch (_) { /* non-RS lease */ }
      await logAudit(pool, 'sales', d.leaseId, 'edited', `Sales ${d.ym}: ₹${d.amount.toLocaleString('en-IN')} (imported from Excel)`, by);
      return d.code + ' ' + d.ym;
    }
  },

  collections: {
    module: 'collections', label: 'Receipt',
    async ctx(pool) {
      const i = await pool.request().query(`SELECT Id, No, Total, DocStatus FROM ${SCHEMA}.Invoices`);
      const refs = await pool.request().query(`SELECT Ref FROM ${SCHEMA}.Collections WHERE Ref IS NOT NULL AND Ref <> ''`);
      return { invoices: makeLookup(i.recordset, 'No'), refs: new Set(refs.recordset.map((r) => low(r.Ref))), seen: new Set() };
    },
    validate(ctx, row) {
      const no = norm(field(row, 'Invoice No', 'Invoice'));
      if (!no) return { error: 'Invoice No is required (e.g. INV-0112).', col: 'Invoice No' };
      const inv = ctx.invoices.get(no);
      if (!inv) { const sg = ctx.invoices.suggest(no); return { error: `Invoice "${no}" not found${sg ? ` — did you mean "${sg}"?` : '.'}`, col: 'Invoice No' }; }
      if ((inv.DocStatus || 'Approved') !== 'Approved') return { error: `Invoice ${inv.No} is ${inv.DocStatus} — receipts can only be recorded against approved invoices.`, col: 'Invoice No' };
      const date = parseDate(field(row, 'Date (YYYY-MM-DD)', 'Date', 'Receipt Date'));
      if (!date) return { error: 'Date is required (YYYY-MM-DD or DD/MM/YYYY).', col: 'Date' };
      if (Number.isNaN(date)) return { error: `Date "${norm(field(row, 'Date (YYYY-MM-DD)', 'Date', 'Receipt Date'))}" is not a valid date.`, col: 'Date' };
      const amount = num(field(row, 'Amount', 'Receipt Amount'));
      if (amount == null || Number.isNaN(amount) || amount <= 0) return { error: 'Amount must be a positive number.', col: 'Amount' };
      const tdsPct = num(field(row, 'TDS %', 'TDS')) || 0;
      if (Number.isNaN(tdsPct) || tdsPct < 0 || tdsPct > 30) return { error: 'TDS % must be between 0 and 30.', col: 'TDS %' };
      let instrument = norm(field(row, 'Instrument (NEFT/Cheque)', 'Instrument', 'Mode')) || 'NEFT';
      instrument = instrument.toLowerCase() === 'cheque' ? 'Cheque' : 'NEFT';
      const ref = norm(field(row, 'Reference (UTR/Cheque No)', 'Reference', 'Ref', 'UTR'));
      if (ref && ctx.refs.has(low(ref))) return { error: `Reference "${ref}" already exists on another receipt — looks like a duplicate.`, col: 'Reference' };
      if (ref && ctx.seen.has(low(ref))) return { error: `Duplicate in file: reference "${ref}".`, col: 'Reference' };
      if (ref) ctx.seen.add(low(ref));
      return { data: { invoiceId: inv.Id, invNo: inv.No, date, amount, tdsPct, instrument, ref }, summary: `${inv.No} · ₹${amount.toLocaleString('en-IN')} · ${instrument}${ref ? ' ' + ref : ''}` };
    },
    async commit(pool, d, by) {
      const id = uid(); const no = await nextNo(pool, sql, 'RCT');
      const tds = Math.round(d.amount * d.tdsPct) / 100;
      await pool.request()
        .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('inv', sql.VarChar(40), d.invoiceId)
        .input('dt', sql.Date, d.date).input('amt', sql.Decimal(18, 2), d.amount)
        .input('tp', sql.Decimal(9, 3), d.tdsPct).input('tds', sql.Decimal(18, 2), tds)
        .input('ins', sql.VarChar(20), d.instrument).input('ref', sql.NVarChar(100), d.ref || '')
        .input('by', sql.NVarChar(150), by)
        .query(`INSERT INTO ${SCHEMA}.Collections (Id,No,InvoiceId,CollDate,Amount,TdsPct,Tds,Instrument,Ref,DocStatus,CreatedBy,CreatedAt)
                VALUES (@id,@no,@inv,@dt,@amt,@tp,@tds,@ins,@ref,'Pending',@by,SYSDATETIME())`);
      await logAudit(pool, 'collections', id, 'created', `Receipt ${no} of ₹${d.amount.toLocaleString('en-IN')} against ${d.invNo} (imported from Excel) — pending approval`, by);
      return no;
    }
  },

  leases: {
    module: 'leases', label: 'Lease',
    async ctx(pool) {
      const [b, u] = await Promise.all([
        pool.request().query(`SELECT Id, Name FROM ${SCHEMA}.Brands`),
        pool.request().query(`SELECT Id, Name, AssetId, Status FROM ${SCHEMA}.Units`)
      ]);
      return { brands: makeLookup(b.recordset, 'Name'), units: makeLookup(u.recordset, 'Name'), seen: new Set() };
    },
    validate(ctx, row) {
      const brandName = norm(field(row, 'Brand Name', 'Brand'));
      const unitName = norm(field(row, 'Unit Name', 'Unit'));
      if (!brandName) return { error: 'Brand Name is required.', col: 'Brand Name' };
      if (!unitName) return { error: 'Unit Name is required.', col: 'Unit Name' };
      const brand = ctx.brands.get(brandName);
      if (!brand) { const sg = ctx.brands.suggest(brandName); return { error: `Brand "${brandName}" not found${sg ? ` — did you mean "${sg}"?` : ' — import brands first.'}`, col: 'Brand Name' }; }
      const unit = ctx.units.get(unitName);
      if (!unit) { const sg = ctx.units.suggest(unitName); return { error: `Unit "${unitName}" not found${sg ? ` — did you mean "${sg}"?` : ' — import units first.'}`, col: 'Unit Name' }; }
      if (low(unit.Status) === 'leased') return { error: `Unit ${unit.Name} is already Leased.`, col: 'Unit Name' };
      if (ctx.seen.has(low(unitName))) return { error: `Duplicate in file: unit "${unitName}" used by more than one lease.`, col: 'Unit Name' };
      ctx.seen.add(low(unitName));
      const start = parseDate(field(row, 'Start Date', 'Start'));
      const end = parseDate(field(row, 'End Date', 'End'));
      if (!start || Number.isNaN(start)) return { error: 'Start Date is required (YYYY-MM-DD or DD/MM/YYYY).', col: 'Start Date' };
      if (!end || Number.isNaN(end)) return { error: 'End Date is required (YYYY-MM-DD or DD/MM/YYYY).', col: 'End Date' };
      if (end <= start) return { error: `End Date (${end}) must be after Start Date (${start}).`, col: 'End Date' };
      const rt = norm(field(row, 'Rental Type', 'Type')) || 'MG';
      const RT = { mg: 'MG', mgvsrs: 'MGvsRS', purers: 'PureRS', varrs: 'VarRS' }[low(rt).replace(/[^a-z]/g, '')];
      if (!RT) return { error: `Rental Type must be MG, MGvsRS, PureRS or VarRS (got "${rt}").`, col: 'Rental Type' };
      const mg = num(field(row, 'MG', 'MG Amount')) || 0;
      const mgBasis = low(field(row, 'MG Basis (PerSqFt/Lumpsum)', 'MG Basis')) === 'lumpsum' ? 'Lumpsum' : 'PerSqFt';
      const rs = num(field(row, 'Rev Share %', 'RS %')) || 0;
      if (RT !== 'PureRS' && !mg) return { error: `${RT} lease needs an MG amount.`, col: 'MG' };
      if (RT !== 'MG' && !rs) return { error: `${RT} lease needs a Rev Share %.`, col: 'Rev Share %' };
      for (const [v, l] of [[mg, 'MG'], [rs, 'Rev Share %'], [num(field(row, 'CAM (Rs/sqft)', 'CAM')), 'CAM'], [num(field(row, 'Escalation %', 'Esc %')), 'Escalation %'], [num(field(row, 'Deposit')), 'Deposit'], [num(field(row, 'GST %')), 'GST %'], [num(field(row, 'Lock-in Months', 'Lockin')), 'Lock-in Months']]) {
        if (Number.isNaN(v)) return { error: `${l} is not a number.`, col: l };
      }
      const rentStart = parseDate(field(row, 'Rent Start Date (optional)', 'Rent Start Date', 'RCD'));
      if (Number.isNaN(rentStart)) return { error: 'Rent Start Date is not a valid date.', col: 'Rent Start Date' };
      return {
        data: {
          brandId: brand.Id, unitId: unit.Id, assetId: unit.AssetId, brandName: brand.Name, unitName: unit.Name,
          start, end, rentalType: RT, mg, mgBasis, rs,
          cam: num(field(row, 'CAM (Rs/sqft)', 'CAM')) || 0, utility: num(field(row, 'Utility (Rs/sqft)', 'Utility')) || 0,
          esc: num(field(row, 'Escalation %', 'Esc %')) || 0, deposit: num(field(row, 'Deposit')) || 0,
          gst: num(field(row, 'GST %')) ?? 18, lockin: num(field(row, 'Lock-in Months', 'Lockin')) || 0, rentStart
        },
        summary: `${brand.Name} @ ${unit.Name} · ${RT} · ${start} → ${end}`
      };
    },
    async commit(pool, d, by) {
      const id = uid(); const code = await nextNo(pool, sql, 'LSE');
      await pool.request()
        .input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('b', sql.VarChar(40), d.brandId).input('u', sql.VarChar(40), d.unitId).input('a', sql.VarChar(40), d.assetId)
        .input('s', sql.Date, d.start).input('e', sql.Date, d.end)
        .input('rt', sql.VarChar(20), d.rentalType).input('mb', sql.VarChar(20), d.mgBasis)
        .input('mg', sql.Decimal(18, 2), d.mg).input('rs', sql.Decimal(9, 3), d.rs)
        .input('cam', sql.Decimal(18, 2), d.cam).input('ut', sql.Decimal(18, 2), d.utility)
        .input('esc', sql.Decimal(9, 3), d.esc).input('dep', sql.Decimal(18, 2), d.deposit)
        .input('gst', sql.Decimal(9, 3), d.gst).input('lk', sql.Int, d.lockin)
        .input('rsd', sql.Date, d.rentStart || null).input('by', sql.NVarChar(150), by)
        .query(`INSERT INTO ${SCHEMA}.Leases (Id,Code,BrandId,UnitId,AssetId,StartDate,EndDate,RentalType,MgBasis,Mg,RevSharePct,Cam,Utility,Esc,Deposit,Gst,LockinMonths,RentStartDate,OnHold,Status,LifecycleStage,DocStatus,SubmittedBy,SubmittedAt,CreatedBy,CreatedAt)
                VALUES (@id,@code,@b,@u,@a,@s,@e,@rt,@mb,@mg,@rs,@cam,@ut,@esc,@dep,@gst,@lk,@rsd,0,'Active','Active','Pending',@by,SYSDATETIME(),@by,SYSDATETIME())`);
      await pool.request().input('u', sql.VarChar(40), d.unitId).query(`UPDATE ${SCHEMA}.Units SET Status='Leased' WHERE Id=@u`);
      await logAudit(pool, 'leases', id, 'created', `Lease ${code} — ${d.brandName} @ ${d.unitName} (imported from Excel) — pending approval`, by);
      return code;
    }
  },

  investorunits: {
    module: 'investors', label: 'Investor unit',
    async ctx(pool) {
      const [u, iu] = await Promise.all([
        pool.request().query(`SELECT Id, Name, Floor FROM ${SCHEMA}.Units`),
        pool.request().query(`SELECT UnitId FROM ${SCHEMA}.InvestorUnits`)
      ]);
      return { units: makeLookup(u.recordset, 'Name'), existing: new Set(iu.recordset.map((r) => r.UnitId)), groups: new Map() };
    },
    /* rows with the same Unit Name become ONE investor-unit record; Disburse % must total 100 per unit */
    validate(ctx, row) {
      const unitName = norm(field(row, 'Unit Name', 'Unit'));
      const invName = norm(field(row, 'Investor Name', 'Investor'));
      if (!unitName) return { error: 'Unit Name is required.', col: 'Unit Name' };
      if (!invName) return { error: 'Investor Name is required.', col: 'Investor Name' };
      const unit = ctx.units.get(unitName);
      if (!unit) { const sg = ctx.units.suggest(unitName); return { error: `Unit "${unitName}" not found${sg ? ` — did you mean "${sg}"?` : '.'}`, col: 'Unit Name' }; }
      if (ctx.existing.has(unit.Id)) return { error: `Unit ${unit.Name} already has an investor record — edit it in Investor Units.`, col: 'Unit Name' };
      const area = num(field(row, 'Area %')) || 0;
      const disb = num(field(row, 'Disburse %', 'Disbursement %'));
      if (disb == null || Number.isNaN(disb) || disb <= 0) return { error: 'Disburse % must be a positive number.', col: 'Disburse %' };
      if (Number.isNaN(area)) return { error: 'Area % is not a number.', col: 'Area %' };
      const g = ctx.groups.get(low(unitName)) || { unitId: unit.Id, unitName: unit.Name, floor: unit.Floor || 0, investors: [], total: 0 };
      g.investors.push({ name: invName, area, disb, nri: yesNo(field(row, 'NRI (Yes/No)', 'NRI')), bank: norm(field(row, 'Bank')), acc: norm(field(row, 'Account No', 'Account')), ifsc: norm(field(row, 'IFSC')) });
      g.total += disb;
      ctx.groups.set(low(unitName), g);
      return { data: { group: low(unitName) }, summary: `${unit.Name} · ${invName} · ${disb}%`, deferred: true };
    },
    /* called once after all rows validated — reject whole groups whose % don't total 100 */
    finalize(ctx, results) {
      for (const r of results) {
        if (r.status !== 'ok' || !r.data || !r.data.group) continue;
        const g = ctx.groups.get(r.data.group);
        if (g && Math.abs(g.total - 100) > 0.5) { r.status = 'error'; r.message = `Unit ${g.unitName}: Disburse % across its rows totals ${g.total}% — must be 100%.`; r.col = 'Disburse %'; }
      }
    },
    async commit(pool, d, by, ctx) {
      const g = ctx.groups.get(d.group);
      if (!g || g.done) return g && g.code;
      g.done = true;
      const id = uid(); const code = await nextNo(pool, sql, 'INV');
      await pool.request().input('id', sql.VarChar(40), id).input('code', sql.VarChar(20), code)
        .input('u', sql.VarChar(40), g.unitId).input('f', sql.Int, g.floor)
        .input('mk', sql.NVarChar(100), by).input('cd', sql.Date, iso(new Date()))
        .query(`INSERT INTO ${SCHEMA}.InvestorUnits (Id,Code,UnitId,Floor,Status,Maker,Checker,Remarks,CreatedAt) VALUES (@id,@code,@u,@f,'Pending',@mk,'','Imported from Excel',@cd)`);
      for (let i = 0; i < g.investors.length; i++) {
        const x = g.investors[i];
        await pool.request().input('id', sql.VarChar(40), uid()).input('p', sql.VarChar(40), id).input('ix', sql.Int, i)
          .input('n', sql.NVarChar(200), x.name).input('ap', sql.Decimal(9, 3), x.area).input('dp', sql.Decimal(9, 3), x.disb)
          .input('sd', sql.Date, iso(new Date())).input('g', sql.Bit, 0).input('nri', sql.Bit, x.nri ? 1 : 0)
          .input('bk', sql.NVarChar(200), x.bank || null).input('ac', sql.NVarChar(60), x.acc || null).input('if', sql.NVarChar(20), x.ifsc || null)
          .query(`INSERT INTO ${SCHEMA}.InvestorUnitInvestors (Id,InvestorUnitId,Idx,Name,AreaPct,DisbursePct,StartDate,Gst,Nri,BankName,Acc,Ifsc) VALUES (@id,@p,@ix,@n,@ap,@dp,@sd,@g,@nri,@bk,@ac,@if)`);
      }
      await logAudit(pool, 'investors', id, 'created', `Investor unit ${g.unitName} with ${g.investors.length} investor(s) (imported from Excel) — pending approval`, by);
      g.code = code;
      return code;
    }
  }
};

/* ── upload history ──────────────────────────────────────────────────── */
router.get('/history', async (req, res) => {
  try {
    const pool = await getPool();
    const t = String(req.query.type || '').trim();
    const reqq = pool.request();
    let where = '';
    if (t) { reqq.input('t', sql.VarChar(30), t); where = 'WHERE ImportType=@t'; }
    const r = await reqq.query(`SELECT TOP 100 Id, ImportType, FileName, TotalRows, Imported, Rejected, ByUser, At FROM ${SCHEMA}.ImportLog ${where} ORDER BY At DESC`);
    res.json(r.recordset.map((x) => ({ id: x.Id, type: x.ImportType, fileName: x.FileName, total: x.TotalRows, imported: x.Imported, rejected: x.Rejected, by: x.ByUser, at: new Date(x.At).toISOString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── the one route ───────────────────────────────────────────────────── */
router.post('/:type', async (req, res) => {
  try {
    const def = TYPES[req.params.type];
    if (!def) return res.status(404).json({ error: 'Unknown import type.' });
    const role = req.user && req.user.role;
    if (!(role === 'Admin' || canEdit(role, def.module))) {
      return res.status(403).json({ error: `Your role (${role || 'unknown'}) cannot create ${def.label.toLowerCase()}s.` });
    }
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No data rows found in the file.' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (${rows.length}) — split the file (max ${MAX_ROWS}).` });
    const commit = !!req.body.commit;
    const fileName = norm(req.body.fileName || '');

    const pool = await getPool();
    const ctx = await def.ctx(pool);
    const results = rows.map((row, i) => {
      const blank = Object.values(row).every((v) => norm(v) === '');
      if (blank) return { row: i + 2, status: 'skip', message: 'Blank row — ignored.' };
      try {
        const r = def.validate(ctx, row);
        if (r.error) return { row: i + 2, status: 'error', message: r.error, col: r.col || null };
        return { row: i + 2, status: 'ok', message: r.summary, data: r.data };
      } catch (e) { return { row: i + 2, status: 'error', message: e.message }; }
    });
    if (def.finalize) def.finalize(ctx, results);

    let imported = 0, failed = 0;
    if (commit) {
      const by = userName(req);
      for (const r of results) {
        if (r.status !== 'ok') continue;
        try { const code = await def.commit(pool, r.data, by, ctx); r.status = 'imported'; r.code = code; imported++; }
        catch (e) { r.status = 'error'; r.message = 'Database error: ' + e.message; failed++; }
      }
      const rejected = results.filter(r => r.status === 'error').length;
      await logAudit(pool, 'settings', 'import-' + req.params.type, 'imported',
        `Excel import (${def.label}): ${imported} imported, ${rejected} rejected, of ${rows.length} row(s)${fileName ? ` from ${fileName}` : ''}`, by);
      try {
        await pool.request().input('id', sql.VarChar(40), uid()).input('t', sql.VarChar(30), req.params.type)
          .input('f', sql.NVarChar(300), fileName || null).input('tot', sql.Int, rows.length)
          .input('im', sql.Int, imported).input('rj', sql.Int, rejected).input('by', sql.NVarChar(150), by)
          .query(`INSERT INTO ${SCHEMA}.ImportLog (Id,ImportType,FileName,TotalRows,Imported,Rejected,ByUser) VALUES (@id,@t,@f,@tot,@im,@rj,@by)`);
      } catch (_) { /* history table optional */ }
    }
    res.json({
      type: req.params.type, commit,
      counts: {
        total: rows.length,
        ok: results.filter((r) => r.status === 'ok').length,
        imported,
        errors: results.filter((r) => r.status === 'error').length,
        skipped: results.filter((r) => r.status === 'skip').length
      },
      results: results.map(({ data, ...rest }) => rest)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

/* exported for tests and the QA harness */
module.exports._internals = { parseDate, parseYm, field, makeLookup, num, TYPES };
