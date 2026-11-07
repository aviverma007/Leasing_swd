/* Dunning — staged payment reminders on overdue invoices.
   Stage thresholds, interest-mention stage, CC list, escalation and the
   invoice attachment are all configurable from the Dunning page (stored in
   Settings under 'dunning_config'); the defaults below apply until saved.
   Each (invoice, stage) is reminded once: logged in DunningLog, and e-mailed to
   the brand's email when SMTP is configured (mailer is inert otherwise).
   runDunning() is called daily by the scheduler; runWeeklySummary() mails the
   team an overdue statement once a week. Leases with DunningHold=1 are skipped
   by the sweep (manual reminders still work — that is the override). */
const { sql, SCHEMA } = require('../db');
const { uid } = require('./helpers');

const DEFAULT_CONFIG = {
  autoSend: false,        // OFF: the daily sweep only flags what is due — nothing is sent
                          // without a person clicking Send on the Dunning page (popup confirm)
  stage2From: 8,          // stage 1 always starts at day 1
  stage3From: 16,
  stage4From: 31,
  interestFromStage: 3,   // mails mention accruing interest from this stage on
  cc: '',                 // comma-separated team addresses CC'd on every reminder
  escalate: true,         // internal mail to team when tenants hit FINAL NOTICE
  attachInvoice: true,    // attach the invoice statement (HTML) to the reminder
  weeklySummary: true     // Monday overdue summary to the team
};

async function getConfig(pool) {
  try {
    const r = await pool.request().input('k', sql.NVarChar(100), 'dunning_config')
      .query(`SELECT TOP 1 Value FROM ${SCHEMA}.Settings WHERE SettingKey=@k`);
    if (!r.recordset.length) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(r.recordset[0].Value || '{}');
    return { ...DEFAULT_CONFIG, ...saved };
  } catch (_) { return { ...DEFAULT_CONFIG }; }
}

async function saveConfig(pool, cfg) {
  const clean = { ...DEFAULT_CONFIG };
  ['stage2From', 'stage3From', 'stage4From'].forEach((k) => {
    const n = Number(cfg[k]); if (Number.isFinite(n) && n >= 2 && n <= 365) clean[k] = Math.round(n);
  });
  if (!(clean.stage2From < clean.stage3From && clean.stage3From < clean.stage4From)) {
    throw new Error('Stage days must increase: stage 2 < stage 3 < stage 4.');
  }
  const ist = Number(cfg.interestFromStage); if ([1, 2, 3, 4].includes(ist)) clean.interestFromStage = ist;
  clean.autoSend = cfg.autoSend === true || cfg.autoSend === 'true';
  clean.cc = String(cfg.cc || '').split(/[;,]/).map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)).join(',');
  clean.escalate = cfg.escalate !== false && cfg.escalate !== 'false';
  clean.attachInvoice = cfg.attachInvoice !== false && cfg.attachInvoice !== 'false';
  clean.weeklySummary = cfg.weeklySummary !== false && cfg.weeklySummary !== 'false';
  const r = await pool.request().input('k', sql.NVarChar(100), 'dunning_config')
    .query(`SELECT TOP 1 Id FROM ${SCHEMA}.Settings WHERE SettingKey=@k`);
  if (r.recordset.length) {
    await pool.request().input('id', sql.VarChar(40), r.recordset[0].Id).input('v', sql.NVarChar(sql.MAX), JSON.stringify(clean))
      .query(`UPDATE ${SCHEMA}.Settings SET Value=@v WHERE Id=@id`);
  } else {
    await pool.request().input('id', sql.VarChar(40), uid()).input('k', sql.NVarChar(100), 'dunning_config').input('v', sql.NVarChar(sql.MAX), JSON.stringify(clean))
      .query(`INSERT INTO ${SCHEMA}.Settings (Id, SettingKey, Value) VALUES (@id, @k, @v)`);
  }
  return clean;
}

function stagesFor(cfg) {
  const c = cfg || DEFAULT_CONFIG;
  return [
    { stage: 1, from: 1, label: 'Gentle reminder' },
    { stage: 2, from: c.stage2From, label: 'Second reminder' },
    { stage: 3, from: c.stage3From, label: 'Firm reminder' },
    { stage: 4, from: c.stage4From, label: 'FINAL NOTICE' }
  ];
}
function stageFor(days, cfg) {
  let s = null;
  for (const st of stagesFor(cfg)) if (days >= st.from) s = st;
  return s;
}

