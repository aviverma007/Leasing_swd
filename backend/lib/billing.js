const { sql, SCHEMA } = require('../db');
const { uid, nextNo, monthRange, round2, irnHex } = require('./helpers');

function mgAmount(lease, unit) {
  return lease.MgBasis === 'PerSqFt' ? (Number(lease.Mg) || 0) * (Number(unit.BuiltupArea) || 0) : (Number(lease.Mg) || 0);
}

async function getLease(pool, leaseId) {
  const row = await pool.request().input('id', sql.VarChar(40), leaseId).query(`SELECT * FROM ${SCHEMA}.Leases WHERE Id=@id`);
  return row.recordset[0];
}
async function getUnit(pool, unitId) {
  const row = await pool.request().input('id', sql.VarChar(40), unitId).query(`SELECT * FROM ${SCHEMA}.Units WHERE Id=@id`);
  return row.recordset[0];
}

async function invoiceExists(pool, leaseId, ym, type) {
  const r = await pool.request().input('l', sql.VarChar(40), leaseId).input('y', sql.Char(7), ym).input('t', sql.VarChar(20), type)
    .query(`SELECT COUNT(*) cnt FROM ${SCHEMA}.Invoices WHERE LeaseId=@l AND Ym=@y AND Type=@t`);
  return r.recordset[0].cnt > 0;
}

async function pushInvoice(pool, lease, type, desc, amount, ym, due) {
  if (amount <= 0) return 0;
  const gstAmt = round2(amount * Number(lease.Gst) / 100);
  const total = round2(amount + gstAmt);
  const id = uid();
  const no = await nextNo(pool, sql, 'INV');
  await pool.request()
    .input('id', sql.VarChar(40), id).input('no', sql.VarChar(20), no).input('type', sql.VarChar(20), type)
    .input('leaseId', sql.VarChar(40), lease.Id).input('brandId', sql.VarChar(40), lease.BrandId).input('unitId', sql.VarChar(40), lease.UnitId)
    .input('ym', sql.Char(7), ym).input('desc', sql.NVarChar(300), desc).input('amount', sql.Decimal(18, 2), round2(amount))
    .input('gstPct', sql.Decimal(9, 3), lease.Gst).input('gstAmt', sql.Decimal(18, 2), gstAmt).input('total', sql.Decimal(18, 2), total)
    .input('due', sql.Date, due).input('irn', sql.VarChar(64), irnHex())
    .query(`INSERT INTO ${SCHEMA}.Invoices (Id,No,Type,LeaseId,BrandId,UnitId,Ym,Descr,Amount,GstPct,GstAmt,Total,DueDate,Irn,Status)
      VALUES (@id,@no,@type,@leaseId,@brandId,@unitId,@ym,@desc,@amount,@gstPct,@gstAmt,@total,@due,@irn,'Unpaid')`);
  return 1;
}

// mirrors genLeaseInvoices() from the original app
async function genLeaseInvoices(pool, leaseId, ym) {
  const lease = await getLease(pool, leaseId);
  if (!lease) return 0;
  const unit = await getUnit(pool, lease.UnitId);
  const { s: due } = monthRange(ym);
  let made = 0;

  if (['MG', 'MGvsRS'].includes(lease.RentalType) && !(await invoiceExists(pool, leaseId, ym, 'MG'))) {
    made += await pushInvoice(pool, lease, 'MG', `Minimum Guarantee — ${ym}`, mgAmount(lease, unit), ym, due);
  }
  if (Number(lease.Cam) > 0 && !(await invoiceExists(pool, leaseId, ym, 'CAM'))) {
    made += await pushInvoice(pool, lease, 'CAM', `CAM charges — ${ym}`, Number(lease.Cam) * Number(unit.BuiltupArea), ym, due);
  }
  if (Number(lease.Utility) > 0 && !(await invoiceExists(pool, leaseId, ym, 'Utility'))) {
    made += await pushInvoice(pool, lease, 'Utility', `Utility charges — ${ym}`, Number(lease.Utility) * Number(unit.BuiltupArea), ym, due);
  }
  await syncRevShare(pool, leaseId, ym);
  return made;
}

