import React, { useEffect, useState, useCallback } from 'react';
import { api, setToken } from './api.js';
import Login from './Login.jsx';
import { Modal, ConfirmModal, Toast, Callout, Pill, EmptyState } from './components.jsx';
import {
  money, money0, fmtDate, ymLabel, curYM, addMonths, nameOf, findById, toCSV, download,
  CATEGORIES, ROLES, canApprove, MASTER_SCHEMA, RENTAL_TYPES, RENTAL_HINT, NAV, PAGES
} from './helpers.js';

const EMPTY_DB = {
  companies: [], assets: [], blocks: [], units: [], brands: [], users: [],
  leases: [], sales: [], invoices: [], collections: [], investorUnits: [], disbursals: []
};

export default function App() {
  const [authUser, setAuthUser] = useState(null); // null = not logged in
  const [db, setDb] = useState(EMPTY_DB);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [actingRole, setActingRole] = useState('Finance Head');
  const [modal, setModal] = useState(null); // {type, id, ...}
  const [toast, setToast] = useState(null);
  const [railOpen, setRailOpen] = useState(false);

  const notify = useCallback((msg, err) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const refresh = useCallback(async (keys) => {
    const all = ['companies', 'assets', 'blocks', 'units', 'brands', 'users', 'leases', 'sales', 'invoices', 'collections', 'investorUnits', 'disbursals'];
    const target = keys || all;
    const fetchers = {
      companies: api.companies.list, assets: api.assets.list, blocks: api.blocks.list, units: api.units.list,
      brands: api.brands.list, users: api.users.list, leases: api.leases.list, sales: api.sales.list,
      invoices: api.invoices.list, collections: api.collections.list, investorUnits: api.investorUnits.list,
      disbursals: api.disbursement.list
    };
    try {
      const results = await Promise.all(target.map((k) => fetchers[k]()));
      setDb((prev) => {
        const next = { ...prev };
        target.forEach((k, i) => { next[k] = results[i]; });
        return next;
      });
    } catch (e) {
      notify(e.message, true);
    }
  }, [notify]);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh, authUser]);

  useEffect(() => { setSearch(''); setFilterVal(''); setRailOpen(false); }, [view]);

  const onLogin = (user) => {
    setAuthUser(user);
    // Admins get Finance-Head-level approval powers by default; others use their own role
    setActingRole(user.isAdmin ? 'Finance Head' : (user.role || 'Manager'));
  };
  const onLogout = () => {
    setToken(null);
    setAuthUser(null);
    setDb(EMPTY_DB);
    setView('dashboard');
  };

  if (!authUser) return <Login onLogin={onLogin} />;

  const page = PAGES[view];

  return (
    <div className="app">
      <aside className={`rail${railOpen ? ' show' : ''}`}>
        <div className="brand"><div className="logo">S</div><div><h1>ScoopSense</h1><span>Leasing &amp; Billing</span></div></div>
        <nav className="nav">
          {NAV.filter((n) => n.v !== 'users' || authUser.isAdmin).map((n, i) => n.grp && !n.v ? <div className="grp" key={i}>{n.grp}</div> : (
            <a key={n.v} className={n.v === view ? 'active' : ''} onClick={() => setView(n.v)}>
              {n.label}
              {db[n.v] && <span className="cnt">{db[n.v].length}</span>}
            </a>
          ))}
        </nav>
        <div className="userbox">
          {authUser.isAdmin ? (
            <>
              <label>Acting as</label>
              <select value={actingRole} onChange={(e) => { setActingRole(e.target.value); notify('Now acting as ' + e.target.value); }}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </>
          ) : (
            <>
              <label>Signed in as</label>
              <div className="role-locked">{actingRole}</div>
            </>
          )}
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="menutoggle" onClick={() => setRailOpen((s) => !s)}>
            <svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </div>
          <div className="tt"><h2>{page.t}</h2><p>{page.s}</p></div>
          <PageAction view={view} setModal={setModal} db={db} />
          <div className="topbar-user">
            <div className="who"><b>{authUser.email}</b>{authUser.isAdmin ? 'Admin' : authUser.role}</div>
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
          </div>
        </div>
        <div className="wrap">
          {loading ? <div className="empty"><p>Loading…</p></div> : (
            <ViewRouter view={view} db={db} search={search} setSearch={setSearch} filterVal={filterVal} setFilterVal={setFilterVal}
              actingRole={actingRole} setModal={setModal} refresh={refresh} notify={notify} />
          )}
        </div>
      </div>
      {modal && (
        <ModalRouter modal={modal} db={db} setModal={setModal} refresh={refresh} notify={notify} actingRole={actingRole} />
      )}
      <Toast toast={toast} />
    </div>
  );
}

function PageAction({ view, setModal, db }) {
  const MASTER_KEYS = ['companies', 'assets', 'blocks', 'units', 'brands', 'users'];
  if (MASTER_KEYS.includes(view)) {
    return <button className="btn btn-teal" onClick={() => setModal({ type: 'master', entity: view })}><PlusIcon />New {MASTER_SCHEMA[view].sing.toLowerCase()}</button>;
  }
  if (view === 'leases') return <button className="btn btn-teal" onClick={() => setModal({ type: 'lease' })}><PlusIcon />New lease</button>;
  if (view === 'sales') return <button className="btn btn-teal" onClick={() => setModal({ type: 'sales' })}><PlusIcon />Enter sales</button>;
  if (view === 'invoices') return <button className="btn btn-teal" onClick={() => setModal({ type: 'generate' })}><PlusIcon />Generate invoices</button>;
  if (view === 'collections') return <button className="btn btn-teal" onClick={() => setModal({ type: 'collection' })}><PlusIcon />Capture collection</button>;
  if (view === 'investors') return <button className="btn btn-teal" onClick={() => setModal({ type: 'investor' })}><PlusIcon />Define investor unit</button>;
  return null;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 14, height: 14, marginRight: 4 }}><path d="M12 5v14M5 12h14" /></svg>;
}