function mailText(row, stageDef, cfg) {
  const c = cfg || DEFAULT_CONFIG;
  const bal = Number(row.Balance).toLocaleString('en-IN');
  const interestLine = stageDef.stage >= (c.interestFromStage || 3)
    ? `\n\nAs per the invoice terms, interest @${row.InterestPct || 18}% p.a. is accruing on the delayed amount.` : '';
  return {
    subject: `${stageDef.stage >= 4 ? 'FINAL NOTICE: ' : 'Payment reminder: '}Invoice ${row.No} — ₹${bal} overdue by ${row.DaysOverdue} days`,
    body:
`Dear ${row.BrandName},

This is a ${stageDef.label.toLowerCase()} for the following outstanding invoice:

  Invoice No : ${row.No} (${row.Type} — ${row.Ym})
  Unit       : ${row.UnitName}
  Due date   : ${new Date(row.DueDate).toLocaleDateString('en-GB')}
  Balance due: ₹${bal} (overdue by ${row.DaysOverdue} days)

Kindly arrange payment at the earliest.${interestLine}${stageDef.stage >= 4 ? '\n\nPlease treat this as the final notice before further action as per the lease agreement.' : ''}

If the payment has already been made, please share the UTR/reference so we can reconcile.

Regards,
Accounts — Smart World Developers
(This is a system-generated reminder from Smart Leasing)`
  };
}

/* Invoice statement HTML — attached to the reminder e-mail when enabled. */
async function invoiceAttachment(pool, invoiceId) {
  try {
    const r = await pool.request().input('i', sql.VarChar(40), invoiceId).query(`
      SELECT i.No, i.Type, i.Ym, i.InvDate, i.DueDate, i.Descr, i.Amount, i.CgstAmt, i.SgstAmt, i.IgstAmt, i.Total, i.HsnCode,
        b.Name AS BrandName, b.Gstin AS BrandGstin, u.Name AS UnitName, l.Code AS LeaseCode,
        ISNULL(c.paid,0) AS Paid, ISNULL(cn.credited,0) AS Credited
      FROM ${SCHEMA}.Invoices i
      JOIN ${SCHEMA}.Brands b ON b.Id=i.BrandId
      JOIN ${SCHEMA}.Units u ON u.Id=i.UnitId
      LEFT JOIN ${SCHEMA}.Leases l ON l.Id=i.LeaseId
      OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') c
      OUTER APPLY (SELECT SUM(CASE WHEN NoteType='Credit' THEN Total ELSE -Total END) credited FROM ${SCHEMA}.CreditNotes WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') cn
      WHERE i.Id=@i`);
    if (!r.recordset.length) return null;
    const x = r.recordset[0];
    const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const d = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '—');
    const balance = Number(x.Total) - Number(x.Paid) - Number(x.Credited);
    const row = (k, v, b) => `<tr><td style="padding:6px 10px;color:#64718a">${k}</td><td style="padding:6px 10px;text-align:right;${b ? 'font-weight:bold' : ''}">${v}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${x.No}</title></head>
<body style="font-family:Arial,sans-serif;color:#1c2538;max-width:640px;margin:24px auto">
<h2 style="color:#0f1a30;margin-bottom:2px">Smart World Developers — Invoice statement</h2>
<p style="color:#64718a;margin-top:0">Invoice <b>${x.No}</b> · ${x.Type} · ${x.Ym} · Lease ${x.LeaseCode || '—'}</p>
<table style="border-collapse:collapse;width:100%;border:1px solid #dfe5ee">
${row('Tenant', `${x.BrandName}${x.BrandGstin ? ' · GSTIN ' + x.BrandGstin : ''}`)}
${row('Unit', x.UnitName)}
${row('Description', x.Descr || x.Type)}
${row('Invoice date / Due date', `${d(x.InvDate)} / ${d(x.DueDate)}`)}
${row('Taxable amount', inr(x.Amount))}
${Number(x.IgstAmt) > 0 ? row('IGST', inr(x.IgstAmt)) : row('CGST + SGST', inr(Number(x.CgstAmt) + Number(x.SgstAmt)))}
${row('Invoice total', inr(x.Total), true)}
${row('Received / credited', inr(Number(x.Paid) + Number(x.Credited)))}
${row('Balance due', inr(balance), true)}
</table>
<p style="color:#64718a;font-size:12px">HSN/SAC: ${x.HsnCode || '—'} · System-generated statement from Smart Leasing; the signed tax invoice remains the governing document.</p>
</body></html>`;
    return { filename: `Invoice-${String(x.No).replace(/[^\w.-]+/g, '_')}.html`, content: html, contentType: 'text/html' };
  } catch (_) { return null; }
}

