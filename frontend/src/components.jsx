import React, { useEffect, useState } from 'react';
import { api } from './api.js';

export function Modal({ title, onClose, onSave, saveLabel = 'Save', wide, xwide, footer, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim open" onClick={(e) => { if (e.target.classList.contains('scrim')) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}`}>
        <div className="mh">
          <h3>{title}</h3>
          <button className="x" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">
          {footer !== undefined ? footer : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              {onSave && <button className="btn btn-teal" onClick={onSave}>{saveLabel}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, onClose, onConfirm, confirmLabel = 'Delete' }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </>}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{message}</p>
    </Modal>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast show${toast.err ? ' err' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        {toast.err ? <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></> : <path d="M20 6 9 17l-5-5" />}
      </svg>
      {toast.msg}
    </div>
  );
}

export function Callout({ children, warn }) {
  return (
    <div className={`callout${warn ? ' warn' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="10" /></svg>
      <span>{children}</span>
    </div>
  );
}

export function Pill({ color, children, title }) {
  return <span className={`pill ${color}`} title={title}>{children}</span>;
}

export function EmptyState({ thing, onAdd }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 13h6M9 17h4M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
      <h4>No {thing} yet</h4>
      <p>Create your first {thing} to get started.</p>
      {onAdd && <button className="btn btn-teal" onClick={onAdd}>Add {thing}</button>}
    </div>
  );
}

/* ── Payment-reminder popup (shared by the Dunning page and the invoice record page).
   preview: result of api.dunning.preview(invoiceId) + { invoiceId }.
   Shows the exact mail; the To address is prefilled from the brand's billing
   email and fully editable. NOTHING is sent or logged until Confirm is clicked. */
export function ReminderModal({ preview, onClose, notify, afterSent }) {
  const [to, setTo] = useState(preview.toEmail || '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const willEmail = preview.mailerEnabled && to.trim();
  const copy = () => {
    navigator.clipboard && navigator.clipboard.writeText(`Subject: ${preview.subject}\n\n${preview.body}`)
      .then(() => notify('Copied to clipboard.'));
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const res = await api.dunning.remind(preview.invoiceId, to.trim() || undefined);
      setSent(res);
      notify(res.channel === 'email'
        ? `Stage-${res.stage} reminder e-mailed to ${res.toEmail}.`
        : `Stage-${res.stage} reminder recorded — no SMTP/e-mail, copy the text to send manually.`);
      afterSent && (await afterSent());
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Reminder — ${preview.stageLabel} (stage ${preview.stage})${sent ? '' : ' — review before sending'}`} onClose={onClose}
      footer={sent ? <>
        <button className="btn btn-ghost" onClick={copy}>Copy text</button>
        <button className="btn btn-teal" onClick={onClose}>Done</button>
      </> : <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" onClick={copy}>Copy text</button>
        <button className="btn btn-teal" disabled={busy} onClick={confirm}>
          {busy ? 'Sending…' : willEmail ? `✉ Confirm & e-mail` : 'Confirm & record (no e-mail)'}
        </button>
      </>}>
      {!sent && <Callout>Nothing has been sent yet — this is the exact mail. {willEmail
        ? <>On confirm it is e-mailed to the address below{preview.cc ? <> (cc {preview.cc})</> : null}{preview.attachInvoice ? ', with the invoice statement attached,' : ''} and logged.</>
        : <>{preview.mailerEnabled ? 'Enter an e-mail address to send, or confirm to record only' : 'SMTP is not configured — on confirm it is logged and you can copy the text into Outlook'}.</>}
        {preview.dunningHold ? <> <b>Note:</b> auto-reminders are paused on this lease ({preview.dunningHoldNote}) — sending now is a manual override.</> : null}</Callout>}
      {sent && sent.channel !== 'email' && <Callout warn>E-mail was not sent — {sent.mailResult && sent.mailResult.error
        ? <>the mail server rejected it: <b style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{sent.mailResult.error}</b></>
        : (to.trim() ? 'SMTP not configured' : 'no e-mail address')}. The reminder is logged; copy this text and send it from Outlook.</Callout>}
      {sent && sent.channel === 'email' && <Callout>Reminder e-mailed to <b>{sent.toEmail}</b>{sent.cc ? <> (cc {sent.cc})</> : null} and logged.</Callout>}
      <div className="field"><label>To (e-mail){preview.toEmail ? ' — prefilled from Brand Master, edit if needed' : ' — no billing email saved for this brand, type one'}</label>
        <input type="email" placeholder="accounts@tenant.com" value={to} disabled={!!sent} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="field"><label>Subject</label><input readOnly value={preview.subject} /></div>
      <div className="field"><label>Body</label><textarea readOnly style={{ minHeight: 200, fontFamily: 'var(--mono)', fontSize: 12 }} value={preview.body} /></div>
    </Modal>
  );
}

/* ── MultiFilt: multi-select filter dropdown (checkbox list) used on every list page.
   values: array of selected option values; empty array = no filter (= "All"). */
export function MultiFilt({ label, options, values, onChange, width }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const opts = (options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const labelFor = (v) => { const f = opts.find(([ov]) => ov === v); return f ? f[1] : v; };
  const text = values.length === 0 ? label
    : values.length <= 2 ? values.map(labelFor).join(', ')
    : `${label.replace(/^All /i, '')}: ${values.length} selected`;
  return (
    <div className="mfilt" ref={ref} style={width ? { width } : undefined}>
      <button type="button" className={`mfilt-btn ${values.length ? 'has' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span className="mfilt-txt">{text}</span>
        <svg viewBox="0 0 24 24" width="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="mfilt-pop">
          <div className="mfilt-head"><span>{label}</span>{values.length > 0 && <a onClick={() => onChange([])}>Clear ({values.length})</a>}</div>
          <div className="mfilt-list">
            {opts.map(([v, l]) => (
              <label key={v} className="mfilt-opt">
                <input type="checkbox" checked={values.includes(v)} onChange={() => toggle(v)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
