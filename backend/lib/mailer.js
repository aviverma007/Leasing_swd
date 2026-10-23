/* Optional SMTP mailer. Fully inert until SMTP_HOST is set in .env:
     SMTP_HOST=mail.smartworlddevelopers.com
     SMTP_PORT=587            (optional, default 587)
     SMTP_USER= / SMTP_PASS=  (optional, for authenticated relays)
     SMTP_FROM="Smart Leasing <noreply@smartworlddevelopers.com>"
     BILLING_EMAILS=finance@x.com,leasing@x.com   (digest recipients)
*/
let transporter = null;

function enabled() { return !!process.env.SMTP_HOST; }

function getTransporter() {
  if (!enabled()) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: false } // internal relays often use self-signed certs
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return { skipped: true, reason: 'SMTP not configured (set SMTP_HOST in .env)' };
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || 'Smart Leasing <noreply@smartworld.local>',
    to, subject, html
  });
  return { sent: true, id: info.messageId };
}

async function sendDigest(subject, html) {
  const to = process.env.BILLING_EMAILS;
  if (!to) return { skipped: true, reason: 'BILLING_EMAILS not set' };
  return sendMail({ to, subject, html });
}

module.exports = { enabled, sendMail, sendDigest };