async function overdueRows(pool) {
  const r = await pool.request().query(`
    SELECT i.Id, i.No, i.Type, i.Ym, i.DueDate, i.Total, b.Name AS BrandName, b.Email AS BrandEmail,
      u.Name AS UnitName, l.InterestPct, ISNULL(l.DunningHold,0) AS DunningHold, l.DunningHoldNote,
      i.Total - ISNULL(c.paid,0) - ISNULL(cn.credited,0) AS Balance,
      DATEDIFF(day, i.DueDate, GETDATE()) AS DaysOverdue,
      ISNULL(dl.cnt,0) AS RemindersSent, dl.lastAt AS LastReminderAt, ISNULL(dl.maxStage,0) AS MaxStage
    FROM ${SCHEMA}.Invoices i
    JOIN ${SCHEMA}.Brands b ON b.Id=i.BrandId
    JOIN ${SCHEMA}.Units u ON u.Id=i.UnitId
    LEFT JOIN ${SCHEMA}.Leases l ON l.Id=i.LeaseId
    OUTER APPLY (SELECT SUM(Amount) paid FROM ${SCHEMA}.Collections WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') c
    OUTER APPLY (SELECT SUM(CASE WHEN NoteType='Credit' THEN Total ELSE -Total END) credited FROM ${SCHEMA}.CreditNotes WHERE InvoiceId=i.Id AND ISNULL(DocStatus,'Approved')='Approved') cn
    OUTER APPLY (SELECT COUNT(*) cnt, MAX(SentAt) lastAt, MAX(Stage) maxStage FROM ${SCHEMA}.DunningLog WHERE InvoiceId=i.Id) dl
    WHERE ISNULL(i.DocStatus,'Approved')='Approved'
      AND i.DueDate < CAST(GETDATE() AS DATE)
      AND i.Total - ISNULL(c.paid,0) - ISNULL(cn.credited,0) > 0.5
    ORDER BY DaysOverdue DESC`);
  return r.recordset;
}

async function logReminder(pool, invoiceId, stage, channel, toEmail, note, by) {
  await pool.request()
    .input('id', sql.VarChar(40), uid()).input('inv', sql.VarChar(40), invoiceId)
    .input('st', sql.Int, stage).input('ch', sql.VarChar(20), channel)
    .input('to', sql.NVarChar(200), toEmail || null)
    .input('n', sql.NVarChar(400), (note || '').slice(0, 400))
    .input('by', sql.NVarChar(150), by || 'system')
    .query(`INSERT INTO ${SCHEMA}.DunningLog (Id,InvoiceId,Stage,Channel,ToEmail,Note,SentBy) VALUES (@id,@inv,@st,@ch,@to,@n,@by)`);
}

/* Send/record one reminder (shared by the sweep and the manual route). */
async function sendReminder(pool, row, st, cfg, by) {
  const mailer = require('./mailer');
  const { subject, body } = mailText(row, st, cfg);
  let channel = 'in-app', mailResult = null;
  if (mailer.enabled() && row.BrandEmail) {
    try {
      const attachments = [];
      if (cfg.attachInvoice) {
        const att = await invoiceAttachment(pool, row.Id);
        if (att) attachments.push(att);
      }
      mailResult = await mailer.sendMail({
        to: row.BrandEmail, cc: cfg.cc || undefined, subject,
        html: body.replace(/\n/g, '<br>'),
        attachments: attachments.length ? attachments : undefined
      });
      if (mailResult && mailResult.sent) channel = 'email';
    } catch (e) { mailResult = { error: e.message }; }
  }
  await logReminder(pool, row.Id, st.stage, channel, row.BrandEmail, subject, by || 'system');
  return { subject, body, channel, mailResult };
}

