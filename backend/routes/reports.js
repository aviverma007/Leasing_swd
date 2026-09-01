const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const router = express.Router();

const GL = {
  MG: '410100 Rental Income', RevShare: '410200 Revenue Share', CAM: '420100 CAM Income',
  Utility: '420200 Utility Income', Adhoc: '410900 Other Income', Disb: '210100 Investor Payable', TDS: '140500 TDS Receivable'
};

router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const disb = await pool.request().query(`SELECT ISNULL(SUM(NetPayable),0) net, ISNULL(SUM(TdsAmt),0) tds, COUNT(*) cnt FROM ${SCHEMA}.Disbursals WHERE Status<>'Void'`);
    const holds = await pool.request().query(`SELECT COUNT(*) cnt FROM ${SCHEMA}.Leases WHERE OnHold=1`);
    const sd = await pool.request().query(`SELECT ISNULL(SUM(Deposit),0) total FROM ${SCHEMA}.Leases WHERE Status='Active'`);
    res.json({
      totalNet: Number(disb.recordset[0].net), totalTds: Number(disb.recordset[0].tds), voucherCount: disb.recordset[0].cnt,
      holdLeases: holds.recordset[0].cnt, securityDeposit: Number(sd.recordset[0].total)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sap-entries', async (req, res) => {
  try {
    const pool = await getPool();
    const invs = await pool.request().query(`SELECT No, Type, Total FROM ${SCHEMA}.Invoices`);
    const disbs = await pool.request().query(`SELECT No, NetPayable, TdsAmt FROM ${SCHEMA}.Disbursals WHERE Status='Processed'`);
    const rows = [];
    invs.recordset.forEach(i => rows.push({ gl: (GL[i.Type] || '410900 Other Income').split(' ')[0], doc: i.No, type: i.Type + ' income', amount: Number(i.Total) }));
    disbs.recordset.forEach(d => {
      rows.push({ gl: '210100', doc: d.No, type: 'Investor disbursement', amount: Number(d.NetPayable) });
      if (Number(d.TdsAmt) > 0) rows.push({ gl: '140500', doc: d.No, type: 'TDS on rent', amount: Number(d.TdsAmt) });
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/log', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT TOP 50 * FROM ${SCHEMA}.ChangeLog ORDER BY LogDate DESC`);
    res.json(result.recordset.map(r => ({ id: r.Id, date: r.LogDate, type: r.Type, ref: r.Ref, detail: r.Detail, by: r.ByUser })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GST Reconciliation: month-wise invoiced vs collected ── */
router.get('/gst-recon', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await pool.request().query(`
      SELECT
        i.Ym,
        ISNULL(SUM(i.Amount),0)      AS TaxableValue,
        ISNULL(SUM(i.GstAmt),0)      AS TotalGst,
        ISNULL(SUM(i.CgstAmt),0)     AS CgstInvoiced,
        ISNULL(SUM(i.SgstAmt),0)     AS SgstInvoiced,
        ISNULL(SUM(i.IgstAmt),0)     AS IgstInvoiced,
        ISNULL(SUM(i.Total),0)       AS GrossInvoiced,
        ISNULL(SUM(c.collected),0)   AS TotalCollected,
        COUNT(DISTINCT i.Id)         AS InvoiceCount
      FROM ${SCHEMA}.Invoices i
      OUTER APPLY (SELECT SUM(Amount) collected FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c
      GROUP BY i.Ym
      ORDER BY i.Ym DESC`);
    res.json(rows.recordset.map(r => ({
      ym: r.Ym,
      taxableValue: Number(r.TaxableValue),
      totalGst: Number(r.TotalGst),
      cgstInvoiced: Number(r.CgstInvoiced),
      sgstInvoiced: Number(r.SgstInvoiced),
      igstInvoiced: Number(r.IgstInvoiced),
      grossInvoiced: Number(r.GrossInvoiced),
      totalCollected: Number(r.TotalCollected),
      invoiceCount: r.InvoiceCount,
      outstanding: Number(r.GrossInvoiced) - Number(r.TotalCollected)
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── TDS Reconciliation: TDS deducted per collection ── */
router.get('/tds-recon', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await pool.request().query(`
      SELECT
        c.No           AS ReceiptNo,
        c.CollDate,
        i.No           AS InvoiceNo,
        i.Type         AS InvoiceType,
        i.Ym,
        b.Name         AS BrandName,
        c.Amount       AS AmtReceived,
        c.TdsPct,
        c.Tds          AS TdsDeducted,
        c.Instrument,
        c.Ref
      FROM ${SCHEMA}.Collections c
      JOIN ${SCHEMA}.Invoices i ON i.Id=c.InvoiceId
      JOIN ${SCHEMA}.Brands b ON b.Id=i.BrandId
      WHERE c.Tds > 0
      ORDER BY c.CollDate DESC`);
    const totals = await pool.request().query(`
      SELECT ISNULL(SUM(Tds),0) totalTds, ISNULL(SUM(Amount),0) totalAmt
      FROM ${SCHEMA}.Collections WHERE Tds>0`);
    res.json({
      rows: rows.recordset.map(r => ({
        receiptNo: r.ReceiptNo, collDate: r.CollDate?.toISOString().slice(0, 10),
        invoiceNo: r.InvoiceNo, invoiceType: r.InvoiceType, ym: r.Ym,
        brandName: r.BrandName, amtReceived: Number(r.AmtReceived),
        tdsPct: Number(r.TdsPct), tdsDeducted: Number(r.TdsDeducted),
        instrument: r.Instrument, ref: r.Ref
      })),
      totalTdsDeducted: Number(totals.recordset[0].totalTds),
      totalAmtReceived: Number(totals.recordset[0].totalAmt)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Agreement Reconciliation: lease terms vs actual billing ── */
router.get('/agreement-recon', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await pool.request().query(`
      SELECT
        l.Id           AS LeaseId,
        l.Code         AS LeaseCode,
        b.Name         AS BrandName,
        u.Name         AS UnitName,
        l.StartDate,
        l.EndDate,
        l.RentalType,
        l.Mg,
        l.MgBasis,
        l.RevSharePct,
        l.Cam,
        l.Utility,
        l.Gst,
        l.Deposit,
        ISNULL(inv_mg.billed,0)   AS MgBilled,
        ISNULL(inv_rs.billed,0)   AS RsBilled,
        ISNULL(inv_cam.billed,0)  AS CamBilled,
        ISNULL(coll.received,0)   AS TotalReceived,
        ISNULL(coll.tds,0)        AS TdsReceived
      FROM ${SCHEMA}.Leases l
      JOIN ${SCHEMA}.Brands b ON b.Id=l.BrandId
      JOIN ${SCHEMA}.Units u ON u.Id=l.UnitId
      OUTER APPLY (SELECT ISNULL(SUM(Amount),0) billed FROM ${SCHEMA}.Invoices WHERE LeaseId=l.Id AND Type='MG') inv_mg
      OUTER APPLY (SELECT ISNULL(SUM(Amount),0) billed FROM ${SCHEMA}.Invoices WHERE LeaseId=l.Id AND Type='RevShare') inv_rs
      OUTER APPLY (SELECT ISNULL(SUM(Amount),0) billed FROM ${SCHEMA}.Invoices WHERE LeaseId=l.Id AND Type='CAM') inv_cam
      OUTER APPLY (SELECT ISNULL(SUM(c.Amount),0) received, ISNULL(SUM(c.Tds),0) tds
        FROM ${SCHEMA}.Collections c JOIN ${SCHEMA}.Invoices i ON i.Id=c.InvoiceId WHERE i.LeaseId=l.Id) coll
      ORDER BY b.Name`);
    res.json(rows.recordset.map(r => ({
      leaseId: r.LeaseId, leaseCode: r.LeaseCode, brandName: r.BrandName, unitName: r.UnitName,
      startDate: r.StartDate?.toISOString().slice(0, 10), endDate: r.EndDate?.toISOString().slice(0, 10),
      rentalType: r.RentalType, mg: Number(r.Mg || 0), mgBasis: r.MgBasis,
      revSharePct: Number(r.RevSharePct || 0), cam: Number(r.Cam || 0),
      utility: Number(r.Utility || 0), gst: Number(r.Gst || 0), deposit: Number(r.Deposit || 0),
      mgBilled: Number(r.MgBilled), rsBilled: Number(r.RsBilled), camBilled: Number(r.CamBilled),
      totalReceived: Number(r.TotalReceived), tdsReceived: Number(r.TdsReceived)
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Security Deposit Reconciliation: SD received, adjusted, balance ── */
router.get('/sd-recon', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await pool.request().query(`
      SELECT
        l.Id AS LeaseId,
        l.Code AS LeaseCode,
        b.Name AS BrandName,
        u.Name AS UnitName,
        l.Deposit AS SdAgreed,
        ISNULL(sd.sdCollected,0)  AS SdCollected,
        ISNULL(sd.sdAdjusted,0)   AS SdAdjusted
      FROM ${SCHEMA}.Leases l
      JOIN ${SCHEMA}.Brands b ON b.Id=l.BrandId
      JOIN ${SCHEMA}.Units u ON u.Id=l.UnitId
      OUTER APPLY (
        SELECT ISNULL(SUM(c.SdAdjAmt),0) sdAdjusted,
               ISNULL(SUM(CASE WHEN c.Instrument='SD-Adjust' THEN 0 ELSE c.Amount END),0) sdCollected
        FROM ${SCHEMA}.Collections c
        JOIN ${SCHEMA}.Invoices i ON i.Id=c.InvoiceId
        WHERE i.LeaseId=l.Id
      ) sd
      WHERE l.Deposit IS NOT NULL AND l.Deposit>0
      ORDER BY b.Name`);
    res.json(rows.recordset.map(r => ({
      leaseId: r.LeaseId, leaseCode: r.LeaseCode,
      brandName: r.BrandName, unitName: r.UnitName,
      sdAgreed: Number(r.SdAgreed || 0),
      sdCollected: Number(r.SdCollected),
      sdAdjusted: Number(r.SdAdjusted),
      sdBalance: Number(r.SdAgreed || 0) - Number(r.SdAdjusted)
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Billing Alerts: leases with no invoice this month + overdue invoices ── */
router.get('/alerts', async (req, res) => {
  try {
    const pool = await getPool();
    const today = new Date().toISOString().slice(0, 10);
    const ym = today.slice(0, 7);

    // Active leases with no MG invoice for current month
    const dueRows = await pool.request().input('ym', sql.Char(7), ym).query(`
      SELECT l.Id, l.Code, b.Name AS BrandName, u.Name AS UnitName, l.RentalType
      FROM ${SCHEMA}.Leases l
      JOIN ${SCHEMA}.Brands b ON b.Id=l.BrandId
      JOIN ${SCHEMA}.Units u ON u.Id=l.UnitId
      WHERE l.Status='Active' AND l.OnHold=0
        AND ISNULL(l.AlertsEnabled,1)=1
        AND l.RentalType IN ('MG','MGvsRS')
        AND NOT EXISTS (SELECT 1 FROM ${SCHEMA}.Invoices WHERE LeaseId=l.Id AND Ym=@ym AND Type='MG')`);

    // Overdue invoices
    const overdueRows = await pool.request().input('today', sql.Date, today).query(`
      SELECT i.No, i.Type, b.Name AS BrandName, i.DueDate, i.Total,
        ISNULL(c.paid,0) AS Paid
      FROM ${SCHEMA}.Invoices i
      JOIN ${SCHEMA}.Brands b ON b.Id=i.BrandId
      OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c
      WHERE i.DueDate < @today AND ISNULL(c.paid,0) + 0.5 < i.Total
      ORDER BY i.DueDate ASC`);

    // Invoices due within 7 days
    const upcomingRows = await pool.request().input('today', sql.Date, today)
      .input('soon', sql.Date, new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).query(`
      SELECT i.No, i.Type, b.Name AS BrandName, i.DueDate, i.Total,
        ISNULL(c.paid,0) AS Paid
      FROM ${SCHEMA}.Invoices i
      JOIN ${SCHEMA}.Brands b ON b.Id=i.BrandId
      OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id) c
      WHERE i.DueDate >= @today AND i.DueDate <= @soon AND ISNULL(c.paid,0) + 0.5 < i.Total
      ORDER BY i.DueDate ASC`);

    res.json({
      billingDue: dueRows.recordset.map(r => ({ leaseId: r.Id, leaseCode: r.Code, brandName: r.BrandName, unitName: r.UnitName, rentalType: r.RentalType })),
      overdue: overdueRows.recordset.map(r => ({ no: r.No, type: r.Type, brandName: r.BrandName, dueDate: r.DueDate?.toISOString().slice(0, 10), total: Number(r.Total), paid: Number(r.Paid), balance: Number(r.Total) - Number(r.Paid) })),
      upcoming: upcomingRows.recordset.map(r => ({ no: r.No, type: r.Type, brandName: r.BrandName, dueDate: r.DueDate?.toISOString().slice(0, 10), total: Number(r.Total), paid: Number(r.Paid), balance: Number(r.Total) - Number(r.Paid) }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
