const express = require('express');
const { getPool } = require('../db');
const router = express.Router();

const GL = {
  MG: '410100 Rental Income', RevShare: '410200 Revenue Share', CAM: '420100 CAM Income',
  Utility: '420200 Utility Income', Adhoc: '410900 Other Income', Disb: '210100 Investor Payable', TDS: '140500 TDS Receivable'
};

router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const disb = await pool.request().query(`SELECT ISNULL(SUM(NetPayable),0) net, ISNULL(SUM(TdsAmt),0) tds, COUNT(*) cnt FROM dbo.Disbursals WHERE Status<>'Void'`);
    const holds = await pool.request().query(`SELECT COUNT(*) cnt FROM dbo.Leases WHERE OnHold=1`);
    const sd = await pool.request().query(`SELECT ISNULL(SUM(Deposit),0) total FROM dbo.Leases WHERE Status='Active'`);
    res.json({
      totalNet: Number(disb.recordset[0].net), totalTds: Number(disb.recordset[0].tds), voucherCount: disb.recordset[0].cnt,
      holdLeases: holds.recordset[0].cnt, securityDeposit: Number(sd.recordset[0].total)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sap-entries', async (req, res) => {
  try {
    const pool = await getPool();
    const invs = await pool.request().query('SELECT No, Type, Total FROM dbo.Invoices');
    const disbs = await pool.request().query(`SELECT No, NetPayable, TdsAmt FROM dbo.Disbursals WHERE Status='Processed'`);
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
    const result = await pool.request().query('SELECT TOP 50 * FROM dbo.ChangeLog ORDER BY LogDate DESC');
    res.json(result.recordset.map(r => ({ id: r.Id, date: r.LogDate, type: r.Type, ref: r.Ref, detail: r.Detail, by: r.ByUser })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