/* Internal escalation — mailed to the CC list / BILLING_EMAILS when tenants hit FINAL NOTICE. */
async function escalateFinalNotices(pool, cfg, rows) {
  if (!cfg.escalate || !rows.length) return;
  const mailer = require('./mailer');
  const to = [cfg.cc, process.env.BILLING_EMAILS].filter(Boolean).join(',');
  if (!mailer.enabled() || !to) return;
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const trs = rows.map((r) => `<tr><td style="padding:4px 8px">${r.BrandName}</td><td style="padding:4px 8px">${r.No} (${r.Type} ${r.Ym})</td><td style="padding:4px 8px;text-align:right">${inr(r.Balance)}</td><td style="padding:4px 8px;text-align:right">${r.DaysOverdue} days</td></tr>`).join('');
  try {
    await mailer.sendMail({
      to,
      subject: `Smart Leasing — ${rows.length} tenant(s) reached FINAL NOTICE today`,
      html: `<p>The following invoices crossed the final-notice stage in today's dunning sweep:</p>
<table style="border-collapse:collapse;border:1px solid #dfe5ee"><tr style="background:#0f1a30;color:#fff"><th style="padding:4px 8px;text-align:left">Tenant</th><th style="padding:4px 8px;text-align:left">Invoice</th><th style="padding:4px 8px">Balance</th><th style="padding:4px 8px">Overdue</th></tr>${trs}</table>
<p>Open Smart Leasing → Dunning (Reminders) to review; consider billing interest or next legal steps per the lease.</p>`
    });
    console.log(`[dunning] escalation mail sent for ${rows.length} final notice(s)`);
  } catch (e) { console.error('[dunning] escalation mail failed:', e.message); }
}

/* Daily sweep: send/log the reminder for any invoice that has crossed a new stage.
   Runs ONLY when auto-send is enabled in the dunning settings — by default it is
   off and reminders wait on the Dunning page for a manual, confirmed send.
   Leases with DunningHold=1 are skipped (dispute / negotiation hold). */
async function runDunning(pool) {
  const cfg = await getConfig(pool);
  if (!cfg.autoSend) {
    console.log('[dunning] auto-send is OFF — due reminders are flagged on the Dunning page for manual send');
    return 0;
  }
  const rows = await overdueRows(pool);
  let sent = 0; const finals = [];
  for (const row of rows) {
    if (row.DunningHold) continue;
    const st = stageFor(row.DaysOverdue, cfg);
    if (!st || row.MaxStage >= st.stage) continue; // this stage already reminded
    await sendReminder(pool, row, st, cfg, 'system');
    if (st.stage >= 4) finals.push(row);
    sent++;
  }
  await escalateFinalNotices(pool, cfg, finals);
  if (sent) console.log(`[dunning] ${sent} reminder(s) recorded`);
  return sent;
}

/* Weekly overdue summary to the team (scheduler calls this once a week). */
async function runWeeklySummary(pool) {
  const cfg = await getConfig(pool);
  if (!cfg.weeklySummary) return { skipped: true, reason: 'weekly summary disabled' };
  const mailer = require('./mailer');
  const to = [cfg.cc, process.env.BILLING_EMAILS].filter(Boolean).join(',');
  const rows = await overdueRows(pool);
  if (!rows.length) return { skipped: true, reason: 'nothing overdue' };
  if (!mailer.enabled() || !to) return { skipped: true, reason: 'SMTP/recipients not configured' };
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const total = rows.reduce((s, r) => s + Number(r.Balance), 0);
  const trs = rows.map((r) => {
    const st = stageFor(r.DaysOverdue, cfg);
    return `<tr><td style="padding:4px 8px">${r.BrandName}${r.DunningHold ? ' <i>(reminders paused)</i>' : ''}</td><td style="padding:4px 8px">${r.No} (${r.Type} ${r.Ym})</td><td style="padding:4px 8px;text-align:right">${inr(r.Balance)}</td><td style="padding:4px 8px;text-align:right">${r.DaysOverdue}d</td><td style="padding:4px 8px">${st ? st.label : '—'}</td></tr>`;
  }).join('');
  return mailer.sendMail({
    to,
    subject: `Smart Leasing — weekly overdue summary: ${rows.length} invoice(s), ${inr(total)} outstanding`,
    html: `<p>Outstanding position as of ${new Date().toLocaleDateString('en-GB')}:</p>
<table style="border-collapse:collapse;border:1px solid #dfe5ee"><tr style="background:#0f1a30;color:#fff"><th style="padding:4px 8px;text-align:left">Tenant</th><th style="padding:4px 8px;text-align:left">Invoice</th><th style="padding:4px 8px">Balance</th><th style="padding:4px 8px">Overdue</th><th style="padding:4px 8px;text-align:left">Stage</th></tr>${trs}</table>
<p>Total outstanding: <b>${inr(total)}</b>. Open Smart Leasing → Dunning (Reminders) for actions.</p>`
  });
}

module.exports = {
  DEFAULT_CONFIG, getConfig, saveConfig, stagesFor, stageFor, mailText,
  invoiceAttachment, overdueRows, logReminder, sendReminder, runDunning, runWeeklySummary
};
