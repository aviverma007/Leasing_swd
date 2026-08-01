const crypto = require('crypto');
const { SCHEMA } = require('../db');

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex').slice(0, 6);
}

function irnHex() {
  return crypto.randomBytes(16).toString('hex');
}

// yyyy-mm-dd
function iso(d) {
  return d.toISOString().slice(0, 10);
}

// add m months to an ISO date string, clamping day-of-month
function addM(dateStr, m) {
  const x = new Date(dateStr + 'T00:00:00Z');
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + m);
  const dim = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, dim));
  return iso(x);
}

function monthRange(ym) {
  const s = ym + '-01';
  const d = new Date(ym + '-01T00:00:00Z');
  const e = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { s, e };
}

function ymLabel(ym) {
  return new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// generate next sequence code like CO-0001, using the Sequences table
async function nextNo(pool, sql, prefix) {
  const request = pool.request();
  request.input('p', sql.VarChar(10), prefix);
  const result = await request.query(
    `MERGE ${SCHEMA}.Sequences AS target
     USING (SELECT @p AS Prefix) AS src
     ON target.Prefix = src.Prefix
     WHEN MATCHED THEN UPDATE SET LastVal = target.LastVal + 1
     WHEN NOT MATCHED THEN INSERT (Prefix, LastVal) VALUES (@p, 1)
     OUTPUT inserted.LastVal;`
  );
  const val = result.recordset[0].LastVal;
  return `${prefix}-${String(val).padStart(4, '0')}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = { uid, irnHex, iso, addM, monthRange, ymLabel, nextNo, round2 };
