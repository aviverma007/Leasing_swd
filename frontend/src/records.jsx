/* v4 — Frappe-style record pages: every document opens as its own full page
   (own URL, breadcrumb, status, maker–checker actions, field-level activity
   timeline and comments), plus the command palette and the approvals inbox. */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, getToken } from './api.js';
import { Pill, Callout } from './components.jsx';
import { money, money0, fmtDate, ymLabel, nameOf, findById, MASTER_SCHEMA } from './helpers.js';
import { canView, canEdit, canApproveRole } from './permissions.js';

/* ───────── small shared bits ───────── */
export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60); if (h < 48) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24); if (d < 32) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DocStatusPill({ st }) {
  if (!st || st === 'Approved') return <Pill color="green">Approved</Pill>;
  if (st === 'Pending') return <Pill color="amber">Pending by Checker</Pill>;
  if (st === 'Rejected') return <Pill color="red">Rejected</Pill>;
  return <Pill color="grey">{st}</Pill>;
}

export function Crumbs({ parts, go }) {
  return (
    <div className="crumbs">
      {parts.map((p, i) => (
        <span key={i} className="crumb-seg">
          {i > 0 && <span className="crumb-sep">›</span>}
          {p.view && i < parts.length - 1
            ? <a onClick={() => go(p.view)}>{p.label}</a>
            : <span className="crumb-cur">{p.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function KV({ label, children }) {
  return <div className="rkv"><span>{label}</span><b>{children ?? '—'}</b></div>;
}

export function RSection({ title, children, right }) {
  return (
    <div className="panel rsec">
      <div className="ph"><h3>{title}</h3>{right}</div>
      <div className="pb">{children}</div>
    </div>
  );
}

/* ───────── maker–checker action bar ───────── */
export function WorkflowBar({ type, id, doc, actingRole, afterChange, notify }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const st = doc.docStatus || 'Approved';
  const approver = canApproveRole(actingRole);
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); notify(msg); setRejecting(false); setReason(''); await afterChange(); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <div className="wfbar">
      <div className="wf-state">
        <DocStatusPill st={st} />
        {st === 'Approved' && doc.approvedBy && <span className="sub">approved by {doc.approvedBy}{doc.approvedAt ? ' · ' + timeAgo(doc.approvedAt) : ''}</span>}
        {st === 'Pending' && <span className="sub">submitted {doc.submittedBy ? 'by ' + doc.submittedBy : ''}{doc.createdAt ? ' · ' + timeAgo(doc.createdAt) : ''} — awaiting checker</span>}
        {st === 'Rejected' && <span className="sub danger-t">by {doc.approvedBy || 'checker'} — {doc.rejectReason || 'no reason recorded'}</span>}
      </div>
      <div className="wf-actions">
        {st === 'Pending' && approver && (
          <>
            <button className="btn btn-teal btn-sm" disabled={busy} onClick={() => run(() => api.wf.approve(type, id), 'Approved.')}>✓ Approve</button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRejecting(!rejecting)}>Reject…</button>
          </>
        )}
        {st === 'Pending' && !approver && <span className="sub">Your role can’t approve — an approver (per Role Profiles) will action this.</span>}
        {st === 'Rejected' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.wf.submit(type, id), 'Re-submitted for approval.')}>↻ Re-submit for approval</button>}
      </div>
      {rejecting && (
        <div className="wf-reject">
          <input value={reason} placeholder="Rejection reason (mandatory) — e.g. wrong rate, duplicate entry" onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-danger btn-sm" disabled={busy || !reason.trim()}
            onClick={() => run(() => api.wf.reject(type, id, reason.trim()), 'Rejected.')}>Confirm reject</button>
        </div>
      )}
    </div>
  );
}

/* ───────── activity timeline (field-level audit) ───────── */
const ACT_ICON = { created: '●', edited: '✎', submitted: '➤', approved: '✓', rejected: '✕', stage: '⇄', renewed: '↻', exited: '⏏', 'sd-adjusted': '₹', 'credit-note': '−', 'debit-note': '+' };
export function ActivityTimeline({ type, id, extraRows }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { (async () => { try { setRows(await api.activity(type, id)); } catch (_) { setRows([]); } })(); }, [type, id]);
  const all = [...(rows || []), ...(extraRows || [])].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <RSection title="Activity">
      {rows === null ? <div className="sub">Loading activity…</div> : all.length === 0 ? (
        <div className="sub">No activity recorded yet — changes made from now on are logged here field by field.</div>
      ) : (
        <div className="tl">
          {all.map((x, i) => (
            <div className={'tl-row tl-' + (x.action || 'other')} key={x.id || 'x' + i}>
              <div className="tl-dot">{ACT_ICON[x.action] || '•'}</div>
              <div className="tl-body">
                <div className="tl-head"><b>{x.by}</b> <span className="tl-act">{x.action}</span> <span className="sub">· {timeAgo(x.at)}</span></div>
                {x.detail && <div className="tl-detail">{x.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </RSection>
  );
}

/* ───────── comments ───────── */
export function CommentsPanel({ type, id, notify }) {
  const [rows, setRows] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setRows(await api.comments.list(type, id)); } catch (_) { setRows([]); } }, [type, id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await api.comments.add(type, id, body.trim()); setBody(''); await load(); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <RSection title="Comments">
      <div className="cmt-new">
        <div className="cmt-av">{'A'}</div>
        <input value={body} placeholder="Type a reply / comment" onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-teal btn-sm" disabled={busy || !body.trim()} onClick={add}>Comment</button>
      </div>
      {rows === null ? <div className="sub">Loading…</div> : rows.map((c) => (
        <div className="cmt" key={c.id}>
          <div className="cmt-av">{(c.author || '?')[0].toUpperCase()}</div>
          <div className="cmt-body">
            <div className="cmt-hd"><b>{c.author}</b> <span className="sub">· {timeAgo(c.at)}</span></div>
            <div className="cmt-txt">{c.body}</div>
          </div>
        </div>
      ))}
    </RSection>
  );
}

/* ───────── record pages ───────── */
function RecordShell({ crumbs, go, title, pills, actions, children }) {
  return (
    <div className="record">
      <Crumbs parts={crumbs} go={go} />
      <div className="record-hd">
        <div className="record-tt"><h2>{title}</h2><div className="record-pills">{pills}</div></div>
        <div className="record-actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function LeaseRecordPage({ id, db, go, setModal, refresh, notify, actingRole }) {
  const l = findById(db.leases, id);
  const [stageLog, setStageLog] = useState([]);
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    (async () => {
      try { setStageLog(await api.leases.stageLog(id)); } catch (_) { /* ignore */ }
      try { setDocs(await api.leaseDocs.list(id)); } catch (_) { setDocs([]); }
    })();
  }, [id]);
  if (!l) return <Callout warn>Lease not found — it may have been deleted. <a onClick={() => go('leases')}>Back to Leases</a></Callout>;
  const unit = findById(db.units, l.unitId);
  const brand = findById(db.brands, l.brandId);
  const asset = findById(db.assets, l.assetId || unit?.assetId);
  const invs = (db.invoices || []).filter((i) => i.leaseId === id).sort((a, b) => (a.ym < b.ym ? 1 : -1));
  const billed = invs.reduce((s, i) => s + (+i.total || 0), 0);
  const recd = invs.reduce((s, i) => s + (+i.paid || 0), 0);
  const edit = canEdit(actingRole, 'leases');
  const after = async () => { await refresh(['leases']); };
  const downloadDoc = async (d) => {
    try {
      const res = await fetch(api.leaseDocs.downloadUrl(id, d.id), { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = d.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { notify(e.message, true); }
  };
  return (
    <RecordShell go={go}
      crumbs={[{ label: 'Leasing', view: 'leases' }, { label: 'Leases', view: 'leases' }, { label: l.code }]}
      title={`${l.code} — ${brand?.name || '—'}`}
      pills={<><DocStatusPill st={l.docStatus} /><Pill color="teal">{l.lifecycleStage || 'Active'}</Pill>{l.onHold && <Pill color="amber">On hold</Pill>}</>}
      actions={edit && <>
        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'leaseStage', id })}>Stage</button>
        {!['Exited', 'Renewed'].includes(l.lifecycleStage) && <>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'renewLease', id })}>Renew</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'exitLease', id })}>Exit</button>
        </>}
        <button className="btn btn-teal btn-sm" onClick={() => setModal({ type: 'lease', id })}>Edit</button>
      </>}>
      <WorkflowBar type="leases" id={id} doc={l} actingRole={actingRole} afterChange={after} notify={notify} />
      <div className="record-grid">
        <div>
          <RSection title="Lease details">
            <div className="rkv-grid">
              <KV label="Brand (tenant)">{brand?.name}</KV>
              <KV label="Unit">{unit ? `${unit.name} · ${asset?.name || ''}` : '—'}</KV>
              <KV label="Term">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</KV>
              <KV label="Rental type">{l.rentalType}</KV>
              <KV label="MG">{l.mg ? money(l.mg) + (l.mgBasis === 'PerSqFt' ? ' / sq ft' : ' lumpsum') : '—'}</KV>
              <KV label="Revenue share">{l.revSharePct ? l.revSharePct + '%' : '—'}</KV>
              <KV label="CAM / Utility">{money0(l.cam)} / {money0(l.utility)} per sq ft</KV>
              <KV label="Escalation">{l.esc ? l.esc + '% p.a.' : '—'}</KV>
              <KV label="GST">{l.gst}%</KV>
              <KV label="Security deposit">{l.deposit ? money0(l.deposit) : '—'}</KV>
              <KV label="HSN / Pay terms">{(l.hsnCode || '997212') + ' · ' + (l.paymentTermsDays || 7) + ' days'}</KV>
              <KV label="Broker">{nameOf(db.brokers, l.brokerId)}</KV>
            </div>
          </RSection>
          <RSection title="Invoice parties">
            <div className="rkv-grid">
              <KV label="Lessor (on invoice)">{l.lessorName || asset?.landlordName || '—'}</KV>
              <KV label="Lessor GSTIN / PAN">{(l.lessorGstin || asset?.gstin || '—') + ' / ' + (l.lessorPan || asset?.panNo || '—')}</KV>
              <KV label="Lessee legal name">{l.lesseeName || '—'}</KV>
              <KV label="Lessee GSTIN / PAN">{(l.lesseeGstin || '—') + ' / ' + (l.lesseePan || '—')}</KV>
            </div>
          </RSection>
          <RSection title={`Billing (${invs.length} invoices)`}
            right={<span className="sub">billed {money0(billed)} · received {money0(recd)}</span>}>
            {invs.length === 0 ? <div className="sub">No invoices yet for this lease.</div> : (
              <table>
                <thead><tr><th>Invoice</th><th>Period</th><th className="num">Total</th><th className="num">Balance</th><th>Approval</th><th>Status</th></tr></thead>
                <tbody>
                  {invs.slice(0, 12).map((i) => (
                    <tr key={i.id} className="rowlink" onClick={() => go('invoices', i.id)}>
                      <td><span className="code">{i.no}</span><div className="sub">{i.type}</div></td>
                      <td className="sub">{ymLabel(i.ym)}</td>
                      <td className="num">{money0(i.total)}</td>
                      <td className="num">{money0(i.balance)}</td>
                      <td><DocStatusPill st={i.docStatus} /></td>
                      <td><Pill color={i.status === 'Paid' ? 'green' : i.status === 'Partial' ? 'blue' : 'amber'}>{i.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RSection>
          <RSection title="Documents">
            {docs === null ? <div className="sub">Loading…</div> : docs.length === 0 ? (
              <div className="sub">No documents yet — open <a onClick={() => setModal({ type: 'lease', id })}>Edit → Remarks &amp; Documents</a> to upload the deed, LOI, NFA…</div>
            ) : (
              <table><tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><Pill color="grey">{d.docType || 'Other'}</Pill></td>
                    <td><a onClick={() => downloadDoc(d)}>{d.fileName}</a></td>
                    <td className="sub">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleString('en-GB') : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </RSection>
        </div>
        <div>
          <RSection title="Stage history">
            {stageLog.length === 0 ? <div className="sub">No stage changes recorded.</div> : (
              <div className="tl">
                {stageLog.slice(0, 10).map((x, i) => (
                  <div className="tl-row tl-stage" key={i}>
                    <div className="tl-dot">⇄</div>
                    <div className="tl-body">
                      <div className="tl-head"><b>{x.by}</b> <span className="sub">· {timeAgo(x.at)}</span></div>
                      <div className="tl-detail">{x.from || '—'} → <b>{x.to}</b>{x.remarks ? ' — ' + x.remarks : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </RSection>
          <CommentsPanel type="leases" id={id} notify={notify} />
          <ActivityTimeline type="leases" id={id} />
        </div>
      </div>
    </RecordShell>
  );
}

function InvoiceRecordPage({ id, db, go, setModal, refresh, notify, actingRole }) {
  const i = findById(db.invoices, id);
  if (!i) return <Callout warn>Invoice not found. <a onClick={() => go('invoices')}>Back to Invoices</a></Callout>;
  const lease = findById(db.leases, i.leaseId);
  const colls = (db.collections || []).filter((c) => c.invoiceId === id);
  const edit = canEdit(actingRole, 'invoices');
  const after = async () => { await refresh(['invoices', 'collections']); };
  return (
    <RecordShell go={go}
      crumbs={[{ label: 'Billing', view: 'invoices' }, { label: 'Invoices', view: 'invoices' }, { label: i.no }]}
      title={`${i.no} — ${nameOf(db.brands, i.brandId)}`}
      pills={<><DocStatusPill st={i.docStatus} /><Pill color={i.status === 'Paid' ? 'green' : i.status === 'Partial' ? 'blue' : 'amber'}>{i.status}</Pill><Pill color="grey">{i.type}</Pill></>}
      actions={<>
        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'viewInvoice', id })}>🖨 View / Print</button>
        {edit && i.status !== 'Paid' && <button className="btn btn-teal btn-sm" onClick={() => setModal({ type: 'collection', invoiceId: id })}>Collect</button>}
        {edit && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'creditNote', invoice: i })}>CN / DN</button>}
        {edit && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'sdAdjust', id })}>SD Adjust</button>}
      </>}>
      <WorkflowBar type="invoices" id={id} doc={i} actingRole={actingRole} afterChange={after} notify={notify} />
      {(i.docStatus || 'Approved') !== 'Approved' && <Callout warn>This invoice can be printed only after a checker approves it.</Callout>}
      <div className="record-grid">
        <div>
          <RSection title="Invoice details">
            <div className="rkv-grid">
              <KV label="Lease">{lease ? <a onClick={() => go('leases', lease.id)}>{lease.code}</a> : '—'}</KV>
              <KV label="Brand / Unit">{nameOf(db.brands, i.brandId)} · {nameOf(db.units, i.unitId)}</KV>
              <KV label="Period">{ymLabel(i.ym)}</KV>
              <KV label="Description">{i.desc || i.type}</KV>
              <KV label="Due date">{fmtDate(i.dueDate)}</KV>
              <KV label="HSN / Terms">{(i.hsnCode || '997212') + ' · ' + (i.paymentTermsDays || 7) + ' days'}</KV>
              <KV label="IRN">{i.irn ? i.irn.slice(0, 20) + '…' : '—'}</KV>
              <KV label="Created">{i.createdBy ? `${i.createdBy} · ${timeAgo(i.createdAt)}` : '—'}</KV>
            </div>
            <table className="ledger" style={{ maxWidth: 380, marginTop: 12 }}>
              <tbody>
                <tr><td>Taxable value</td><td className="r">{money(i.amount)}</td></tr>
                {i.igstAmt > 0 ? <tr><td>IGST @{i.gstPct}%</td><td className="r">{money(i.igstAmt)}</td></tr> : <>
                  <tr><td>CGST @{(i.gstPct / 2).toFixed(1)}%</td><td className="r">{money(i.cgstAmt)}</td></tr>
                  <tr><td>SGST @{(i.gstPct / 2).toFixed(1)}%</td><td className="r">{money(i.sgstAmt)}</td></tr>
                </>}
                <tr className="tot"><td><b>Invoice total</b></td><td className="r"><b>{money(i.total)}</b></td></tr>
                <tr><td>Received (approved receipts)</td><td className="r">−{money(i.paid)}</td></tr>
                <tr><td>Credit notes (net)</td><td className="r">−{money(i.credited)}</td></tr>
                <tr className="tot"><td><b>Balance</b></td><td className="r"><b>{money(i.balance)}</b></td></tr>
              </tbody>
            </table>
          </RSection>
          <RSection title={`Receipts against this invoice (${colls.length})`}>
            {colls.length === 0 ? <div className="sub">No receipts yet.</div> : (
              <table>
                <thead><tr><th>Receipt</th><th>Date</th><th className="num">Amount</th><th className="num">TDS</th><th>Mode</th><th>Approval</th></tr></thead>
                <tbody>
                  {colls.map((c) => (
                    <tr key={c.id} className="rowlink" onClick={() => go('collections', c.id)}>
                      <td><span className="code">{c.no}</span></td>
                      <td className="sub">{fmtDate(c.date)}</td>
                      <td className="num">{money0(c.amount)}</td>
                      <td className="num sub">{money0(c.tds)}</td>
                      <td><Pill color="grey">{c.instrument}</Pill></td>
                      <td><DocStatusPill st={c.docStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RSection>
        </div>
        <div>
          <CommentsPanel type="invoices" id={id} notify={notify} />
          <ActivityTimeline type="invoices" id={id} />
        </div>
      </div>
    </RecordShell>
  );
}

function CollectionRecordPage({ id, db, go, refresh, notify, actingRole }) {
  const c = findById(db.collections, id);
  if (!c) return <Callout warn>Receipt not found. <a onClick={() => go('collections')}>Back to Collections</a></Callout>;
  const inv = findById(db.invoices, c.invoiceId);
  const after = async () => { await refresh(['collections', 'invoices']); };
  return (
    <RecordShell go={go}
      crumbs={[{ label: 'Billing', view: 'collections' }, { label: 'Collections', view: 'collections' }, { label: c.no }]}
      title={`${c.no} — ${money0(c.amount)}`}
      pills={<><DocStatusPill st={c.docStatus} />{Number(c.sdAdjAmt) > 0 && <Pill color="violet">SD Adjustment</Pill>}</>}
      actions={null}>
      <WorkflowBar type="collections" id={id} doc={c} actingRole={actingRole} afterChange={after} notify={notify} />
      {(c.docStatus || 'Approved') === 'Pending' && <Callout warn>This receipt counts in the tenant’s balance only after a checker approves it.</Callout>}
      <div className="record-grid">
        <div>
          <RSection title="Receipt details">
            <div className="rkv-grid">
              <KV label="Against invoice">{inv ? <a onClick={() => go('invoices', inv.id)}>{inv.no}</a> : '—'}</KV>
              <KV label="Brand">{nameOf(db.brands, inv?.brandId)}</KV>
              <KV label="Date">{fmtDate(c.date)}</KV>
              <KV label="Amount">{money(c.amount)}</KV>
              <KV label="TDS">{c.tds ? `${money(c.tds)} @ ${c.tdsPct}%` : '—'}</KV>
              <KV label="Instrument / Ref">{(c.instrument || '—') + (c.ref ? ' · ' + c.ref : '')}</KV>
              {Number(c.sdAdjAmt) > 0 && <KV label="SD note">{c.sdNote || '—'}</KV>}
              <KV label="Created">{c.createdBy ? `${c.createdBy} · ${timeAgo(c.createdAt)}` : '—'}</KV>
            </div>
          </RSection>
          <CommentsPanel type="collections" id={id} notify={notify} />
        </div>
        <div><ActivityTimeline type="collections" id={id} /></div>
      </div>
    </RecordShell>
  );
}

function CreditNoteRecordPage({ id, db, go, refresh, notify, actingRole }) {
  const [cn, setCn] = useState(undefined);
  const load = useCallback(async () => {
    try { const all = await api.creditNotes.list(); setCn(all.find((x) => x.id === id) || null); }
    catch (_) { setCn(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (cn === undefined) return <div className="empty"><p>Loading…</p></div>;
  if (!cn) return <Callout warn>Note not found.</Callout>;
  const inv = findById(db.invoices, cn.invoiceId);
  const after = async () => { await load(); await refresh(['invoices']); };
  return (
    <RecordShell go={go}
      crumbs={[{ label: 'Billing', view: 'invoices' }, { label: 'Credit/Debit Notes' }, { label: cn.no }]}
      title={`${cn.no} — ${cn.noteType} note`}
      pills={<><DocStatusPill st={cn.docStatus} /><Pill color={cn.noteType === 'Credit' ? 'violet' : 'red'}>{cn.noteType}</Pill></>}
      actions={null}>
      <WorkflowBar type="creditnotes" id={id} doc={cn} actingRole={actingRole} afterChange={after} notify={notify} />
      <div className="record-grid">
        <div>
          <RSection title="Note details">
            <div className="rkv-grid">
              <KV label="Against invoice">{inv ? <a onClick={() => go('invoices', inv.id)}>{inv.no}</a> : cn.invoiceId}</KV>
              <KV label="Date">{fmtDate(cn.date)}</KV>
              <KV label="Taxable amount">{money(cn.amount)}</KV>
              <KV label="GST">{money(cn.gstAmt)}</KV>
              <KV label="Total">{money(cn.total)}</KV>
              <KV label="Reason">{cn.reason}</KV>
              <KV label="Created by">{cn.createdBy}</KV>
            </div>
          </RSection>
          <CommentsPanel type="creditnotes" id={id} notify={notify} />
        </div>
        <div><ActivityTimeline type="creditnotes" id={id} /></div>
      </div>
    </RecordShell>
  );
}

const MASTER_CRUMB = { companies: 'Masters', assets: 'Masters', blocks: 'Masters', units: 'Masters', brands: 'Masters', customers: 'Masters', brokers: 'Masters', users: 'Masters' };
function MasterRecordPage({ entity, id, db, go, setModal, notify, actingRole }) {
  const sc = MASTER_SCHEMA[entity];
  const r = findById(db[entity], id);
  if (!r) return <Callout warn>Record not found. <a onClick={() => go(entity)}>Back to {sc.sing} master</a></Callout>;
  const edit = canEdit(actingRole, entity);
  // related info
  const related = [];
  if (entity === 'units') {
    const ls = (db.leases || []).filter((l) => l.unitId === id);
    related.push(['Leases on this unit', ls.map((l) => ({ label: `${l.code} · ${nameOf(db.brands, l.brandId)} · ${l.lifecycleStage}`, view: 'leases', id: l.id }))]);
  }
  if (entity === 'brands') {
    const ls = (db.leases || []).filter((l) => l.brandId === id);
    related.push(['Leases of this brand', ls.map((l) => ({ label: `${l.code} · ${nameOf(db.units, l.unitId)} · ${l.lifecycleStage}`, view: 'leases', id: l.id }))]);
  }
  if (entity === 'customers') {
    const us = (db.units || []).filter((u) => u.customerId === id);
    related.push(['Units owned', us.map((u) => ({ label: `${u.name} · ${nameOf(db.assets, u.assetId)} · ${u.status}`, view: 'units', id: u.id }))]);
  }
  return (
    <RecordShell go={go}
      crumbs={[{ label: MASTER_CRUMB[entity] || 'Masters', view: entity }, { label: sc.sing + ' Master', view: entity }, { label: r.name || r.email || r.code }]}
      title={`${r.code} — ${r.name || r.email || ''}`}
      pills={r.status ? <Pill color={r.status === 'Leased' ? 'teal' : 'grey'}>{r.status}</Pill> : r.active ? <Pill color={r.active === 'Active' ? 'green' : 'grey'}>{r.active}</Pill> : null}
      actions={edit && <button className="btn btn-teal btn-sm" onClick={() => setModal({ type: 'master', entity, id })}>Edit</button>}>
      <div className="record-grid">
        <div>
          <RSection title={sc.sing + ' details'}>
            <div className="rkv-grid">
              {sc.fields.filter((f) => f.k !== 'password').map((f) => (
                <KV key={f.k} label={f.l}>
                  {f.ref ? nameOf(db[f.ref], r[f.k]) : (r[f.k] === true ? 'Yes' : r[f.k] === false ? 'No' : (r[f.k] ?? '—') || '—')}
                </KV>
              ))}
            </div>
          </RSection>
          {related.map(([title, items]) => (
            <RSection title={title} key={title}>
              {items.length === 0 ? <div className="sub">None yet.</div> : items.map((it, idx) => (
                <div key={idx} className="rel-row"><a onClick={() => go(it.view, it.id)}>{it.label}</a></div>
              ))}
            </RSection>
          ))}
          <CommentsPanel type={entity} id={id} notify={notify} />
        </div>
        <div><ActivityTimeline type={entity} id={id} /></div>
      </div>
    </RecordShell>
  );
}

const MASTER_KEYS = ['companies', 'assets', 'blocks', 'units', 'brands', 'customers', 'brokers', 'users'];
export function RecordPage(props) {
  const { view } = props;
  if (view === 'leases') return <LeaseRecordPage {...props} />;
  if (view === 'invoices') return <InvoiceRecordPage {...props} />;
  if (view === 'collections') return <CollectionRecordPage {...props} />;
  if (view === 'creditnotes') return <CreditNoteRecordPage {...props} />;
  if (MASTER_KEYS.includes(view)) return <MasterRecordPage entity={view} {...props} />;
  return <Callout warn>This record type doesn’t have a detail page.</Callout>;
}

/* ───────── approvals inbox ───────── */
export function ApprovalsPage({ db, go, refresh, notify, actingRole }) {
  const approver = canApproveRole(actingRole);
  const [cns, setCns] = useState([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { (async () => { try { setCns(await api.creditNotes.list()); } catch (_) { /* ignore */ } })(); }, [db.invoices]);
  const pend = {
    invoices: (db.invoices || []).filter((x) => x.docStatus === 'Pending'),
    leases: (db.leases || []).filter((x) => x.docStatus === 'Pending'),
    collections: (db.collections || []).filter((x) => x.docStatus === 'Pending'),
    creditnotes: (cns || []).filter((x) => x.docStatus === 'Pending')
  };
  const total = pend.invoices.length + pend.leases.length + pend.collections.length + pend.creditnotes.length;
  const approveAll = async (type) => {
    setBusy(type);
    try { const r = await api.wf.approveAll(type); notify(`${r.approved} document(s) approved.`); await refresh(['invoices', 'leases', 'collections']); try { setCns(await api.creditNotes.list()); } catch (_) {} }
    catch (e) { notify(e.message, true); }
    finally { setBusy(''); }
  };
  const one = async (type, id, ok, reason) => {
    try {
      if (ok) await api.wf.approve(type, id);
      else await api.wf.reject(type, id, reason);
      notify(ok ? 'Approved.' : 'Rejected.');
      await refresh(['invoices', 'leases', 'collections']);
      try { setCns(await api.creditNotes.list()); } catch (_) {}
    } catch (e) { notify(e.message, true); }
  };
  const Sec = ({ type, title, rows, cols }) => (
    <RSection title={`${title} (${rows.length})`}
      right={approver && rows.length > 0 && <button className="btn btn-teal btn-sm" disabled={busy !== ''} onClick={() => approveAll(type)}>{busy === type ? 'Approving…' : `✓ Approve all ${rows.length}`}</button>}>
      {rows.length === 0 ? <div className="sub">Nothing pending.</div> : (
        <table>
          <thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => <td key={c.label}>{c.render(r)}</td>)}
                <td className="rowact">
                  <button className="btn btn-ghost btn-sm" onClick={() => go(type === 'creditnotes' ? 'creditnotes' : type, r.id)}>Open</button>
                  {approver && <>
                    <button className="btn btn-teal btn-sm" onClick={() => one(type, r.id, true)}>✓</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { const reason = window.prompt('Rejection reason (mandatory):'); if (reason && reason.trim()) one(type, r.id, false, reason.trim()); }}>✕</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </RSection>
  );
  return (
    <>
      {!approver && <Callout>You can see what’s pending, but only roles with approval rights (Role Profiles) can approve or reject.</Callout>}
      {total === 0 && <Callout>✓ Nothing is pending approval — all documents are checked.</Callout>}
      <Sec type="invoices" title="Invoices pending approval" rows={pend.invoices} cols={[
        { label: 'Invoice', render: (r) => <><span className="code">{r.no}</span><div className="sub">{r.type}</div></> },
        { label: 'Brand', render: (r) => nameOf(db.brands, r.brandId) },
        { label: 'Period', render: (r) => ymLabel(r.ym) },
        { label: 'Total', render: (r) => money0(r.total) },
        { label: 'Maker', render: (r) => <span className="sub">{r.createdBy || '—'}</span> }
      ]} />
      <Sec type="collections" title="Receipts pending approval" rows={pend.collections} cols={[
        { label: 'Receipt', render: (r) => <span className="code">{r.no}</span> },
        { label: 'Invoice', render: (r) => <span className="code">{findById(db.invoices, r.invoiceId)?.no || '—'}</span> },
        { label: 'Date', render: (r) => fmtDate(r.date) },
        { label: 'Amount', render: (r) => money0(r.amount) },
        { label: 'Maker', render: (r) => <span className="sub">{r.createdBy || '—'}</span> }
      ]} />
      <Sec type="leases" title="Leases pending approval" rows={pend.leases} cols={[
        { label: 'Lease', render: (r) => <span className="code">{r.code}</span> },
        { label: 'Brand / Unit', render: (r) => <>{nameOf(db.brands, r.brandId)}<div className="sub">{nameOf(db.units, r.unitId)}</div></> },
        { label: 'MG', render: (r) => money0(r.mg) },
        { label: 'Stage', render: (r) => r.lifecycleStage },
        { label: 'Maker', render: (r) => <span className="sub">{r.createdBy || '—'}</span> }
      ]} />
      <Sec type="creditnotes" title="Credit / Debit notes pending approval" rows={pend.creditnotes} cols={[
        { label: 'Note', render: (r) => <><span className="code">{r.no}</span><div className="sub">{r.noteType}</div></> },
        { label: 'Invoice', render: (r) => <span className="code">{findById(db.invoices, r.invoiceId)?.no || '—'}</span> },
        { label: 'Total', render: (r) => money0(r.total) },
        { label: 'Reason', render: (r) => <span className="sub">{r.reason}</span> },
        { label: 'Maker', render: (r) => <span className="sub">{r.createdBy || '—'}</span> }
      ]} />
    </>
  );
}

/* ───────── command palette (Ctrl+G / Ctrl+K) ───────── */
export function CommandPalette({ open, onClose, go, actingRole }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  const timer = useRef(null);
  const NAV_SHORTCUTS = [
    ['dashboard', 'Dashboard'], ['inventory', 'Inventory'], ['leases', 'Leases List'], ['invoices', 'Invoices List'],
    ['collections', 'Collections List'], ['approvals', 'Approvals Inbox'], ['ledger', 'Tenant Ledger'],
    ['units', 'Unit Master'], ['customers', 'Customer Master'], ['brands', 'Brand Master'], ['brokers', 'Broker Master'],
    ['companies', 'Lessee Company Master'], ['assets', 'Project Master'], ['reportcenter', 'Report Center'],
    ['gstrecon', 'GST Reconciliation'], ['sdrecon', 'SD Reconciliation'], ['roleprofiles', 'Role Profiles']
  ];
  useEffect(() => { if (open) { setQ(''); setRows([]); setHi(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRows([]); return; }
    timer.current = setTimeout(async () => {
      try { setRows(await api.search(q.trim())); setHi(0); } catch (_) { setRows([]); }
    }, 220);
  }, [q, open]);
  if (!open) return null;
  const navHits = q.trim().length >= 2
    ? NAV_SHORTCUTS.filter(([v, l]) => l.toLowerCase().includes(q.trim().toLowerCase()) && canView(actingRole, v)).map(([v, l]) => ({ nav: true, view: v, name: l }))
    : NAV_SHORTCUTS.slice(0, 8).filter(([v]) => canView(actingRole, v)).map(([v, l]) => ({ nav: true, view: v, name: l }));
  const items = [...navHits.slice(0, 5), ...rows];
  const pick = (it) => {
    if (!it) return;
    if (it.nav) go(it.view);
    else go(it.view === 'collections' ? 'collections' : it.view === 'invoices' ? 'invoices' : it.view, it.nav ? null : it.id);
    onClose();
  };
  return (
    <div className="pal-scrim" onClick={(e) => { if (e.target.classList.contains('pal-scrim')) onClose(); }}>
      <div className="pal">
        <div className="pal-inp">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input ref={inputRef} value={q} placeholder="Search or type a command — lease code, invoice no, brand, unit…  (Esc to close)"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, items.length - 1));
              else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
              else if (e.key === 'Enter') pick(items[hi]);
            }} />
          <span className="pal-kbd">Ctrl+G</span>
        </div>
        <div className="pal-list">
          {items.length === 0 && <div className="pal-empty">{q.trim().length < 2 ? 'Type to search records, or pick a page below.' : 'No matches.'}</div>}
          {items.map((it, i) => (
            <div key={(it.nav ? 'n' : 'r') + i} className={'pal-row' + (i === hi ? ' on' : '')}
              onMouseEnter={() => setHi(i)} onClick={() => pick(it)}>
              {it.nav ? (
                <><span className="pal-type">Page</span><b>{it.name}</b><span className="sub">open list</span></>
              ) : (
                <><span className="pal-type">{it.label}</span><b>{it.code}</b><span>{it.name !== it.code ? it.name : ''}</span><span className="sub">{it.extra || ''}</span></>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── workspace cards for the dashboard ───────── */
export function WorkspaceCards({ go, actingRole }) {
  const [data, setData] = useState(null);
  useEffect(() => { (async () => { try { setData(await api.stats.workspace()); } catch (_) { setData(null); } })(); }, []);
  if (!data) return null;
  const card = (c) => (
    <div className="ws-card" key={c.key} onClick={() => canView(actingRole, c.key === 'creditnotes' ? 'invoices' : c.key) && go(c.key === 'creditnotes' ? 'invoices' : c.key)}>
      <div className="ws-lab">{c.label.toUpperCase()}</div>
      <div className={'ws-val c-' + c.key}>{c.count.toLocaleString('en-IN')}</div>
      <div className="ws-sub">
        {c.today > 0 ? <span className="ws-up">↗ {c.today} today</span> : <span>0 today</span>}
        {c.pending > 0 && <span className="ws-pend" onClick={(e) => { e.stopPropagation(); go('approvals'); }}>{c.pending} pending approval</span>}
      </div>
    </div>
  );
  return (
    <>
      <div className="ws-sect">Master Data</div>
      <div className="ws-grid">{data.masters.map(card)}</div>
      <div className="ws-sect">Process</div>
      <div className="ws-grid">{data.process.map(card)}</div>
    </>
  );
}

/* ───────── Frappe-style list controls ───────── */
export function ListMeta({ shown, total, pageSize, setPageSize }) {
  return (
    <div className="listmeta">
      <span className="chip">{Math.min(shown, pageSize)} of {total}</span>
      <span className="listmeta-ps">
        {[20, 100, 500].map((n) => (
          <button key={n} className={pageSize === n ? 'on' : ''} onClick={() => setPageSize(n)}>{n}</button>
        ))}
      </span>
    </div>
  );
}
