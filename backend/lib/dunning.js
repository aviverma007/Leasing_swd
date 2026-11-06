/* Dunning — staged payment reminders on overdue invoices.
   Stages by days overdue:  1: 1–7  ·  2: 8–15  ·  3: 16–30  ·  4: 31+ (final notice)
   Each (invoice, stage) is reminded once: logged in DunningLog, and e-mailed to
   the brand's email when SMTP is configured (mailer is inert otherwise).
   runDunning() is called daily by the scheduler, and the route can trigger /
   log reminders manually from the Dunning page. */
const { sql, SCHEMA } = require('../db');
const { uid } = require('./helpers');

const STAGES = [
  { stage: 1, from: 1, label: 'Gentle reminder' },
  { stage: 2, from: 8, label: 'Second reminder' },
  { stage: 3, from: 16, label: 'Firm reminder' },
  { stage: 4, from: 31, label: 'FINAL NOTICE' }
];
function stageFor(days) {
  let s = null;
  for (const st of STAGES) if (days >= st.from) s = st;
  return s;
}

function mailText(row, stageDef) {
  const bal = Number(row.Balance).toLocaleString('en-IN');
  return {
    subject: `${stageDef.stage >= 4 ? 'FINAL NOTICE: ' : 'Payment reminder: '}Invoice ${row.No} — ₹${bal} overdue by ${row.DaysOverdue} days`,
    body:
`Dear ${row.BrandName},

This is a ${stageDef.label.toLowerCase()} for the following outstanding invoice:

  Invoice No : ${row.No} (${row.Type} — ${row.Ym})
  Unit       : ${row.UnitName}
  Due date   : ${new Date(row.DueDate).toLocaleDateString('en-GB')}
  Balance due: ₹${bal} (overdue by ${row.DaysOverdue} days)

Kindly arrange payment at the earliest. As per the invoice terms, interest @${row.InterestPct || 18}% p.a. applies on delayed payments.${stageDef.stage >= 4 ? '\n\nPlease treat this as the final notice before further action as per the lease agreement.' : ''}

If the payment has already been made, please share the UTR/reference so we can reconcile.

Regards,
Accounts — Smart World Developers
(This is a system-generated reminder from Smart Leasing)`
  };
}

async function overdueRows(pool) {
  const r = await pool.request().query(`
    SELECT i.Id, i.No, i.Type, i.Ym, i.DueDate, i.Total, b.Name AS BrandName, b.Email AS BrandEmail,
      u.Name AS UnitName, l.InterestPct,
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

/* Daily sweep: send/log the reminder for any invoice that has crossed a new stage. */
async function runDunning(pool) {
  const mailer = require('./mailer');
  const rows = await overdueRows(pool);
  let sent = 0;
  for (const row of rows) {
    const st = stageFor(row.DaysOverdue);
    if (!st || row.MaxStage >= st.stage) continue; // this stage already reminded
    const { subject, body } = mailText(row, st);
    let channel = 'in-app';
    if (mailer.enabled() && row.BrandEmail) {
      try {
        const r = await mailer.sendMail({ to: row.BrandEmail, subject, html: body.replace(/\n/g, '<br>') });
        if (r && r.sent) channel = 'email';
      } catch (_) { /* keep as in-app log */ }
    }
    await logReminder(pool, row.Id, st.stage, channel, row.BrandEmail, subject, 'system');
    sent++;
  }
  if (sent) console.log(`[dunning] ${sent} reminder(s) recorded`);
  return sent;
}

module.exports = { STAGES, stageFor, mailText, overdueRows, logReminder, runDunning };