function SearchBox({ placeholder, value, onChange }) {
  return (
    <div className="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ViewRouter(props) {
  const { view } = props;
  const MASTER_KEYS = ['companies', 'assets', 'blocks', 'units', 'brands', 'users'];
  if (MASTER_KEYS.includes(view)) return <MasterListPage {...props} entity={view} />;
  if (view === 'dashboard') return <Dashboard {...props} />;
  if (view === 'leases') return <LeasesPage {...props} />;
  if (view === 'sales') return <SalesPage {...props} />;
  if (view === 'invoices') return <InvoicesPage {...props} />;
  if (view === 'collections') return <CollectionsPage {...props} />;
  if (view === 'investors') return <InvestorsPage {...props} />;
  if (view === 'disbursement') return <DisbursementPage {...props} />;
  if (view === 'reports') return <ReportsPage {...props} />;
  return null;
}

/* ===================== MASTERS (generic CRUD) ===================== */
function MasterListPage({ entity, db, search, setSearch, setModal, refresh, notify }) {
  const sc = MASTER_SCHEMA[entity];
  const rows = (db[entity] || []).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

  const del = async (id) => {
    try { await api[entity].remove(id); await refresh([entity]); notify('Deleted.'); }
    catch (e) { notify(e.message, true); }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox placeholder={`Search ${sc.sing.toLowerCase()}…`} value={search} onChange={setSearch} />
      </div>
      <div className="tablewrap">
        {db[entity].length === 0 ? <EmptyState thing={sc.sing} onAdd={() => setModal({ type: 'master', entity })} /> : (
          <table>
            <thead><tr>{sc.head.map((h) => <th key={h}>{h}</th>)}<th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={sc.head.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>No records match your search.</td></tr> :
                rows.map((r) => (
                  <tr key={r.id}>
                    {sc.cols(r, db).map((c, i) => <td key={i}>{i === 0 ? <span className="code">{c}</span> : c}</td>)}
                    <td className="rowact">
                      <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'master', entity, id: r.id })}><EditIcon /></button>
                      <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteMaster', entity, id: r.id, name: r.name })}><DelIcon /></button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
function EditIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>; }
function DelIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>; }

function MasterFormModal({ entity, id, db, onClose, refresh, notify }) {
  const sc = MASTER_SCHEMA[entity];
  const existing = id ? findById(db[entity], id) : null;
  const [form, setForm] = useState(() => {
    const init = {};
    sc.fields.forEach((f) => { init[f.k] = existing ? existing[f.k] : (f.type === 'select' ? f.opts[0] : ''); });
    return init;
  });
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const save = async () => {
    for (const f of sc.fields) {
      if (f.req && !form[f.k]) return notify(`${f.l} is required.`, true);
    }
    try {
      if (id) await api[entity].update(id, form); else await api[entity].create(form);
      await refresh([entity]);
      notify(id ? `${sc.sing} updated.` : `${sc.sing} created.`);
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title={id ? `Edit ${sc.sing.toLowerCase()}` : `New ${sc.sing.toLowerCase()}`} onClose={onClose} onSave={save}>
      {sc.fields.map((f) => (
        <div className="field" key={f.k}>
          <label>{f.l} {f.req && <span className="req">*</span>}</label>
          {f.type === 'select' ? (
            <select value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}>
              {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea value={form[f.k]} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
          ) : f.ref ? (
            <select value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}>
              <option value="">Select {f.l.toLowerCase()}…</option>
              {db[f.ref].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} value={form[f.k] ?? ''} placeholder={f.ph} onChange={(e) => set(f.k, f.type === 'number' ? e.target.value : e.target.value)} />
          )}
        </div>
      ))}
    </Modal>
  );
}

/* ===================== MODAL ROUTER ===================== */
function ModalRouter({ modal, db, setModal, refresh, notify, actingRole }) {
  const close = () => setModal(null);
  switch (modal.type) {
    case 'master':
      return <MasterFormModal entity={modal.entity} id={modal.id} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteMaster':
      return <ConfirmModal title={`Delete this ${MASTER_SCHEMA[modal.entity].sing.toLowerCase()}?`}
        message={`This will remove "${modal.name}" permanently.`} onClose={close}
        onConfirm={async () => { try { await api[modal.entity].remove(modal.id); await refresh([modal.entity]); notify('Deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'lease':
      return <LeaseFormModal id={modal.id} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'holdLease':
      return <HoldLeaseModal id={modal.id} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteLease':
      return <ConfirmModal title="Delete this lease?" message="Unpaid invoices for it will also be removed." onClose={close}
        onConfirm={async () => { try { await api.leases.remove(modal.id); await refresh(['leases', 'invoices', 'units']); notify('Lease deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'sales':
      return <SalesFormModal db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteSales':
      return <ConfirmModal title="Delete this sales entry?" message="The linked rev-share invoice will be recalculated." onClose={close}
        onConfirm={async () => { try { await api.sales.remove(modal.id); await refresh(['sales', 'invoices']); notify('Deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'generate':
      return <GenerateInvoiceModal db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'viewInvoice':
      return <ViewInvoiceModal id={modal.id} db={db} onClose={close} />;
    case 'confirmDeleteInvoice':
      return <ConfirmModal title="Delete this invoice?" message="Any collections against it will also be removed." onClose={close}
        onConfirm={async () => { try { await api.invoices.remove(modal.id); await refresh(['invoices', 'collections']); notify('Invoice deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'collection':
      return <CollectionFormModal invoiceId={modal.invoiceId} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteCollection':
      return <ConfirmModal title="Delete this collection?" message="" onClose={close}
        onConfirm={async () => { try { await api.collections.remove(modal.id); await refresh(['collections', 'invoices']); notify('Deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'investor':
      return <InvestorFormModal id={modal.id} db={db} actingRole={actingRole} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteInvestor':
      return <ConfirmModal title="Delete this investor unit?" message="" onClose={close}
        onConfirm={async () => { try { await api.investorUnits.remove(modal.id); await refresh(['investorUnits']); notify('Deleted.'); } catch (e) { notify(e.message, true); } close(); }} />;
    case 'disburse':
      return <DisburseFormModal candidate={modal.candidate} ym={modal.ym} actingRole={actingRole} onClose={close} refresh={refresh} notify={notify} />;
    case 'voidDisb':
      return <VoidDisbModal id={modal.id} onClose={close} refresh={refresh} notify={notify} />;
    case 'viewDisb':
      return <ViewDisbModal disb={modal.disb} db={db} onClose={close} />;
    default:
      return null;
  }
}

/* ===================== DASHBOARD ===================== */
function Dashboard({ db }) {
  const totalUnits = db.units.length;
  const leasedUnits = db.units.filter((u) => u.status === 'Leased').length;
  const vacantUnits = db.units.filter((u) => u.status === 'Vacant').length;
  const unpaidTotal = db.invoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + (i.balance ?? (i.total - (i.paid || 0))), 0);
  const collectedThisMonth = db.collections.filter((c) => c.date >= curYM() + '-01').reduce((s, c) => s + c.amount, 0);
  const pendingApprovals = db.investorUnits.filter((iv) => iv.status === 'Pending').length + db.disbursals.filter((d) => d.status === 'Pending').length;

  const recentInvoices = [...db.invoices].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)).slice(0, 8);
  const recentDisb = [...db.disbursals].sort((a, b) => (a.no < b.no ? 1 : -1)).slice(0, 6);

  return (
    <>
      <div className="kpis">
        <div className="kpi on"><div className="lab">Units leased</div><div className="val">{leasedUnits} / {totalUnits}</div><div className="sub">{vacantUnits} vacant</div></div>
        <div className="kpi"><div className="lab">Outstanding receivables</div><div className="val m">{money0(unpaidTotal)}</div><div className="sub">across unpaid/partial invoices</div></div>
        <div className="kpi"><div className="lab">Collected this month</div><div className="val m">{money0(collectedThisMonth)}</div><div className="sub">receipts to date</div></div>
        <div className="kpi"><div className="lab">Pending approvals</div><div className="val">{pendingApprovals}</div><div className="sub">investor units + disbursals</div></div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="ph"><h3>Recent invoices</h3></div>
          <div className="pb">
            {recentInvoices.length === 0 ? <EmptyMini text="No invoices yet." /> : (
              <table><thead><tr><th>Invoice</th><th>Type</th><th>Brand</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>{recentInvoices.map((i) => (
                  <tr key={i.id}><td><span className="code">{i.no}</span></td><td><TypePill t={i.type} /></td>
                    <td>{nameOf(db.brands, i.brandId)}</td><td className="num">{money0(i.total)}</td>
                    <td><StatusPill st={i.status} overdue={i.status !== 'Paid' && i.dueDate < curYM() + '-01'} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="ph"><h3>Recent disbursements</h3></div>
            <div className="pb">
              {recentDisb.length === 0 ? <EmptyMini text="No disbursals yet." /> : (
                <table><tbody>{recentDisb.map((d) => (
                  <tr key={d.id}><td><span className="code">{d.no}</span><div className="sub">{d.investorName}</div></td>
                    <td className="num strong">{money0(d.netPayable)}</td><td><DisbStatusPill st={d.status} /></td></tr>
                ))}</tbody></table>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
function EmptyMini({ text }) { return <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>{text}</div>; }
function TypePill({ t }) {
  const map = { MG: 'teal', RevShare: 'violet', CAM: 'blue', Utility: 'amber', Adhoc: 'grey' };
  return <Pill color={map[t] || 'grey'}>{t === 'RevShare' ? 'Rev share' : t === 'Adhoc' ? 'Ad-hoc' : t}</Pill>;
}
function RentTypePill({ t }) {
  const map = { MG: ['teal', 'MG'], MGvsRS: ['violet', 'MG vs RS'], PureRS: ['blue', 'Pure RS'], VarRS: ['amber', 'Variable RS'] };
  const [c, l] = map[t] || ['grey', t];
  return <Pill color={c}>{l}</Pill>;
}
function StatusPill({ st, overdue }) {
  if (st === 'Paid') return <Pill color="green">Paid</Pill>;
  if (st === 'Partial') return <Pill color="blue">Partial</Pill>;
  return overdue ? <Pill color="red">Overdue</Pill> : <Pill color="amber">Unpaid</Pill>;
}
function DisbStatusPill({ st }) {
  if (st === 'Processed') return <Pill color="green">Processed</Pill>;
  if (st === 'Pending') return <Pill color="amber">Awaiting approval</Pill>;
  if (st === 'Void') return <Pill color="red">Void</Pill>;
  return <Pill color="grey">{st}</Pill>;
}
function UnitStatusPill({ s }) {
  if (s === 'Leased') return <Pill color="teal">Leased</Pill>;
  if (s === 'On Hold') return <Pill color="amber">On Hold</Pill>;
  return <Pill color="grey">Vacant</Pill>;
}

/* ===================== LEASES ===================== */
function LeasesPage({ db, search, setSearch, setModal, refresh, notify }) {
  const rows = db.leases.filter((l) => !search || [nameOf(db.brands, l.brandId), nameOf(db.units, l.unitId), l.code].join(' ').toLowerCase().includes(search.toLowerCase()));
  const release = async (id) => {
    try { await api.leases.release(id); await refresh(['leases']); notify('Lease released from hold.'); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
      <div className="toolbar"><SearchBox placeholder="Search leases, brands, units…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.leases.length === 0 ? <EmptyState thing="lease" onAdd={() => setModal({ type: 'lease' })} /> : (
          <table>
            <thead><tr><th>Lease</th><th>Brand / Unit</th><th>Type</th><th className="num">MG / RS%</th><th>Term</th><th>Hold</th><th></th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><span className="code">{l.code}</span></td>
                  <td>{nameOf(db.brands, l.brandId)}<div className="sub">{nameOf(db.units, l.unitId)}</div></td>
                  <td><RentTypePill t={l.rentalType} /></td>
                  <td className="num">{l.mg ? money0(l.mg) : '—'} {l.revSharePct ? `/ ${l.revSharePct}%` : ''}</td>
                  <td className="sub">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                  <td>{l.onHold ? <Pill color="amber">On hold</Pill> : <Pill color="green">Active</Pill>}</td>
                  <td className="rowact">
                    {l.onHold
                      ? <button className="btn btn-ghost btn-sm" onClick={() => release(l.id)}>Release</button>
                      : <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'holdLease', id: l.id })}>Hold</button>}
                    <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'lease', id: l.id })}><EditIcon /></button>
                    <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteLease', id: l.id })}><DelIcon /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function LeaseFormModal({ id, db, onClose, refresh, notify }) {
  const existing = id ? findById(db.leases, id) : null;
  const vacantUnits = db.units.filter((u) => u.status !== 'Leased' || (existing && u.id === existing.unitId));
  const [form, setForm] = useState(() => existing ? {
    brandId: existing.brandId, unitId: existing.unitId, startDate: existing.startDate, months: 36,
    rentalType: existing.rentalType, mgBasis: existing.mgBasis, mg: existing.mg, revSharePct: existing.revSharePct,
    cam: existing.cam, utility: existing.utility, esc: existing.esc, deposit: existing.deposit, gst: existing.gst
  } : {
    brandId: db.brands[0]?.id || '', unitId: vacantUnits[0]?.id || '', startDate: new Date().toISOString().slice(0, 10), months: 36,
    rentalType: 'MG', mgBasis: 'PerSqFt', mg: 70, revSharePct: 8, cam: 20, utility: 12, esc: 5, deposit: '', gst: 18
  });
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  if (!id && !vacantUnits.length) { notify('No vacant units. Create a unit first.', true); onClose(); return null; }
  if (!db.brands.length) { notify('Create a brand first.', true); onClose(); return null; }

  const save = async () => {
    try {
      if (id) await api.leases.update(id, form); else await api.leases.create(form);
      await refresh(['leases', 'units']);
      notify(id ? 'Lease updated.' : 'Lease created.');
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title={id ? 'Edit lease' : 'New lease'} onClose={onClose} onSave={save} wide>
      <div className="grp2">
        <div className="field"><label>Brand <span className="req">*</span></label>
          <select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
            {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Unit <span className="req">*</span></label>
          <select value={form.unitId} disabled={!!id} onChange={(e) => set('unitId', e.target.value)}>
            {vacantUnits.map((u) => <option key={u.id} value={u.id}>{u.name} · {nameOf(db.assets, u.assetId)}</option>)}
          </select>
        </div>
      </div>
      <div className="grp3">
        <div className="field"><label>Start date <span className="req">*</span></label><input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
        <div className="field"><label>Term (months)</label><input type="number" value={form.months} disabled={!!id} onChange={(e) => set('months', +e.target.value)} /></div>
        <div className="field"><label>GST %</label><input type="number" value={form.gst} onChange={(e) => set('gst', +e.target.value)} /></div>
      </div>
      <div className="sectlabel">Rental structure</div>
      <div className="field"><label>Type</label>
        <select value={form.rentalType} onChange={(e) => set('rentalType', e.target.value)}>
          {RENTAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="grp2">
        <div className="field"><label>MG basis</label>
          <select value={form.mgBasis} onChange={(e) => set('mgBasis', e.target.value)}>
            {['Lumpsum', 'PerSqFt'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field"><label>MG amount (₹ lumpsum or ₹/sq ft)</label><input type="number" value={form.mg} onChange={(e) => set('mg', +e.target.value)} /></div>
      </div>
      <div className="grp2">
        <div className="field"><label>Revenue share %</label><input type="number" step="0.5" value={form.revSharePct} onChange={(e) => set('revSharePct', +e.target.value)} /></div>
        <div className="field"><label>Annual escalation %</label><input type="number" step="0.5" value={form.esc} onChange={(e) => set('esc', +e.target.value)} /></div>
      </div>
      <div className="sectlabel">CAM, Utility &amp; Deposit</div>
      <div className="grp3">
        <div className="field"><label>CAM (₹/sq ft b-up)</label><input type="number" value={form.cam} onChange={(e) => set('cam', +e.target.value)} /></div>
        <div className="field"><label>Utility (₹/sq ft b-up)</label><input type="number" value={form.utility} onChange={(e) => set('utility', +e.target.value)} /></div>
        <div className="field"><label>Security deposit (₹)</label><input type="number" value={form.deposit} onChange={(e) => set('deposit', +e.target.value)} /></div>
      </div>
      <Callout>{RENTAL_HINT[form.rentalType]}</Callout>
    </Modal>
  );
}

function HoldLeaseModal({ id, onClose, refresh, notify }) {
  const [remarks, setRemarks] = useState('');
  const save = async () => {
    if (!remarks.trim()) return notify('Remarks are mandatory for hold.', true);
    try { await api.leases.hold(id, remarks); await refresh(['leases']); notify('Lease put on hold.'); onClose(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <Modal title="Put lease on hold" onClose={onClose} onSave={save}>
      <div className="field"><label>Remarks <span className="req">*</span></label>
        <textarea placeholder="Reason for holding rent / billing" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ===================== SALES ===================== */
function SalesPage({ db, search, setSearch, setModal, notify }) {
  const rsLeases = db.leases.filter((l) => ['PureRS', 'MGvsRS', 'VarRS'].includes(l.rentalType));
  const rows = db.sales.filter((s) => {
    const l = findById(db.leases, s.leaseId);
    return !search || [nameOf(db.brands, l?.brandId), s.ym].join(' ').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (a.ym < b.ym ? 1 : -1));

  return (
    <>
      <div className="toolbar"><SearchBox placeholder="Search sales by brand or month…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.sales.length === 0 ? (
          rsLeases.length ? <EmptyState thing="sales entry" onAdd={() => setModal({ type: 'sales' })} /> : <EmptyMini text="No revenue-share leases yet. Create a Pure-RS or MG-vs-RS lease first." />
        ) : (
          <table>
            <thead><tr><th>Month</th><th>Brand / Lease</th><th>Type</th><th className="num">Reported sales</th><th className="num">Rev share</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const l = findById(db.leases, s.leaseId);
                const rs = (+s.amount) * (l ? l.revSharePct : 0) / 100;
                return (
                  <tr key={s.id}>
                    <td className="strong">{ymLabel(s.ym)}</td>
                    <td>{nameOf(db.brands, l?.brandId)}<div className="sub">{l?.code}</div></td>
                    <td>{l && <RentTypePill t={l.rentalType} />}</td>
                    <td className="num">{money0(s.amount)}</td>
                    <td className="num strong">{money0(rs)}<div className="sub" style={{ textAlign: 'right' }}>@ {l?.revSharePct}%</div></td>
                    <td className="rowact"><button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteSales', id: s.id })}><DelIcon /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function SalesFormModal({ db, onClose, refresh, notify }) {
  const rsLeases = db.leases.filter((l) => ['PureRS', 'MGvsRS', 'VarRS'].includes(l.rentalType));
  if (!rsLeases.length) { notify('No revenue-share leases to record sales for.', true); onClose(); return null; }
  const [leaseId, setLeaseId] = useState(rsLeases[0].id);
  const [ym, setYm] = useState(addMonths(curYM(), -1));
  const [amount, setAmount] = useState('');

  const save = async () => {
    if (!amount) return notify('Enter sales amount.', true);
    try {
      await api.sales.create({ leaseId, ym, amount: +amount });
      await refresh(['sales', 'invoices']);
      notify('Sales recorded & rev-share invoice updated.');
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title="Enter monthly sales" onClose={onClose} onSave={save}>
      <div className="field"><label>Lease <span className="req">*</span></label>
        <select value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
          {rsLeases.map((l) => <option key={l.id} value={l.id}>{nameOf(db.brands, l.brandId)} · {l.code} · {l.revSharePct}%</option>)}
        </select>
      </div>
      <div className="grp2">
        <div className="field"><label>Month <span className="req">*</span></label><input type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></div>
        <div className="field"><label>Reported sales (₹) <span className="req">*</span></label><input type="number" placeholder="4200000" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <Callout>Saving recomputes the revenue-share invoice for that month automatically.</Callout>
    </Modal>
  );
}

/* ===================== INVOICES ===================== */
function InvoicesPage({ db, search, setSearch, filterVal, setFilterVal, setModal, notify }) {
  let rows = db.invoices.filter((i) => !search || [i.no, i.type, nameOf(db.brands, i.brandId), nameOf(db.units, i.unitId)].join(' ').toLowerCase().includes(search.toLowerCase()));
  if (filterVal) rows = rows.filter((i) => i.type === filterVal);
  rows = [...rows].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));

  return (
    <>
      <div className="toolbar">
        <SearchBox placeholder="Search invoices…" value={search} onChange={setSearch} />
        <select className="filt" value={filterVal} onChange={(e) => setFilterVal(e.target.value)}>
          {['', 'MG', 'RevShare', 'CAM', 'Utility', 'Adhoc'].map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
        </select>
      </div>
      <div className="tablewrap">
        {db.invoices.length === 0 ? <EmptyState thing="invoice" onAdd={() => setModal({ type: 'generate' })} /> : (
          <table>
            <thead><tr><th>Invoice</th><th>Type</th><th>Brand / Unit</th><th>Period</th><th className="num">Amount</th><th className="num">GST</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><span className="code">{i.no}</span><div className="sub">IRN {i.irn?.slice(0, 8)}…</div></td>
                  <td><TypePill t={i.type} /></td>
                  <td>{nameOf(db.brands, i.brandId)}<div className="sub">{nameOf(db.units, i.unitId)}</div></td>
                  <td className="sub">{ymLabel(i.ym)}</td>
                  <td className="num">{money(i.amount)}</td>
                  <td className="num sub">{money(i.gstAmt)}</td>
                  <td className="num strong">{money(i.total)}</td>
                  <td><StatusPill st={i.status} overdue={i.dueDate < curYM() + '-01'} /></td>
                  <td className="rowact">
                    <button className="iconbtn" title="View e-invoice" onClick={() => setModal({ type: 'viewInvoice', id: i.id })}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    {i.status !== 'Paid' && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'collection', invoiceId: i.id })}>Collect</button>}
                    <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteInvoice', id: i.id })}><DelIcon /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function GenerateInvoiceModal({ db, onClose, refresh, notify }) {
  if (!db.leases.length) { notify('Create a lease first.', true); onClose(); return null; }
  const [scope, setScope] = useState('all');
  const [ym, setYm] = useState(curYM());
  const [adhoc, setAdhoc] = useState(false);
  const [aLease, setALease] = useState(db.leases[0].id);
  const [aDesc, setADesc] = useState('');
  const [aAmt, setAAmt] = useState('');
  const [aGst, setAGst] = useState(18);

  const save = async () => {
    try {
      if (adhoc) {
        if (!aAmt) return notify('Enter ad-hoc amount.', true);
        await api.invoices.adhoc({ leaseId: aLease, ym, desc: aDesc, amount: +aAmt, gstPct: +aGst });
        await refresh(['invoices']);
        notify('Ad-hoc invoice booked.');
      } else {
        const { count } = await api.invoices.generate(ym, scope);
        await refresh(['invoices']);
        notify(count ? `${count} invoice(s) generated for ${ymLabel(ym)}.` : 'No new invoices (already generated or on hold).');
      }
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title="Generate invoices" onClose={onClose} onSave={save}>
      <Callout>Auto-creates MG / Rev-share / CAM / Utility invoices for the selected month per each lease's structure. Leases on hold are skipped.</Callout>
      <div className="field" style={{ marginTop: 14 }}><label>Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All active leases</option>
          {db.leases.filter((l) => l.status === 'Active').map((l) => <option key={l.id} value={l.id}>{nameOf(db.brands, l.brandId)} · {l.code}</option>)}
        </select>
      </div>
      <div className="field"><label>Billing month <span className="req">*</span></label><input type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></div>
      <div className="sectlabel">Or book an ad-hoc invoice</div>
      <label className="chk"><input type="checkbox" checked={adhoc} onChange={(e) => setAdhoc(e.target.checked)} /> Create a manual ad-hoc invoice instead</label>
      {adhoc && (
        <div style={{ marginTop: 12 }}>
          <div className="grp2">
            <div className="field"><label>Lease</label>
              <select value={aLease} onChange={(e) => setALease(e.target.value)}>
                {db.leases.map((l) => <option key={l.id} value={l.id}>{nameOf(db.brands, l.brandId)} · {l.code}</option>)}
              </select>
            </div>
            <div className="field"><label>Description</label><input placeholder="One-time signage charge" value={aDesc} onChange={(e) => setADesc(e.target.value)} /></div>
          </div>
          <div className="grp2">
            <div className="field"><label>Amount (₹)</label><input type="number" value={aAmt} onChange={(e) => setAAmt(e.target.value)} /></div>
            <div className="field"><label>GST %</label><input type="number" value={aGst} onChange={(e) => setAGst(e.target.value)} /></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ViewInvoiceModal({ id, db, onClose }) {
  const i = findById(db.invoices, id);
  if (!i) return null;
  const brand = findById(db.brands, i.brandId);
  const unit = findById(db.units, i.unitId);
  const company = brand ? findById(db.companies, brand.companyId) : null;
  return (
    <Modal title={`Tax invoice ${i.no}`} onClose={onClose} wide
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div className="inv">
        <div className="top">
          <div><h4>TAX INVOICE</h4><div className="sub">{i.no} · {i.type}</div></div>
          <div style={{ textAlign: 'right' }}><div className="sub">IRN {i.irn}</div></div>
        </div>
        <div className="meta">
          <div><div className="b">Billed to</div><div className="strong">{brand?.name}</div><div className="sub">{company?.name}</div><div className="sub">{brand?.regularAddress}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div className="b">Asset / Unit</div><div>{nameOf(db.assets, unit?.assetId)}</div>
            <div className="sub">{unit?.name} · {ymLabel(i.ym)}</div>
            <div className="b" style={{ marginTop: 6 }}>Due</div><div>{fmtDate(i.dueDate)}</div>
          </div>
        </div>
        <table className="line"><thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody><tr><td>{i.desc || i.type}</td><td className="num">{money(i.amount)}</td></tr></tbody>
        </table>
        <div className="tot">
          <div className="sub">Status: <StatusPill st={i.status} overdue={i.dueDate < curYM() + '-01'} /></div>
          <table className="ledger" style={{ width: 260 }}>
            <tbody>
              <tr><td>Taxable value</td><td className="r">{money(i.amount)}</td></tr>
              <tr><td>GST ({i.gstPct}%)</td><td className="r">{money(i.gstAmt)}</td></tr>
              <tr className="tot"><td>Total</td><td className="r">{money(i.total)}</td></tr>
              <tr><td>Paid</td><td className="r">{money(i.paid || 0)}</td></tr>
              <tr><td>Balance</td><td className="r">{money(i.balance ?? (i.total - (i.paid || 0)))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== COLLECTIONS ===================== */
function CollectionsPage({ db, search, setSearch, setModal }) {
  const rows = db.collections.filter((c) => {
    const inv = findById(db.invoices, c.invoiceId);
    return !search || [c.no, inv?.no, c.ref].join(' ').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <div className="toolbar"><SearchBox placeholder="Search collections…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.collections.length === 0 ? <EmptyState thing="collection" onAdd={() => setModal({ type: 'collection' })} /> : (
          <table>
            <thead><tr><th>Receipt</th><th>Invoice</th><th>Date</th><th className="num">Amount</th><th className="num">TDS</th><th>Instrument</th><th>Ref</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const inv = findById(db.invoices, c.invoiceId);
                return (
                  <tr key={c.id}>
                    <td><span className="code">{c.no}</span></td>
                    <td><span className="code">{inv?.no}</span><div className="sub">{nameOf(db.brands, inv?.brandId)}</div></td>
                    <td className="sub">{fmtDate(c.date)}</td>
                    <td className="num strong">{money0(c.amount)}</td>
                    <td className="num sub">{money0(c.tds)}</td>
                    <td><Pill color="grey">{c.instrument}</Pill></td>
                    <td className="sub">{c.ref || '—'}</td>
                    <td className="rowact"><button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteCollection', id: c.id })}><DelIcon /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CollectionFormModal({ invoiceId, db, onClose, refresh, notify }) {
  const unpaid = db.invoices.filter((i) => i.status !== 'Paid');
  if (!unpaid.length) { notify('No unpaid invoices to collect against.', true); onClose(); return null; }
  const [invId, setInvId] = useState(invoiceId || unpaid[0].id);
  const inv = findById(db.invoices, invId);
  const bal = inv ? inv.balance ?? (inv.total - (inv.paid || 0)) : 0;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(bal.toFixed(2));
  const [tdsPct, setTdsPct] = useState('0');
  const [mode, setMode] = useState('NEFT');
  const [ref, setRef] = useState('');

  useEffect(() => {
    const i = findById(db.invoices, invId);
    if (i) setAmount((i.balance ?? (i.total - (i.paid || 0))).toFixed(2));
  }, [invId]); // eslint-disable-line

  const save = async () => {
    if (!amount || +amount <= 0) return notify('Enter a positive amount.', true);
    try {
      await api.collections.create({ invoiceId: invId, date, amount: +amount, tdsPct: +tdsPct, instrument: mode, ref: ref.trim() });
      await refresh(['collections', 'invoices']);
      notify('Collection captured.');
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title="Capture collection" onClose={onClose} onSave={save}>
      <div className="grp2">
        <div className="field"><label>Invoice <span className="req">*</span></label>
          <select value={invId} disabled={!!invoiceId} onChange={(e) => setInvId(e.target.value)}>
            {unpaid.map((i) => <option key={i.id} value={i.id}>{i.no} · {nameOf(db.brands, i.brandId)} · {money0(i.balance ?? (i.total - (i.paid || 0)))}</option>)}
          </select>
        </div>
        <div className="field"><label>Date <span className="req">*</span></label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="grp2">
        <div className="field"><label>Amount received (₹) <span className="req">*</span></label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <div className="grp2">
        <div className="field"><label>TDS deducted</label>
          <select value={tdsPct} onChange={(e) => setTdsPct(e.target.value)}>
            <option value="0">0% — None</option><option value="2">2% — Rent u/s 194I</option>
            <option value="10">10% — Professional</option><option value="31.2">31.2% — Foreign (30%+4% cess)</option>
          </select>
        </div>
        <div className="field"><label>Instrument</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Card'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Reference (UTR / cheque no.)</label><input placeholder="UTR / cheque no." value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      <Callout>Outstanding on invoice: <b>{money(bal)}</b></Callout>
    </Modal>
  );
}

/* ===================== INVESTOR UNITS (maker-checker) ===================== */
function InvestorsPage({ db, search, setSearch, setModal, actingRole, refresh, notify }) {
  const rows = db.investorUnits.filter((iv) => !search || [iv.code, nameOf(db.units, iv.unitId), iv.investors.map((x) => x.name).join(' ')].join(' ').toLowerCase().includes(search.toLowerCase()));
  const approve = async (id) => {
    try { await api.investorUnits.approve(id, actingRole); await refresh(['investorUnits']); notify('Investor unit approved.'); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
      {!canApprove(actingRole) && (
        <Callout warn>You're acting as <b>{actingRole}</b> (maker). New/edited investor units need approval by a Finance or Portfolio Head. Switch role at the bottom-left to approve.</Callout>
      )}
      <div className="toolbar" style={{ marginTop: 14 }}><SearchBox placeholder="Search investor units…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.investorUnits.length === 0 ? <EmptyState thing="investor unit" onAdd={() => setModal({ type: 'investor' })} /> : (
          <table>
            <thead><tr><th>Ref</th><th>Unit</th><th>Investors</th><th className="num">Ownership</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((iv) => {
                const u = findById(db.units, iv.unitId);
                return (
                  <tr key={iv.id}>
                    <td><span className="code">{iv.code}</span></td>
                    <td><span className="strong">{u?.name || '—'}</span><div className="sub">{nameOf(db.assets, u?.assetId)} · Fl {iv.floor ?? 0}</div></td>
                    <td>{iv.investors.map((x, i) => (
                      <div key={i}>{x.name} {x.nri && <Pill color="blue">NRI</Pill>} {!x.gst && <Pill color="amber">No GST</Pill>}</div>
                    ))}</td>
                    <td className="num">{iv.investors.map((x) => `${x.disbursePct}%`).join(' / ')}</td>
                    <td>{iv.status === 'Approved' ? <Pill color="green">Approved</Pill> : <Pill color="amber">Pending</Pill>}</td>
                    <td className="rowact">
                      {iv.status === 'Pending' && canApprove(actingRole) && <button className="btn btn-teal btn-sm" onClick={() => approve(iv.id)}>Approve</button>}
                      <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'investor', id: iv.id })}><EditIcon /></button>
                      <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteInvestor', id: iv.id })}><DelIcon /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function emptyInvestorRow() { return { name: '', areaPct: 0, disbursePct: 0, start: new Date().toISOString().slice(0, 10), gst: true, nri: false, bankName: '', acc: '', ifsc: '' }; }

function InvestorFormModal({ id, db, actingRole, onClose, refresh, notify }) {
  const existing = id ? findById(db.investorUnits, id) : null;
  if (!db.units.length) { notify('Create a unit first.', true); onClose(); return null; }
  const [unitId, setUnitId] = useState(existing ? existing.unitId : db.units[0].id);
  const [floor, setFloor] = useState(existing ? existing.floor : findById(db.units, db.units[0].id)?.floor || 0);
  const [rows, setRows] = useState(existing ? JSON.parse(JSON.stringify(existing.investors)) : [emptyInvestorRow()]);

  const totalDisb = rows.reduce((s, x) => s + (+x.disbursePct || 0), 0);
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyInvestorRow()]);
  const rmRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const save = async () => {
    if (rows.some((x) => !x.name)) return notify('Every investor needs a name.', true);
    if (Math.abs(totalDisb - 100) > 0.5) return notify('Disbursement % across investors must total 100%.', true);
    try {
      if (id) await api.investorUnits.update(id, { floor: +floor, investors: rows, actingRole });
      else await api.investorUnits.create({ unitId, floor: +floor, investors: rows, actingRole });
      await refresh(['investorUnits']);
      notify(id ? 'Updated — sent for approval.' : 'Defined — sent for approval.');
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title={id ? 'Update investor unit' : 'Define investor unit'} onClose={onClose} onSave={save} wide>
      <div className="grp2">
        <div className="field"><label>Unit <span className="req">*</span></label>
          <select value={unitId} disabled={!!id} onChange={(e) => setUnitId(e.target.value)}>
            {db.units.map((u) => <option key={u.id} value={u.id}>{u.name} · {nameOf(db.assets, u.assetId)}</option>)}
          </select>
        </div>
        <div className="field"><label>Floor</label><input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
      </div>
      <div className="sectlabel">Investors &amp; ownership <button className="miniadd" onClick={addRow}>+ Add investor</button></div>
      {rows.map((x, i) => (
        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 11, marginBottom: 10, background: '#FBFCFE' }}>
          <div className="grp2">
            <div className="field" style={{ marginBottom: 9 }}><label>Investor name <span className="req">*</span></label><input value={x.name} placeholder="Coastline Holdings" onChange={(e) => setRow(i, 'name', e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 9 }}><label>Ownership start</label><input type="date" value={x.start} onChange={(e) => setRow(i, 'start', e.target.value)} /></div>
          </div>
          <div className="grp2">
            <div className="field" style={{ marginBottom: 9 }}><label>Area ownership %</label><input type="number" value={x.areaPct} onChange={(e) => setRow(i, 'areaPct', +e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 9 }}><label>Rent disbursement %</label><input type="number" value={x.disbursePct} onChange={(e) => setRow(i, 'disbursePct', +e.target.value)} /></div>
          </div>
          <div className="grp3">
            <div className="field" style={{ marginBottom: 9 }}><label>Bank</label><input value={x.bankName} placeholder="Axis Bank" onChange={(e) => setRow(i, 'bankName', e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 9 }}><label>Account</label><input value={x.acc} placeholder="A/c no" onChange={(e) => setRow(i, 'acc', e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 9 }}><label>IFSC</label><input value={x.ifsc} placeholder="UTIB0001234" onChange={(e) => setRow(i, 'ifsc', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 2 }}>
            <label className="chk" style={{ flex: 1 }}><input type="checkbox" checked={x.gst} onChange={(e) => setRow(i, 'gst', e.target.checked)} /> GST registered</label>
            <label className="chk" style={{ flex: 1 }}><input type="checkbox" checked={x.nri} onChange={(e) => setRow(i, 'nri', e.target.checked)} /> NRI investor</label>
            {rows.length > 1 && <button className="iconbtn danger" onClick={() => rmRow(i)}><DelIcon /></button>}
          </div>
        </div>
      ))}
      <Callout>Total disbursement share: <b style={{ color: Math.abs(totalDisb - 100) < 0.5 ? 'var(--green)' : 'var(--red)' }}>{totalDisb}%</b> {Math.abs(totalDisb - 100) < 0.5 ? '✓' : '(must equal 100%)'}</Callout>
    </Modal>
  );
}

/* ===================== DISBURSEMENT ===================== */
function DisbursementPage({ db, filterVal, setFilterVal, setModal, notify, actingRole, refresh }) {
  const ym = filterVal || addMonths(curYM(), -1);
  const [cands, setCands] = useState({ pending: [], done: [] });
  const [loadingCands, setLoadingCands] = useState(true);

  useEffect(() => {
    if (!filterVal) setFilterVal(ym); // eslint-disable-line
  }, []); // eslint-disable-line

  const load = useCallback(async () => {
    setLoadingCands(true);
    try { setCands(await api.disbursement.candidates(ym)); }
    catch (e) { notify(e.message, true); }
    setLoadingCands(false);
  }, [ym]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const exportNEFT = () => {
    const list = cands.done.filter((d) => d.status === 'Processed');
    if (!list.length) return notify('No processed disbursals for ' + ymLabel(ym), true);
    const rows = [['Beneficiary', 'Account', 'IFSC', 'Amount', 'Mode', 'Ref', 'Narration']];
    list.forEach((d) => rows.push([d.investorName, d.acc, d.ifsc, d.netPayable, d.mode, d.ref, d.no + ' ' + ymLabel(ym)]));
    download(`neft_${ym}.csv`, toCSV(rows));
    notify('Exported NEFT file.');
  };
  const exportNRI = () => {
    const list = cands.done.filter((d) => d.status === 'Processed' && d.nri);
    if (!list.length) return notify('No NRI disbursals for ' + ymLabel(ym), true);
    const rows = [['Investor', 'Account', 'IFSC', 'GrossRent', 'TDS%', 'TDS', 'NetRemittance', 'Form']];
    list.forEach((d) => rows.push([d.investorName, d.acc, d.ifsc, d.rentGross, d.tdsPct, d.tdsAmt, d.netPayable, '15CB/15CA']));
    download(`nri_15cb_${ym}.csv`, toCSV(rows));
    notify('Exported NRI file.');
  };

  return (
    <>
      <div className="toolbar">
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, color: 'var(--ink)' }}>Payment month</div>
        <input type="month" className="filt" value={ym} onChange={(e) => setFilterVal(e.target.value)} />
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-ghost btn-sm" onClick={exportNEFT}>Export NEFT format</button>
        <button className="btn btn-ghost btn-sm" onClick={exportNRI}>NRI 15CB data</button>
      </div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="ph"><h3>Pending disbursement — {ymLabel(ym)}</h3><span className="hint">rent collected, not yet disbursed</span></div>
        <div className="pb">
          <table>
            <thead><tr><th>Investor / Unit</th><th className="num">Rent share</th><th>TDS</th><th>Readiness</th><th></th></tr></thead>
            <tbody>
              {loadingCands ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Loading…</td></tr> :
                cands.pending.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 26 }}>No pending disbursals for {ymLabel(ym)}. Rent must be collected first.</td></tr> :
                cands.pending.map((c, i) => (
                  <tr key={i}>
                    <td><span className="strong">{c.investorName}</span><div className="sub">{c.unitName} · {c.disbursePct}% · {c.investorUnitCode}</div></td>
                    <td className="num">{money0(c.rentShare)}</td>
                    <td>{c.nri ? <Pill color="blue">NRI 31.2%</Pill> : <Pill color="grey">2%</Pill>}</td>
                    <td>{c.holdReason ? <Pill color="amber">On hold</Pill> : <Pill color="teal">Ready</Pill>}</td>
                    <td className="rowact">
                      {c.holdReason
                        ? <button className="btn btn-ghost btn-sm" title={c.holdReason} disabled style={{ opacity: .5 }}>Blocked</button>
                        : <button className="btn btn-teal btn-sm" onClick={() => setModal({ type: 'disburse', candidate: c, ym })}>Process</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="ph"><h3>Processed disbursements — {ymLabel(ym)}</h3></div>
        <div className="pb">
          <table>
            <thead><tr><th>Voucher</th><th className="num">Rent</th><th className="num">Deductions</th><th className="num">TDS</th><th className="num">Net paid</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {cands.done.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 22 }}>No disbursals processed for {ymLabel(ym)}.</td></tr> :
                cands.done.map((d) => (
                  <tr key={d.id}>
                    <td><span className="code">{d.no}</span><div className="sub">{d.investorName}</div></td>
                    <td className="num">{money0(d.rentGross)}</td>
                    <td className="num sub">{money0(d.totalDeductions)}</td>
                    <td className="num sub">{money0(d.tdsAmt)}</td>
                    <td className="num strong">{money0(d.netPayable)}</td>
                    <td><DisbStatusPill st={d.status} /></td>
                    <td className="rowact">
                      {d.status === 'Pending' && canApprove(actingRole) && <button className="btn btn-teal btn-sm" onClick={async () => { try { await api.disbursement.approve(d.id, actingRole); load(); await refresh(['disbursals']); notify('Disbursal approved.'); } catch (e) { notify(e.message, true); } }}>Approve</button>}
                      <button className="iconbtn" title="Voucher" onClick={() => setModal({ type: 'viewDisb', disb: d })}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2h16v20l-3-2-3 2-2-2-2 2-3-2-3 2zM8 8h8M8 12h5" /></svg>
                      </button>
                      {d.status !== 'Void' && <button className="iconbtn danger" title="Void" onClick={() => setModal({ type: 'voidDisb', id: d.id })}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                      </button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DisburseFormModal({ candidate: c, ym, actingRole, onClose, refresh, notify }) {
  const [rent, setRent] = useState(Math.round(c.rentShare));
  const [brok, setBrok] = useState(0);
  const [mgmt, setMgmt] = useState(Math.round(c.rentShare * 0.02));
  const [fit, setFit] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [cam, setCam] = useState(0);
  const [other, setOther] = useState(0);
  const [narr, setNarr] = useState('');
  const [tdsPct, setTdsPct] = useState(c.nri ? 31.2 : 2);
  const [recoverOut, setRecoverOut] = useState(false);
  const [outAmt, setOutAmt] = useState(0);
  const [mode, setMode] = useState('NEFT');
  const [ref, setRef] = useState('');
  const [remarks, setRemarks] = useState('');

  const dedTotal = (+brok || 0) + (+mgmt || 0) + (+fit || 0) + (+stamp || 0) + (+cam || 0) + (+other || 0);
  const tds = Math.round((+rent || 0) * (+tdsPct || 0)) / 100;
  const out = recoverOut ? (+outAmt || 0) : 0;
  const net = Math.round(((+rent || 0) - dedTotal - tds - out) * 100) / 100;

  const save = async () => {
    if (net < 0) return notify('Net payable is negative — check deductions.', true);
    try {
      await api.disbursement.process({
        investorUnitId: c.investorUnitId, invIdx: c.invIdx, month: ym, rentGross: +rent,
        deductions: { brokerage: +brok, mgmtFee: +mgmt, fitout: +fit, stampDuty: +stamp, camVacant: +cam, other: +other },
        tdsPct: +tdsPct, outstanding: out, mode, ref, narration: narr, remarks, actingRole
      });
      await refresh(['disbursals']);
      notify(canApprove(actingRole) ? `Disbursed ${money0(net)} to ${c.investorName}.` : 'Disbursal created — awaiting approval.');
      onClose();
    } catch (e) { notify(e.message, true); }
  };

  return (
    <Modal title={`Disburse — ${c.investorName}`} onClose={onClose} onSave={save} wide>
      <Callout>{c.unitName} · {ymLabel(ym)} · share {c.disbursePct}%</Callout>
      <div className="sectlabel">Rent (net of GST)</div>
      <div className="field"><label>Rent collected &amp; attributable</label><input type="number" value={rent} onChange={(e) => setRent(e.target.value)} /></div>
      <div className="sectlabel">Collections to deduct (GST invoices raised to investor)</div>
      <div className="grp3">
        <div className="field"><label>Brokerage</label><input type="number" value={brok} onChange={(e) => setBrok(e.target.value)} /></div>
        <div className="field"><label>Mgmt fee</label><input type="number" value={mgmt} onChange={(e) => setMgmt(e.target.value)} /></div>
        <div className="field"><label>Fitout recovery</label><input type="number" value={fit} onChange={(e) => setFit(e.target.value)} /></div>
      </div>
      <div className="grp3">
        <div className="field"><label>Stamp duty (no GST)</label><input type="number" value={stamp} onChange={(e) => setStamp(e.target.value)} /></div>
        <div className="field"><label>CAM (vacant share)</label><input type="number" value={cam} onChange={(e) => setCam(e.target.value)} /></div>
        <div className="field"><label>Other</label><input type="number" value={other} onChange={(e) => setOther(e.target.value)} /></div>
      </div>
      <div className="field"><label>Other charge narration</label><input placeholder="Narration for 'Other' (if any)" value={narr} onChange={(e) => setNarr(e.target.value)} /></div>
      <div className="sectlabel">TDS &amp; recovery</div>
      <div className="grp2">
        <div className="field"><label>TDS</label>
          <select value={tdsPct} onChange={(e) => setTdsPct(e.target.value)}>
            <option value="0">0%</option><option value="2">2%</option><option value="10">10%</option><option value="31.2">31.2% Foreign (30%+4% cess)</option>
          </select>
        </div>
        <div className="field"><label>Outstanding to recover (₹)</label><input type="number" value={outAmt} onChange={(e) => setOutAmt(e.target.value)} /></div>
      </div>
      <label className="chk" style={{ marginBottom: 10 }}><input type="checkbox" checked={recoverOut} onChange={(e) => setRecoverOut(e.target.checked)} /> Process with outstanding recovery (deduct above)</label>
      <div className="sectlabel">Payment</div>
      <div className="grp2">
        <div className="field"><label>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>{['NEFT', 'Cheque'].map((m) => <option key={m}>{m}</option>)}</select>
        </div>
        <div className="field"><label>{mode === 'Cheque' ? 'Cheque no. & bank' : 'UTR no.'}</label><input placeholder={mode === 'Cheque' ? 'Cheque no / bank' : 'UTR / bank ref'} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      </div>
      <div className="field"><label>Remarks</label><input placeholder="Optional remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      <div className="callout" style={{ background: '#F3F5F8', borderColor: 'var(--line)', color: 'var(--text)' }}>
        <div style={{ width: '100%' }}>
          <table className="ledger">
            <tbody>
              <tr><td>Rent (net GST)</td><td className="r">{money(rent)}</td></tr>
              <tr><td>Less deductions</td><td className="r">−{money(dedTotal)}</td></tr>
              <tr><td>Less TDS</td><td className="r">−{money(tds)}</td></tr>
              <tr><td>Less outstanding</td><td className="r">−{money(out)}</td></tr>
              <tr className="tot"><td>Net payable</td><td className="r">{money(net)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function VoidDisbModal({ id, onClose, refresh, notify }) {
  const [reason, setReason] = useState('');
  const save = async () => {
    if (!reason.trim()) return notify('Reason is required.', true);
    try { await api.disbursement.void(id, reason); await refresh(['disbursals']); notify('Disbursal voided.'); onClose(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <Modal title="Void / reject disbursal" onClose={onClose} onSave={save}>
      <div className="field"><label>Reason <span className="req">*</span></label><textarea placeholder="Reason for void/reject" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  );
}

function ViewDisbModal({ disb: d, db, onClose }) {
  const u = findById(db.units, d.unitId);
  return (
    <Modal title={`Voucher ${d.no}`} onClose={onClose} wide
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div className="inv">
        <div className="top"><div><h4>DISBURSEMENT VOUCHER</h4><div className="sub">{d.no} · {ymLabel(d.month)}</div></div><div style={{ textAlign: 'right' }}><DisbStatusPill st={d.status} /></div></div>
        <div className="meta">
          <div><div className="b">Investor</div><div className="strong">{d.investorName} {d.nri ? '(NRI)' : ''}</div>
            <div className="sub">{u?.name} · {nameOf(db.assets, u?.assetId)}</div><div className="sub">{d.bank} {d.acc} {d.ifsc}</div></div>
          <div style={{ textAlign: 'right' }}><div className="b">Payment</div><div>{d.mode} {d.ref}</div><div className="sub">Maker {d.maker}{d.checker ? ' · Checker ' + d.checker : ''}</div></div>
        </div>
        <table className="ledger">
          <tbody>
            <tr><td>Rent (net of GST)</td><td className="r">{money(d.rentGross)}</td></tr>
            {Object.entries(d.deductions || {}).filter(([, v]) => v > 0).map(([k, v]) => (
              <tr key={k}><td>Less: {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</td><td className="r">−{money(v)}</td></tr>
            ))}
            <tr><td>Less: TDS ({d.tdsPct}%)</td><td className="r">−{money(d.tdsAmt)}</td></tr>
            {d.outstanding > 0 && <tr><td>Less: Outstanding recovered</td><td className="r">−{money(d.outstanding)}</td></tr>}
            <tr className="tot"><td>Net paid to investor</td><td className="r">{money(d.netPayable)}</td></tr>
          </tbody>
        </table>
        {d.narration && <div className="sub" style={{ marginTop: 8 }}>Narration: {d.narration}</div>}
        {d.remarks && <div className="sub">Remarks: {d.remarks}</div>}
      </div>
    </Modal>
  );
}

/* ===================== REPORTS ===================== */
function ReportsPage({ db, notify }) {
  const [summary, setSummary] = useState(null);
  const [sapRows, setSapRows] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, sap] = await Promise.all([api.reports.summary(), api.reports.sapEntries()]);
        setSummary(s); setSapRows(sap);
      } catch (e) { notify(e.message, true); }
    })();
  }, []); // eslint-disable-line

  const holdLeases = db.leases.filter((l) => l.onHold);
  const deductionsInvoiced = db.disbursals.filter((d) => d.status !== 'Void' && d.totalDeductions > 0);
  const recentDisb = [...db.disbursals].filter((d) => d.status !== 'Void').sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 10);

  const exportDisb = () => {
    const rows = [['Voucher', 'Month', 'Investor', 'Unit', 'Rent', 'Deductions', 'TDS%', 'TDS', 'Outstanding', 'Net', 'Mode', 'Ref', 'Status']];
    db.disbursals.forEach((d) => rows.push([d.no, d.month, d.investorName, nameOf(db.units, d.unitId), d.rentGross, d.totalDeductions, d.tdsPct, d.tdsAmt, d.outstanding, d.netPayable, d.mode, d.ref, d.status]));
    download('disbursement_report.csv', toCSV(rows));
    notify('Exported disbursement_report.csv');
  };
  const exportSAP = () => {
    const rows = [['GL Account', 'Document', 'Type', 'Amount']];
    sapRows.forEach((r) => rows.push([r.gl, r.doc, r.type, r.amount]));
    download('sap_entry_book.csv', toCSV(rows));
    notify('Exported sap_entry_book.csv');
  };

  if (!summary) return <div className="empty"><p>Loading reports…</p></div>;

  return (
    <>
      <div className="kpis">
        <div className="kpi on"><div className="lab">Disbursed (net)</div><div className="val m">{money0(summary.totalNet)}</div><div className="sub">{summary.voucherCount} vouchers</div></div>
        <div className="kpi"><div className="lab">TDS deducted</div><div className="val m">{money0(summary.totalTds)}</div><div className="sub">for Form 26Q / 27Q</div></div>
        <div className="kpi"><div className="lab">Leases on hold</div><div className="val">{summary.holdLeases}</div><div className="sub">rent withheld</div></div>
        <div className="kpi"><div className="lab">Security deposit held</div><div className="val m">{money0(summary.securityDeposit)}</div><div className="sub">refund liability</div></div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="ph"><h3>Monthly disbursement report</h3><button className="btn btn-ghost btn-sm" onClick={exportDisb}>Export CSV</button></div>
          <div className="pb">
            {recentDisb.length === 0 ? <EmptyMini text="No disbursals yet." /> : (
              <table><thead><tr><th>Voucher</th><th>Month</th><th>Investor</th><th className="num">Net</th><th>Status</th></tr></thead>
                <tbody>{recentDisb.map((d) => (
                  <tr key={d.id}><td><span className="code">{d.no}</span></td><td className="sub">{ymLabel(d.month)}</td><td>{d.investorName}</td><td className="num strong">{money0(d.netPayable)}</td><td><DisbStatusPill st={d.status} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="ph"><h3>Hold rent report</h3></div>
            <div className="pb">
              {holdLeases.length === 0 ? <EmptyMini text="No leases on hold." /> : (
                <table><tbody>{holdLeases.map((l) => (
                  <tr key={l.id}><td><span className="strong">{nameOf(db.brands, l.brandId)}</span><div className="sub">{nameOf(db.units, l.unitId)}</div></td><td className="sub">{l.holdRemarks}</td></tr>
                ))}</tbody></table>
              )}
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="ph"><h3>Deductions invoiced (RCC / fitout / stamp / brokerage)</h3></div>
            <div className="pb">
              {deductionsInvoiced.length === 0 ? <EmptyMini text="No deductions invoiced yet." /> : (
                <table><thead><tr><th>Voucher</th><th className="num">Brokerage</th><th className="num">Fitout</th><th className="num">Stamp</th><th className="num">Mgmt</th></tr></thead>
                  <tbody>{deductionsInvoiced.slice(0, 8).map((d) => (
                    <tr key={d.id}><td><span className="code">{d.no}</span></td><td className="num">{money0(d.deductions.brokerage)}</td><td className="num">{money0(d.deductions.fitout)}</td><td className="num">{money0(d.deductions.stampDuty)}</td><td className="num">{money0(d.deductions.mgmtFee)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="ph"><h3>SAP entry book</h3><button className="btn btn-ghost btn-sm" onClick={exportSAP}>Export GL CSV</button></div>
            <div className="pb">
              {sapRows.length === 0 ? <EmptyMini text="No postings to push yet." /> : (
                <table><thead><tr><th>GL</th><th>Doc</th><th>Type</th><th className="num">Amount</th></tr></thead>
                  <tbody>{sapRows.slice(0, 7).map((r, i) => (
                    <tr key={i}><td><span className="code">{r.gl}</span></td><td><span className="code">{r.doc}</span></td><td className="sub">{r.type}</td><td className="num">{money0(r.amount)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