// mirrors syncRevShare() from the original app: create/adjust/delete the RevShare invoice for a month
async function syncRevShare(pool, leaseId, ym) {
  const lease = await getLease(pool, leaseId);
  if (!lease || !['PureRS', 'MGvsRS', 'VarRS'].includes(lease.RentalType)) return;
  const unit = await getUnit(pool, lease.UnitId);

  const saleRow = await pool.request().input('l', sql.VarChar(40), leaseId).input('y', sql.Char(7), ym)
    .query(`SELECT TOP 1 * FROM ${SCHEMA}.Sales WHERE LeaseId=@l AND Ym=@y`);
  const sales = saleRow.recordset[0] ? Number(saleRow.recordset[0].Amount) : 0;
  const rs = sales * Number(lease.RevSharePct) / 100;
  let billable = rs;
  if (lease.RentalType === 'MGvsRS') billable = Math.max(0, rs - mgAmount(lease, unit));

  const existingRow = await pool.request().input('l', sql.VarChar(40), leaseId).input('y', sql.Char(7), ym)
    .query(`SELECT * FROM ${SCHEMA}.Invoices WHERE LeaseId=@l AND Ym=@y AND Type='RevShare'`);
  const existing = existingRow.recordset[0];

  if (billable <= 0) {
    if (existing) {
      const paidRow = await pool.request().input('id', sql.VarChar(40), existing.Id).query(
        `SELECT ISNULL(SUM(Amount),0) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=@id`);
      if (Number(paidRow.recordset[0].paid) <= 0) {
        await pool.request().input('id', sql.VarChar(40), existing.Id).query(`DELETE FROM ${SCHEMA}.Invoices WHERE Id=@id`);
      }
    }
    return;
  }

  const gstAmt = round2(billable * Number(lease.Gst) / 100);
  const total = round2(billable + gstAmt);
  const desc = `Revenue share ${lease.RevSharePct}% ${lease.RentalType === 'MGvsRS' ? '(excess over MG) ' : ''}— ${ym}`;

  if (existing) {
    await pool.request().input('id', sql.VarChar(40), existing.Id).input('amount', sql.Decimal(18, 2), round2(billable))
      .input('gstAmt', sql.Decimal(18, 2), gstAmt).input('total', sql.Decimal(18, 2), total).input('desc', sql.NVarChar(300), desc)
      .query(`UPDATE ${SCHEMA}.Invoices SET Amount=@amount, GstAmt=@gstAmt, Total=@total, Descr=@desc WHERE Id=@id`);
  } else {
    const { s: due } = monthRange(ym);
    await pushInvoice(pool, lease, 'RevShare', desc, billable, ym, due);
  }
}

// mirrors rentCollectedForUnit(): net-of-GST rent (MG + RevShare only) collected in a month for a unit
async function rentCollectedForUnit(pool, unitId, ym) {
  const { s, e } = monthRange(ym);
  const row = await pool.request().input('u', sql.VarChar(40), unitId).input('s', sql.Date, s).input('e', sql.Date, e).query(`
    SELECT ISNULL(SUM(c.Amount * CASE WHEN i.Total > 0 THEN i.Amount / i.Total ELSE 1 END), 0) AS total
    FROM ${SCHEMA}.Collections c
    JOIN ${SCHEMA}.Invoices i ON i.Id = c.InvoiceId
    JOIN ${SCHEMA}.Leases l ON l.Id = i.LeaseId
    WHERE l.UnitId=@u AND i.Type IN ('MG','RevShare') AND c.CollDate >= @s AND c.CollDate <= @e
  `);
  return Number(row.recordset[0].total) || 0;
}

module.exports = { mgAmount, genLeaseInvoices, syncRevShare, rentCollectedForUnit, getLease, getUnit };
