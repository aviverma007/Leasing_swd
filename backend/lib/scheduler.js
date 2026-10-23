/* Auto-billing scheduler.
   Every 30 minutes it checks: if today's day-of-month >= AUTOBILL_DAY (default 1)
   and the current month has not been auto-billed yet (Settings key), it generates
   invoices for every eligible lease (Active status + Active lifecycle stage, not
   on hold), records the run, writes the ChangeLog, and emails a digest when SMTP
   is configured. Disable entirely with AUTOBILL=0 in .env. */
const { sql, SCHEMA } = require('../db');
const { uid } = require('./helpers');
const { genLeaseInvoices } = require('./billing');
const mailer = require('./mailer');

const CHECK_MS = 30 * 60 * 1000;

function curYM() { return new Date().toISOString().slice(0, 7); }

async function hasRun(pool, ym) {
  const r = await pool.request().input('k', sql.NVarChar(100), 'autobill_' + ym)
    .query(`SELECT COUNT(*) c FROM ${SCHEMA}.Settings WHERE SettingKey=@k`);
  return r.recordset[0].c > 0;
}

async function markRun(pool, ym, summary) {
  await pool.request()
    .input('id', sql.VarChar(40), uid())
    .input('k', sql.NVarChar(100), 'autobill_' + ym)
    .input('v', sql.NVarChar(sql.MAX), JSON.stringify(summary))
    .query(`INSERT INTO ${SCHEMA}.Settings (Id, SettingKey, Value) VALUES (@id, @k, @v)`);
}

async function runAutoBilling(pool) {
  const ym = curYM();
  const leasesR = await pool.request().query(`
    SELECT Id FROM ${SCHEMA}.Leases
    WHERE UPPER(LTRIM(RTRIM(Status)))='ACTIVE' AND ISNULL(OnHold,0)=0
      AND ISNULL(LifecycleStage,'Active')='Active'`);
  let count = 0, errors = 0;
  for (const row of leasesR.recordset) {
    try { count += await genLeaseInvoices(pool, row.Id, ym); }
    catch (e) { errors++; console.error('[autobill]', row.Id, e.message); }
  }
  const summary = { ym, generated: count, scanned: leasesR.recordset.length, errors, at: new Date().toISOString() };
  await markRun(pool, ym, summary);
  try {
    await pool.request()
      .input('id', sql.VarChar(40), uid()).input('d', sql.Date, new Date().toISOString().slice(0, 10))
      .input('t', sql.NVarChar(100), 'Auto-billing').input('ref', sql.NVarChar(100), ym)
      .input('det', sql.NVarChar(400), `Generated ${count} invoice(s) across ${leasesR.recordset.length} active lease(s)${errors ? `, ${errors} error(s)` : ''}`)
      .input('by', sql.NVarChar(100), 'scheduler')
      .query(`INSERT INTO ${SCHEMA}.ChangeLog (Id,LogDate,Type,Ref,Detail,ByUser) VALUES (@id,@d,@t,@ref,@det,@by)`);
  } catch (_) { /* log table optional */ }
  console.log(`[autobill] ${ym}: generated ${count} invoice(s) across ${leasesR.recordset.length} lease(s)`);
  try {
    const r = await mailer.sendDigest(
      `Smart Leasing — auto-billing done for ${ym} (${count} invoices)`,
      `<p>Automatic monthly billing has run for <b>${ym}</b>.</p>
       <ul><li>Leases scanned: ${leasesR.recordset.length}</li>
       <li>Invoices generated: <b>${count}</b></li>
       <li>Errors: ${errors}</li></ul>
       <p>Open Smart Leasing → Invoices to review, or Report Center for the Excel.</p>`);
    if (r.sent) console.log('[autobill] digest emailed');
  } catch (e) { console.error('[autobill] digest email failed:', e.message); }
  return summary;
}

function startScheduler(pool) {
  if (process.env.AUTOBILL === '0') { console.log('[autobill] disabled via AUTOBILL=0'); return; }
  const day = Number(process.env.AUTOBILL_DAY) || 1;
  const tick = async () => {
    try {
      const now = new Date();
      if (now.getDate() < day) return;
      const ym = curYM();
      if (await hasRun(pool, ym)) return;
      console.log(`[autobill] billing day reached (>= ${day}) and ${ym} not yet billed — running…`);
      await runAutoBilling(pool);
    } catch (e) { console.error('[autobill] tick failed:', e.message); }
  };
  setTimeout(tick, 20 * 1000); // first check shortly after boot
  setInterval(tick, CHECK_MS);
  console.log(`[autobill] scheduler armed — bills each month automatically on/after day ${day} (AUTOBILL=0 to disable)`);
}

module.exports = { startScheduler, runAutoBilling };
