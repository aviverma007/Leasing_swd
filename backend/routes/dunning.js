/* Dunning routes — the collections team's reminder ladder.
   GET  /api/dunning                 → every overdue approved invoice with stage, balance, reminders sent
   GET  /api/dunning/:invoiceId/log  → reminder history for one invoice
   POST /api/dunning/:invoiceId/remind → send/record the current-stage reminder now (manual);
        returns the mail text so it can be copied/pasted even without SMTP. */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { STAGES, stageFor, mailText, overdueRows, logReminder } = require('../lib/dunning');
const { logAudit, userName } = require('../lib/audit');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await overdueRows(pool);
    res.json({
      stages: STAGES,
      mailerEnabled: require('../lib/mailer').enabled(),
      rows: rows.map(r => {
        const st = stageFor(r.DaysOverdue);
        return {
          invoiceId: r.Id, no: r.No, type: r.Type, ym: r.Ym,
          brandName: r.BrandName, brandEmail: r.BrandEmail || null, unitName: r.UnitName,
          dueDate: new Date(r.DueDate).toISOString().slice(0, 10),
          balance: Math.round(Number(r.Balance) * 100) / 100,
          daysOverdue: r.DaysOverdue,
          stage: st ? st.stage : 0, stageLabel: st ? st.label : '—',
          remindersSent: r.RemindersSent, maxStageSent: r.MaxStage,
          lastReminderAt: r.LastReminderAt ? new Date(r.LastReminderAt).toISOString() : null
        };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:invoiceId/log', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('i', sql.VarChar(40), req.params.invoiceId)
      .query(`SELECT Stage, Channel, ToEmail, Note, SentBy, SentAt FROM ${SCHEMA}.DunningLog WHERE InvoiceId=@i ORDER BY SentAt DESC`);
    res.json(r.recordset.map(x => ({ stage: x.Stage, channel: x.Channel, toEmail: x.ToEmail, note: x.Note, by: x.SentBy, at: new Date(x.SentAt).toISOString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:invoiceId/remind', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await overdueRows(pool);
    const row = rows.find(r => r.Id === req.params.invoiceId);
    if (!row) return res.status(404).json({ error: 'Invoice is not overdue (or not found/approved).' });
    const st = stageFor(row.DaysOverdue) || STAGES[0];
    const { subject, body } = mailText(row, st);
    const mailer = require('../lib/mailer');
    let channel = 'in-app', mailResult = null;
    if (mailer.enabled() && row.BrandEmail) {
      try {
        mailResult = await mailer.sendMail({ to: row.BrandEmail, subject, html: body.replace(/\n/g, '<br>') });
        if (mailResult && mailResult.sent) channel = 'email';
      } catch (e) { mailResult = { error: e.message }; }
    }
    const by = userName(req);
    await logReminder(pool, row.Id, st.stage, channel, row.BrandEmail, subject, by);
    await logAudit(pool, 'invoices', row.Id, 'reminder', `Stage-${st.stage} ${st.label} ${channel === 'email' ? 'e-mailed to ' + row.BrandEmail : 'recorded (no SMTP/e-mail — copy the text below)'}`, by);
    res.json({ stage: st.stage, stageLabel: st.label, channel, toEmail: row.BrandEmail, subject, body, mailResult });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
