/* Dunning routes — the collections team's reminder ladder.
   GET  /api/dunning                 → every overdue approved invoice with stage, balance, reminders sent + config
   GET  /api/dunning/config          → current dunning settings
   PUT  /api/dunning/config          → save settings (stage days, interest stage, CC, toggles)
   GET  /api/dunning/:invoiceId/log  → reminder history for one invoice
   POST /api/dunning/:invoiceId/remind → send/record the current-stage reminder now (manual;
        works even when the lease is on dunning hold — that is the override);
        returns the mail text so it can be copied/pasted even without SMTP. */
const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { getConfig, saveConfig, stagesFor, stageFor, overdueRows, sendReminder, mailText } = require('../lib/dunning');
const { logAudit, userName } = require('../lib/audit');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const cfg = await getConfig(pool);
    const rows = await overdueRows(pool);
    res.json({
      stages: stagesFor(cfg),
      config: cfg,
      mailerEnabled: require('../lib/mailer').enabled(),
      rows: rows.map(r => {
        const st = stageFor(r.DaysOverdue, cfg);
        return {
          invoiceId: r.Id, no: r.No, type: r.Type, ym: r.Ym,
          brandName: r.BrandName, brandEmail: r.BrandEmail || null, unitName: r.UnitName,
          dueDate: new Date(r.DueDate).toISOString().slice(0, 10),
          balance: Math.round(Number(r.Balance) * 100) / 100,
          daysOverdue: r.DaysOverdue,
          stage: st ? st.stage : 0, stageLabel: st ? st.label : '—',
          remindersSent: r.RemindersSent, maxStageSent: r.MaxStage,
          lastReminderAt: r.LastReminderAt ? new Date(r.LastReminderAt).toISOString() : null,
          dunningHold: !!r.DunningHold, dunningHoldNote: r.DunningHoldNote || ''
        };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/config', async (req, res) => {
  try { res.json(await getConfig(await getPool())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config', async (req, res) => {
  try {
    const pool = await getPool();
    const saved = await saveConfig(pool, req.body || {});
    await logAudit(pool, 'settings', 'dunning_config', 'edited',
      `Dunning settings saved — stages 1/${saved.stage2From}/${saved.stage3From}/${saved.stage4From} days, interest from stage ${saved.interestFromStage}, CC: ${saved.cc || '—'}, escalation ${saved.escalate ? 'on' : 'off'}, attachment ${saved.attachInvoice ? 'on' : 'off'}, weekly summary ${saved.weeklySummary ? 'on' : 'off'}`,
      userName(req));
    res.json(saved);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Preview the reminder BEFORE sending — nothing is sent or logged here.
   The UI shows this in a popup; only a confirmed click calls /remind. */
router.get('/:invoiceId/preview', async (req, res) => {
  try {
    const pool = await getPool();
    const cfg = await getConfig(pool);
    const rows = await overdueRows(pool);
    const row = rows.find(r => r.Id === req.params.invoiceId);
    if (!row) return res.status(404).json({ error: 'Invoice is not overdue (or not found/approved).' });
    const st = stageFor(row.DaysOverdue, cfg) || stagesFor(cfg)[0];
    const { subject, body } = mailText(row, st, cfg);
    res.json({
      stage: st.stage, stageLabel: st.label,
      toEmail: row.BrandEmail || null, cc: cfg.cc || null,
      subject, body,
      mailerEnabled: require('../lib/mailer').enabled(),
      willEmail: require('../lib/mailer').enabled() && !!row.BrandEmail,
      attachInvoice: !!cfg.attachInvoice,
      dunningHold: !!row.DunningHold, dunningHoldNote: row.DunningHoldNote || ''
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
    const cfg = await getConfig(pool);
    const rows = await overdueRows(pool);
    const row = rows.find(r => r.Id === req.params.invoiceId);
    if (!row) return res.status(404).json({ error: 'Invoice is not overdue (or not found/approved).' });
    const st = stageFor(row.DaysOverdue, cfg) || stagesFor(cfg)[0];
    const by = userName(req);
    let toOverride = String(req.body?.toEmail || '').trim();
    if (toOverride && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toOverride)) {
      return res.status(400).json({ error: `"${toOverride}" is not a valid e-mail address.` });
    }
    const { subject, body, channel, mailResult, toEmail } = await sendReminder(pool, row, st, cfg, by, toOverride || null);
    const edited = toOverride && toOverride !== (row.BrandEmail || '');
    await logAudit(pool, 'invoices', row.Id, 'reminder', `Stage-${st.stage} ${st.label} ${channel === 'email' ? 'e-mailed to ' + toEmail + (edited ? ' (address edited in the popup)' : '') + (cfg.cc ? ' (cc ' + cfg.cc + ')' : '') : 'recorded (no SMTP/e-mail — copy the text below)'}${row.DunningHold ? ' — sent manually while auto-reminders are paused' : ''}`, by);
    res.json({ stage: st.stage, stageLabel: st.label, channel, toEmail, cc: cfg.cc || null, subject, body, mailResult, dunningHold: !!row.DunningHold });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
