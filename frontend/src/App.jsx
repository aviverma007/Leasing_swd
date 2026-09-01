import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, setToken, getToken, setAuthExpiredHandler } from './api.js';
import Login from './Login.jsx';
import { Modal, ConfirmModal, Toast, Callout, Pill, EmptyState } from './components.jsx';
import {
  money, money0, fmtDate, ymLabel, curYM, addMonths, nameOf, findById, toCSV, download,
  CATEGORIES, ROLES, MASTER_SCHEMA, RENTAL_TYPES, RENTAL_HINT, NAV, PAGES
} from './helpers.js';
import { canView, canEdit, canApproveRole } from './permissions.js';

const EMPTY_DB = {
  companies: [], assets: [], blocks: [], units: [], brands: [], users: [],
  leases: [], sales: [], invoices: [], collections: [], investorUnits: [], disbursals: []
};

export default function App() {
  const [authUser, setAuthUser] = useState(null); // null = not logged in
  const [db, setDb] = useState(EMPTY_DB);
  const [pendingDel, setPendingDel] = useState({}); // entity -> [recordIds] with pending deletion
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [currentProject, setCurrentProject] = useState('all'); // asset id or 'all'
  const [search, setSearch] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [actingRole, setActingRole] = useState('Finance Head');
  const roleRef = useRef(actingRole);
  useEffect(() => { roleRef.current = actingRole; }, [actingRole]);
  const [modal, setModal] = useState(null); // {type, id, ...}
  const [toast, setToast] = useState(null);
  const [railOpen, setRailOpen] = useState(false);

  const notify = useCallback((msg, err) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const refresh = useCallback(async (keys) => {
    const all = ['companies', 'assets', 'blocks', 'units', 'brands', 'users', 'leases', 'sales', 'invoices', 'collections', 'investorUnits', 'disbursals'];
    // module key in the permissions matrix for each db key
    const moduleOf = { investorUnits: 'investors', disbursals: 'disbursement' };
    const role = roleRef.current;
    let target = keys || all;
    // Only fetch what this role may view (avoids 403s that would otherwise leave tables empty)
    if (role) target = target.filter((k) => canView(role, moduleOf[k] || k));
    const fetchers = {
      companies: api.companies.list, assets: api.assets.list, blocks: api.blocks.list, units: api.units.list,
      brands: api.brands.list, users: api.users.list, leases: api.leases.list, sales: api.sales.list,
      invoices: api.invoices.list, collections: api.collections.list, investorUnits: api.investorUnits.list,
      disbursals: api.disbursement.list
    };
    try {
      const results = await Promise.allSettled(target.map((k) => fetchers[k]()));
      setDb((prev) => {
        const next = { ...prev };
        target.forEach((k, i) => {
          if (results[i].status === 'fulfilled') next[k] = results[i].value;
          else next[k] = prev[k] && prev[k].length ? prev[k] : []; // forbidden/failed -> keep empty, don't blank others
        });
        return next;
      });
      try { setPendingDel(await api.deletionRequests.pendingMap()); } catch (e) { /* non-fatal */ }
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
  }, [refresh, authUser, actingRole]);

  useEffect(() => { setSearch(''); setFilterVal(''); setRailOpen(false); }, [view]);

  // If the current role can't view the active tab, fall back to dashboard
  useEffect(() => {
    if (authUser && !canView(actingRole, view)) setView('dashboard');
  }, [actingRole, view, authUser]);

  const onLogin = (user) => {
    setAuthUser(user);
    // Admin operates as the 'Admin' role in the access matrix; others use their profile role
    setActingRole(user.isAdmin ? 'Admin' : (user.role || 'Manager'));
  };
  const onLogout = () => {
    setToken(null);
    setAuthUser(null);
    setDb(EMPTY_DB);
    setView('dashboard');
  };

  useEffect(() => {
    setAuthExpiredHandler(() => {
      setToken(null);
      setAuthUser(null);
      setDb(EMPTY_DB);
      setView('dashboard');
    });
  }, []);

  // On first load, if a token was saved (e.g. after a refresh), validate it and restore the session
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    (async () => {
      if (getToken() && !authUser) {
        try {
          const { user } = await api.auth.me();
          setAuthUser(user);
          setActingRole(user.isAdmin ? 'Admin' : (user.role || 'Manager'));
        } catch (e) {
          setToken(null); // token invalid/expired — force fresh login
        }
      }
      setRestoring(false);
    })();
  }, []); // eslint-disable-line

  if (restoring) return <div className="login-wrap"><div style={{ color: '#fff' }}>Loading…</div></div>;
  if (!authUser) return <Login onLogin={onLogin} />;

  const page = PAGES[view];
  const pendingDelCount = Object.values(pendingDel || {}).reduce((s, arr) => s + (arr ? arr.length : 0), 0);

  // Scope data to the selected project (asset). Brands can span projects, so keep all.
  const scopedDb = (() => {
    if (currentProject === 'all') return db;
    const p = currentProject;
    const unitIds = new Set((db.units || []).filter((u) => u.assetId === p).map((u) => u.id));
    const leaseIds = new Set((db.leases || []).filter((l) => l.assetId === p || unitIds.has(l.unitId)).map((l) => l.id));
    const invIds = new Set((db.invoices || []).filter((i) => unitIds.has(i.unitId) || leaseIds.has(i.leaseId)).map((i) => i.id));
    return {
      ...db,
      assets: (db.assets || []).filter((a) => a.id === p),
      blocks: (db.blocks || []).filter((b) => b.assetId === p),
      units: (db.units || []).filter((u) => u.assetId === p),
      leases: (db.leases || []).filter((l) => leaseIds.has(l.id)),
      invoices: (db.invoices || []).filter((i) => invIds.has(i.id)),
      collections: (db.collections || []).filter((c) => invIds.has(c.invoiceId)),
      investorUnits: (db.investorUnits || []).filter((iv) => unitIds.has(iv.unitId)),
      sales: (db.sales || []).filter((s) => leaseIds.has(s.leaseId))
    };
  })();

  return (
    <div className="app">
      <aside className={`rail${railOpen ? ' show' : ''}`}>
        <div className="brand"><img className="logo-img" src="/smartworld-icon.png" alt="Smart World" /><div><h1>SMART LEASING</h1><span>Smart World Developers</span></div></div>
        <nav className="nav">
          {NAV.filter((n) => !n.v || canView(actingRole, n.v)).map((n, i) => n.grp && !n.v ? <div className="grp" key={i}>{n.grp}</div> : (
            <a key={n.v} className={n.v === view ? 'active' : ''} onClick={() => setView(n.v)}>
              {n.label}
              {n.v === 'deletions'
                ? (pendingDelCount > 0 && <span className="cnt alert">{pendingDelCount}</span>)
                : (scopedDb[n.v] && <span className="cnt">{scopedDb[n.v].length}</span>)}
            </a>
          ))}
        </nav>
        <div className="userbox">
          {authUser.isAdmin ? (
            <>
              <label>Acting as</label>
              <select value={actingRole} onChange={(e) => { setActingRole(e.target.value); notify('Now acting as ' + e.target.value); }}>
                {['Admin', ...ROLES].map((r) => <option key={r}>{r}</option>)}
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
          {db.assets && db.assets.length > 1 && (
            <div className="proj-switch">
              <label>Project</label>
              <select value={currentProject} onChange={(e) => setCurrentProject(e.target.value)}>
                <option value="all">All projects</option>
                {db.assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <PageAction view={view} setModal={setModal} db={db} actingRole={actingRole} />
          <div className="topbar-user">
            <div className="who"><b>{authUser.email}</b>{authUser.isAdmin ? 'Admin' : authUser.role}</div>
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
          </div>
        </div>
        <div className="wrap">
          {loading ? <div className="empty"><p>Loading…</p></div> : (
            <ViewRouter view={view} db={scopedDb} search={search} setSearch={setSearch} filterVal={filterVal} setFilterVal={setFilterVal}
              actingRole={actingRole} setModal={setModal} refresh={refresh} notify={notify} canEditView={canEdit(actingRole, view)} pendingDel={pendingDel} />
          )}
        </div>
      </div>
      {modal && (
        <ModalRouter modal={modal} db={db} setModal={setModal} refresh={refresh} notify={notify} actingRole={actingRole} isAdmin={authUser.isAdmin} />
      )}
      <Toast toast={toast} />
    </div>
  );
}

function PageAction({ view, setModal, db, actingRole }) {
  // No create button unless the role can edit this module
  if (!canEdit(actingRole, view)) return null;
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
  if (view === 'inventory') return <InventoryPage {...props} />;
  if (view === 'leases') return <LeasesPage {...props} />;
  if (view === 'sales') return <SalesPage {...props} />;
  if (view === 'invoices') return <InvoicesPage {...props} />;
  if (view === 'collections') return <CollectionsPage {...props} />;
  if (view === 'collectionmaster') return <CollectionMasterPage {...props} />;
  if (view === 'investors') return <InvestorsPage {...props} />;
  if (view === 'investoraccounts') return <InvestorAccountsPage {...props} />;
  if (view === 'disbursement') return <DisbursementPage {...props} />;
  if (view === 'deletions') return <DeletionsPage {...props} />;
  if (view === 'reports') return <ReportsPage {...props} />;
  if (view === 'gstrecon') return <GstReconPage {...props} />;
  if (view === 'tdsrecon') return <TdsReconPage {...props} />;
  if (view === 'agreementrecon') return <AgreementReconPage {...props} />;
  if (view === 'sdrecon') return <SdReconPage {...props} />;
  return null;
}

/* ===================== MASTERS (generic CRUD) ===================== */
function MasterListPage({ entity, db, search, setSearch, setModal, refresh, notify, canEditView, pendingDel, openInventoryUnit }) {
  const sc = MASTER_SCHEMA[entity];
  const pendingIds = new Set((pendingDel && pendingDel[entity]) || []);
  const rows = (db[entity] || []).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

  const del = async (id) => {
    try { await api[entity].remove(id); await refresh([entity]); notify('Deleted.'); }
    catch (e) { notify(e.message, true); }
  };

  const renderRow = (r) => (
    <tr key={r.id}>
      {sc.cols(r, db).map((c, i) => <td key={i}>{i === 0 ? <span className="code">{c}</span> : c}</td>)}
      <td className="rowact">
        {pendingIds.has(r.id) ? <Pill color="amber">Deletion pending</Pill> : canEditView ? (
          <>
            {entity === 'users' && <button className="iconbtn" title="Reset password" onClick={() => setModal({ type: 'resetPassword', user: r })}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zm0 0L15 8m0 0l3 3m-3-3l2.5-2.5" /></svg>
            </button>}
            <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'master', entity, id: r.id })}><EditIcon /></button>
            <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteMaster', entity, id: r.id, name: r.name })}><DelIcon /></button>
          </>
        ) : <span className="sub">—</span>}
      </td>
    </tr>
  );

  const renderTable = (rowSet) => (
    <table>
      <thead><tr>{sc.head.map((h) => <th key={h}>{h}</th>)}<th></th></tr></thead>
      <tbody>
        {rowSet.length === 0 ? <tr><td colSpan={sc.head.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>No records match your search.</td></tr> :
          rowSet.map(renderRow)}
      </tbody>
    </table>
  );

  // Entities that are structured project-wise: grouped into a separate table per project.
  const PROJECT_GROUPED = ['blocks', 'units', 'brands'];
  const isGrouped = PROJECT_GROUPED.includes(entity);

  let groups = null;
  if (isGrouped) {
    const byProject = {}; // assetId -> rows
    const unassigned = [];
    if (entity === 'brands') {
      // a brand can span projects: place it under every project it has a lease in
      rows.forEach((r) => {
        const projIds = [...new Set((db.leases || [])
          .filter((l) => l.brandId === r.id)
          .map((l) => { const u = findById(db.units, l.unitId); return u?.assetId; })
          .filter(Boolean))];
        if (!projIds.length) unassigned.push(r);
        else projIds.forEach((pid) => { (byProject[pid] = byProject[pid] || []).push(r); });
      });
    } else {
      rows.forEach((r) => {
        const pid = r.assetId;
        if (!pid) unassigned.push(r);
        else (byProject[pid] = byProject[pid] || []).push(r);
      });
    }
    groups = (db.assets || [])
      .filter((a) => byProject[a.id] && byProject[a.id].length)
      .map((a) => ({ id: a.id, label: a.name, rows: byProject[a.id] }));
    if (unassigned.length) groups.push({ id: '__unassigned', label: 'Not yet assigned to a project', rows: unassigned });
  }

  return (
    <>
      {!canEditView && <Callout>You have view-only access to this section.</Callout>}
      <div className="toolbar" style={!canEditView ? { marginTop: 14 } : undefined}>
        <SearchBox placeholder={`Search ${sc.sing.toLowerCase()}…`} value={search} onChange={setSearch} />
      </div>
      {db[entity].length === 0 ? (
        <div className="tablewrap"><EmptyState thing={sc.sing} onAdd={canEditView ? () => setModal({ type: 'master', entity }) : null} /></div>
      ) : isGrouped ? (
        groups.length === 0 ? <div className="tablewrap"><EmptyMini text="No records match your search." /></div> :
          groups.map((g) => (
            <div className="proj-group" key={g.id}>
              <div className="proj-group-hd"><h3>{g.label}</h3><span className="chip">{g.rows.length}</span></div>
              <div className="tablewrap">{renderTable(g.rows)}</div>
            </div>
          ))
      ) : (
        <div className="tablewrap">{renderTable(rows)}</div>
      )}
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
    // Password is required when creating a user, optional (keep existing) when editing
    if (entity === 'users' && !id && !form.password) return notify('Password is required for a new user.', true);
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

function ResetPasswordModal({ user, onClose, refresh, notify }) {
  const [meta, setMeta] = useState(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setMeta(await api.userAdmin.meta(user.id)); } catch (e) { notify(e.message, true); }
    })();
  }, [user.id]); // eslint-disable-line

  const save = async () => {
    if (!pw || pw.length < 4) return notify('Enter a new password (at least 4 characters).', true);
    if (pw !== pw2) return notify("Passwords don't match.", true);
    setBusy(true);
    try {
      await api.userAdmin.resetPassword(user.id, pw);
      await refresh(['users']);
      notify('Password reset. The user can now sign in with the new password.');
      onClose();
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Reset password — ${user.email}`} onClose={onClose} onSave={save} saveLabel={busy ? 'Saving…' : 'Reset password'}>
      <Callout>For security, the current password can't be shown — it's stored one-way (encrypted). You can set a new one here; the user logs in with it going forward.</Callout>
      <div style={{ margin: '12px 0', fontSize: 12.5, color: 'var(--muted)' }}>
        <div>Role: <b style={{ color: 'var(--ink)' }}>{user.role}</b> · Status: <b style={{ color: 'var(--ink)' }}>{user.active}</b></div>
        <div>Password last changed: <b style={{ color: 'var(--ink)' }}>{meta?.pwdChangedAt ? new Date(meta.pwdChangedAt).toLocaleString('en-GB') : (meta ? 'never recorded' : '…')}</b></div>
        {meta && !meta.hashed && <div style={{ color: 'var(--amber)', marginTop: 4 }}>This account still uses a legacy password. Resetting it will secure (encrypt) it.</div>}
      </div>
      <div className="field"><label>New password <span className="req">*</span></label><input type="password" value={pw} placeholder="New password" onChange={(e) => setPw(e.target.value)} /></div>
      <div className="field"><label>Confirm new password <span className="req">*</span></label><input type="password" value={pw2} placeholder="Re-enter new password" onChange={(e) => setPw2(e.target.value)} /></div>
    </Modal>
  );
}

/* ===================== MODAL ROUTER ===================== */
function ModalRouter({ modal, db, setModal, refresh, notify, actingRole, isAdmin }) {
  const close = () => setModal(null);
  // Shared delete handler: shows "deleted" for admin, "request sent" for others.
  const doDelete = async (removeFn, refreshKeys) => {
    try {
      const res = await removeFn();
      await refresh(refreshKeys);
      if (res && res.pending) notify('Deletion request sent for admin approval.');
      else notify('Deleted.');
    } catch (e) { notify(e.message, true); }
    close();
  };
  const delNote = isAdmin ? '' : ' This will be sent to an admin for approval.';
  switch (modal.type) {
    case 'master':
      return <MasterFormModal entity={modal.entity} id={modal.id} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteMaster':
      return <ConfirmModal title={`Delete this ${MASTER_SCHEMA[modal.entity].sing.toLowerCase()}?`}
        message={`This will remove "${modal.name}" permanently.` + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api[modal.entity].remove(modal.id), [modal.entity])} />;
    case 'resetPassword':
      return <ResetPasswordModal user={modal.user} onClose={close} refresh={refresh} notify={notify} />;
    case 'lease':
      return <LeaseFormModal id={modal.id} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'holdLease':
      return <HoldLeaseModal id={modal.id} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteLease':
      return <ConfirmModal title="Delete this lease?" message={"Unpaid invoices for it will also be removed." + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api.leases.remove(modal.id), ['leases', 'invoices', 'units'])} />;
    case 'sales':
      return <SalesFormModal db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteSales':
      return <ConfirmModal title="Delete this sales entry?" message={"The linked rev-share invoice will be recalculated." + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api.sales.remove(modal.id), ['sales', 'invoices'])} />;
    case 'generate':
      return <GenerateInvoiceModal db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'viewInvoice':
      return <ViewInvoiceModal id={modal.id} db={db} onClose={close} setModal={setModal} />;
    case 'sdAdjust':
      return <SdAdjustModal id={modal.id} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteInvoice':
      return <ConfirmModal title="Delete this invoice?" message={"Any collections against it will also be removed." + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api.invoices.remove(modal.id), ['invoices', 'collections'])} />;
    case 'collection':
      return <CollectionFormModal invoiceId={modal.invoiceId} db={db} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteCollection':
      return <ConfirmModal title="Delete this collection?" message={"This receipt will be removed." + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api.collections.remove(modal.id), ['collections', 'invoices'])} />;
    case 'investor':
      return <InvestorFormModal id={modal.id} db={db} actingRole={actingRole} onClose={close} refresh={refresh} notify={notify} />;
    case 'confirmDeleteInvestor':
      return <ConfirmModal title="Delete this investor unit?" message={"This investor unit will be removed." + delNote} onClose={close} confirmLabel={isAdmin ? 'Delete' : 'Request deletion'}
        onConfirm={() => doDelete(() => api.investorUnits.remove(modal.id), ['investorUnits'])} />;
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
function InventoryPage({ db, search, setSearch }) {
  const [proj, setProj] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | leased | vacant | selfuse
  const [openUnit, setOpenUnit] = useState(null);
  // lease lookup: unitId -> active lease (for brand + status)
  const leaseByUnit = {};
  (db.leases || []).forEach((l) => { leaseByUnit[l.unitId] = l; });

  const assets = db.assets || [];
  const shownAssets = proj === 'all' ? assets : assets.filter((a) => a.id === proj);

  const statusOf = (u) => {
    if (leaseByUnit[u.id]) return 'leased';
    if ((u.availableFor || '').toLowerCase().includes('self')) return 'selfuse';
    return 'vacant';
  };

  const q = (search || '').toLowerCase();
  const unitMatches = (u) => {
    if (statusFilter !== 'all' && statusOf(u) !== statusFilter) return false;
    return !q || [u.name, u.owner, nameOf(db.brands, leaseByUnit[u.id]?.brandId)].join(' ').toLowerCase().includes(q);
  };

  // roll-up counts for an array of units (always over ALL statuses, for the KPI cards)
  const tally = (units) => {
    const t = { total: units.length, leased: 0, vacant: 0, selfuse: 0, area: 0 };
    units.forEach((u) => {
      const l = leaseByUnit[u.id];
      const sf = (u.availableFor || '').toLowerCase();
      if (l) t.leased++;
      else if (sf.includes('self')) t.selfuse++;
      else t.vacant++;
      t.area += (+u.builtupArea || 0);
    });
    return t;
  };

  const allUnits = (db.units || []).filter(unitMatches);
  const grand = tally((proj === 'all' ? (db.units || []) : (db.units || []).filter((u) => u.assetId === proj)).filter((u) => !q || [u.name, u.owner, nameOf(db.brands, leaseByUnit[u.id]?.brandId)].join(' ').toLowerCase().includes(q)));

  const STATUS_TABS = [
    ['all', 'All', grand.total],
    ['leased', 'Leased / Booked', grand.leased],
    ['vacant', 'Vacant', grand.vacant],
    ['selfuse', 'Self-use', grand.selfuse]
  ];

  return (
    <>
      <div className="toolbar">
        <div className="field" style={{ maxWidth: 280, margin: 0 }}>
          <select value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="all">All projects</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <SearchBox placeholder="Search unit, owner or brand…" value={search} onChange={setSearch} />
      </div>
      <div className="inv-status-tabs">
        {STATUS_TABS.map(([v, l, n]) => (
          <button key={v} type="button" className={`inv-stab ${v} ${statusFilter === v ? 'on' : ''}`} onClick={() => setStatusFilter(v)}>
            {l} <span className="cnt">{n}</span>
          </button>
        ))}
      </div>

      <div className="kpirow" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-l">Total units</div><div className="kpi-v">{grand.total}</div></div>
        <div className="kpi"><div className="kpi-l">Leased</div><div className="kpi-v" style={{ color: 'var(--green)' }}>{grand.leased}</div></div>
        <div className="kpi"><div className="kpi-l">Vacant</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{grand.vacant}</div></div>
        <div className="kpi"><div className="kpi-l">Self-use</div><div className="kpi-v">{grand.selfuse}</div></div>
        <div className="kpi"><div className="kpi-l">Built-up area (sq ft)</div><div className="kpi-v">{grand.area.toLocaleString('en-IN')}</div></div>
      </div>

      {shownAssets.map((asset) => {
        const assetUnits = allUnits.filter((u) => u.assetId === asset.id);
        if (!assetUnits.length) return null;
        const at = tally(assetUnits);
        const blocks = (db.blocks || []).filter((b) => b.assetId === asset.id);
        return (
          <div className="inv-project" key={asset.id}>
            <div className="inv-project-hd">
              <div><h3>{asset.name}</h3><span className="sub">{asset.city || ''}</span></div>
              <div className="inv-chips">
                <span className="chip">{at.total} units</span>
                <span className="chip green">{at.leased} leased</span>
                <span className="chip amber">{at.vacant} vacant</span>
                {at.selfuse > 0 && <span className="chip">{at.selfuse} self-use</span>}
              </div>
            </div>
            {blocks.map((block) => {
              const blockUnits = assetUnits.filter((u) => u.blockId === block.id);
              if (!blockUnits.length) return null;
              const bt = tally(blockUnits);
              // group by floor
              const floors = [...new Set(blockUnits.map((u) => u.floor ?? 0))].sort((a, b) => a - b);
              return (
                <div className="inv-block" key={block.id}>
                  <div className="inv-block-hd">
                    <b>{block.name}</b>
                    <span className="sub">{bt.total} units · {bt.leased} leased · {bt.vacant} vacant</span>
                  </div>
                  {floors.map((fl) => {
                    const fUnits = blockUnits.filter((u) => (u.floor ?? 0) === fl).sort((a, b) => a.name.localeCompare(b.name));
                    return (
                      <div className="inv-floor" key={fl}>
                        <div className="inv-floor-lbl">Floor {fl}</div>
                        <div className="inv-units">
                          {fUnits.map((u) => {
                            const l = leaseByUnit[u.id];
                            const sf = (u.availableFor || '').toLowerCase();
                            const cls = l ? 'leased' : sf.includes('self') ? 'selfuse' : 'vacant';
                            return (
                              <div className={`inv-unit ${cls} clickable`} key={u.id} title={l ? nameOf(db.brands, l.brandId) : (u.owner || '')} onClick={() => setOpenUnit(u)}>
                                <div className="iu-name">{u.name}</div>
                                <div className="iu-sub">{l ? nameOf(db.brands, l.brandId) : (sf.includes('self') ? 'Self-use' : 'Vacant')}</div>
                                <div className="iu-area">{(+u.builtupArea || 0).toLocaleString('en-IN')} sq ft</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
      {shownAssets.every((a) => !allUnits.some((u) => u.assetId === a.id)) && <EmptyMini text="No units match." />}
      {openUnit && <UnitDetailSlide unit={openUnit} db={db} onClose={() => setOpenUnit(null)} />}
    </>
  );
}

function UnitDetailSlide({ unit, db, onClose }) {
  const lease = (db.leases || []).find((l) => l.unitId === unit.id);
  const brand = lease ? findById(db.brands, lease.brandId) : null;
  const block = findById(db.blocks, unit.blockId);
  const asset = findById(db.assets, unit.assetId);
  const iu = (db.investorUnits || []).find((x) => x.unitId === unit.id);
  const unitInvoices = (db.invoices || []).filter((i) => i.unitId === unit.id);
  const invoiced = unitInvoices.reduce((s, i) => s + (+i.total || 0), 0);
  const collByInv = {};
  (db.collections || []).forEach((c) => { collByInv[c.invoiceId] = (collByInv[c.invoiceId] || 0) + (+c.amount || 0); });
  const collected = unitInvoices.reduce((s, i) => s + (collByInv[i.id] || 0), 0);

  const sf = (unit.availableFor || '').toLowerCase();
  const statusLabel = lease ? 'Leased' : sf.includes('self') ? 'Self-use' : 'Vacant';
  const statusColor = lease ? 'green' : sf.includes('self') ? 'grey' : 'amber';

  return (
    <>
      <div className="slide-scrim" onClick={onClose} />
      <div className="slide-panel">
        <div className="slide-hd">
          <div><h3>{unit.name}</h3><span className="sub">{asset?.name} · {block?.name} · Floor {unit.floor ?? 0}</span></div>
          <button className="iconbtn" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="slide-body">
          <div className="slide-status"><Pill color={statusColor}>{statusLabel}</Pill></div>

          <div className="sectlabel big">Unit</div>
          <div className="kv"><span>Carpet area</span><b>{(+unit.carpetArea || 0).toLocaleString('en-IN')} sq ft</b></div>
          <div className="kv"><span>Built-up area</span><b>{(+unit.builtupArea || 0).toLocaleString('en-IN')} sq ft</b></div>
          <div className="kv"><span>Owner / customer</span><b>{unit.owner || '—'}</b></div>

          {lease && brand ? (
            <>
              <div className="sectlabel big">Lease</div>
              <div className="kv"><span>Brand</span><b>{brand.name}</b></div>
              <div className="kv"><span>Type</span><b>{lease.rentalType}</b></div>
              <div className="kv"><span>Term</span><b>{fmtDate(lease.startDate)} → {fmtDate(lease.endDate)}</b></div>
              <div className="kv"><span>MG</span><b>{lease.mg ? money0(lease.mg) + (lease.mgBasis === 'PerSqFt' ? '/sq ft' : '') : '—'}</b></div>
              {lease.revSharePct > 0 && <div className="kv"><span>Revenue share</span><b>{lease.revSharePct}%</b></div>}
              <div className="kv"><span>Security deposit</span><b>{lease.deposit ? money0(lease.deposit) : '—'}</b></div>
              {lease.tenureYears && <div className="kv"><span>Tenure</span><b>{lease.tenureYears} yrs</b></div>}
              {lease.lockinMonths && <div className="kv"><span>Lock-in</span><b>{lease.lockinMonths} months</b></div>}
              {lease.stage && <div className="kv"><span>Stage</span><b>{lease.stage}</b></div>}

              <div className="sectlabel big">Billing</div>
              <div className="kv"><span>Invoiced</span><b>{money0(invoiced)}</b></div>
              <div className="kv"><span>Collected</span><b style={{ color: 'var(--green)' }}>{money0(collected)}</b></div>
              <div className="kv"><span>Outstanding</span><b style={{ color: invoiced - collected > 0 ? 'var(--amber)' : 'inherit' }}>{money0(Math.max(0, invoiced - collected))}</b></div>
            </>
          ) : (
            <Callout>{sf.includes('self') ? 'This unit is marked self-use.' : 'This unit is currently vacant — no active lease.'}</Callout>
          )}

          {iu && (
            <>
              <div className="sectlabel big">Investor(s)</div>
              {(iu.investors || []).map((x, i) => (
                <div className="kv" key={i}><span>{x.name}{x.nri ? ' (NRI)' : ''}</span><b>{x.disbursePct}%</b></div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
function CloseIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>; }

function Dashboard({ db }) {
  const [showAllDue, setShowAllDue] = React.useState(false);
  const totalUnits = db.units.length;
  const leasedUnits = db.units.filter((u) => u.status === 'Leased').length;
  const vacantUnits = db.units.filter((u) => u.status === 'Vacant').length;
  const unpaidTotal = db.invoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + (i.balance ?? (i.total - (i.paid || 0))), 0);
  const collectedThisMonth = db.collections.filter((c) => c.date >= curYM() + '-01').reduce((s, c) => s + c.amount, 0);
  const pendingApprovals = db.investorUnits.filter((iv) => iv.status === 'Pending').length + db.disbursals.filter((d) => d.status === 'Pending').length;
  const recentInvoices = [...db.invoices].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)).slice(0, 8);
  const recentDisb = [...db.disbursals].sort((a, b) => (a.no < b.no ? 1 : -1)).slice(0, 6);

  // ── Client-side billing alerts ──
  const today = new Date().toISOString().slice(0, 10);
  const currYm = curYM();
  const invoicedLeaseYmTypes = new Set(db.invoices.map((i) => `${i.leaseId}|${i.ym}|${i.type}`));
  const billingDue = db.leases.filter((l) => !l.onHold && l.status === 'Active' && ['MG', 'MGvsRS'].includes(l.rentalType) && !invoicedLeaseYmTypes.has(`${l.id}|${currYm}|MG`));
  const overdueInv = db.invoices.filter((i) => i.dueDate < today && i.status !== 'Paid').slice(0, 10);
  const upcomingInv = db.invoices.filter((i) => {
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return i.dueDate >= today && i.dueDate <= d7 && i.status !== 'Paid';
  });
  const totalAlerts = billingDue.length + overdueInv.length + upcomingInv.length;

  return (
    <>
      <div className="kpis">
        <div className="kpi on"><div className="lab">Units leased</div><div className="val">{leasedUnits} / {totalUnits}</div><div className="sub">{vacantUnits} vacant</div></div>
        <div className="kpi"><div className="lab">Outstanding receivables</div><div className="val m">{money0(unpaidTotal)}</div><div className="sub">across unpaid/partial invoices</div></div>
        <div className="kpi"><div className="lab">Collected this month</div><div className="val m">{money0(collectedThisMonth)}</div><div className="sub">receipts to date</div></div>
        <div className="kpi"><div className="lab">Pending approvals</div><div className="val">{pendingApprovals}</div><div className="sub">investor units + disbursals</div></div>
      </div>

      {totalAlerts > 0 && (
        <div className="alert-panel">
          <div className="alert-panel-hd">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            Billing &amp; Payment Alerts
            <span className="alert-badge">{totalAlerts}</span>
          </div>
          <div className="alert-sections">
            {billingDue.length > 0 && (
              <div className="alert-section">
                <div className="alert-section-title warn">⏰ Bills not yet raised ({currYm})</div>
                <div className={'alert-list' + (showAllDue ? ' expanded' : '')}>
                  {(showAllDue ? billingDue : billingDue.slice(0, 5)).map((l) => (
                    <div className="alert-row" key={l.id}>
                      <span className="strong">{nameOf(db.brands, l.brandId)}</span>
                      <span className="sub"> · {nameOf(db.units, l.unitId)} · {l.rentalType}</span>
                    </div>
                  ))}
                </div>
                {billingDue.length > 5 && (
                  <button className="alert-more" onClick={() => setShowAllDue(!showAllDue)}>
                    {showAllDue ? '▲ Show less' : `▼ Show all ${billingDue.length}`}
                  </button>
                )}
              </div>
            )}
            {overdueInv.length > 0 && (
              <div className="alert-section">
                <div className="alert-section-title danger">🔴 Overdue invoices</div>
                {overdueInv.map((i) => (
                  <div className="alert-row" key={i.id}>
                    <span className="code">{i.no}</span>
                    <span> · {nameOf(db.brands, i.brandId)}</span>
                    <span className="sub"> · Due {fmtDate(i.dueDate)} · Balance {money0(i.balance)}</span>
                  </div>
                ))}
              </div>
            )}
            {upcomingInv.length > 0 && (
              <div className="alert-section">
                <div className="alert-section-title info">🔔 Due within 7 days</div>
                {upcomingInv.map((i) => (
                  <div className="alert-row" key={i.id}>
                    <span className="code">{i.no}</span>
                    <span> · {nameOf(db.brands, i.brandId)}</span>
                    <span className="sub"> · Due {fmtDate(i.dueDate)} · Balance {money0(i.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
function LeasesPage({ db, search, setSearch, setModal, refresh, notify, canEditView, pendingDel }) {
  const pendingIds = new Set((pendingDel && pendingDel.leases) || []);
  const rows = db.leases.filter((l) => !search || [nameOf(db.brands, l.brandId), nameOf(db.units, l.unitId), l.code].join(' ').toLowerCase().includes(search.toLowerCase()));
  const release = async (id) => {
    try { await api.leases.release(id); await refresh(['leases']); notify('Lease released from hold.'); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
      {!canEditView && <Callout>You have view-only access to this section.</Callout>}
      <div className="toolbar" style={!canEditView ? { marginTop: 14 } : undefined}><SearchBox placeholder="Search leases, brands, units…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.leases.length === 0 ? <EmptyState thing="lease" onAdd={canEditView ? () => setModal({ type: 'lease' }) : null} /> : (
          <table>
            <thead><tr><th>Lease</th><th>Brand / Unit</th><th>Type</th><th className="num">MG / RS%</th><th>Term</th><th>Stage</th><th>Hold</th><th></th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><span className="code">{l.code}</span></td>
                  <td>{nameOf(db.brands, l.brandId)}<div className="sub">{nameOf(db.units, l.unitId)}</div></td>
                  <td><RentTypePill t={l.rentalType} /></td>
                  <td className="num">{l.mg ? money0(l.mg) : '—'} {l.revSharePct ? `/ ${l.revSharePct}%` : ''}</td>
                  <td className="sub">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                  <td>{l.stage ? <Pill color="grey">{l.stage}</Pill> : (l.brandStatus ? <span className="sub">{l.brandStatus}</span> : '—')}</td>
                  <td>{l.onHold ? <Pill color="amber">On hold</Pill> : <Pill color="green">Active</Pill>}</td>
                  <td className="rowact">
                    {pendingIds.has(l.id) ? <Pill color="amber">Deletion pending</Pill> : canEditView ? (
                      <>
                        {l.onHold
                          ? <button className="btn btn-ghost btn-sm" onClick={() => release(l.id)}>Release</button>
                          : <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'holdLease', id: l.id })}>Hold</button>}
                        <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'lease', id: l.id })}><EditIcon /></button>
                        <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteLease', id: l.id })}><DelIcon /></button>
                      </>
                    ) : <span className="sub">—</span>}
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

// Rich lease field sections — drives the tabbed lease form.
// Each field: [key, label, type]  where type: 'date'|'num'|'text'|'area'|select-array
// Standard option sets for dropdowns (blank first = optional). Derived from the Excel.
const OPT = {
  yesNo: ['', 'Yes', 'No'],
  availableFor: ['', 'Leasing', 'Self Use', 'Self Use(Approved)', 'to be connected'],
  brandStatus: ['', 'Operational', 'Yet To Be Operational', 'Under Pipe line', 'Cancelled'],
  handoverTeam: ['', 'Eligible', 'Not Eligible', 'Handover'],
  handoverStatus: ['', 'Pending', 'Handover', 'Handover Done'],
  possession: ['', 'Eligible', 'Not Eligible', 'Handover'],
  cdStatus: ['', 'Executed', 'Not Executed', 'Unsold'],
  regStatus: ['', 'Registered', 'Pending', 'Not Applicable'],
  agrStatus: ['', 'Signed', 'Pending', 'Under Process', 'Not Applicable'],
  signedFrom: ['', 'Signed', 'Pending', 'Direct', 'Not Applicable'],
  stage: ['', 'Fitout', 'Not Fitting Out', 'Operational', 'Deal Cancelled', 'Direct'],
  opStatus: ['', 'Operational', 'Yet to be Operational', 'Cancelled', 'Direct'],
  brandType: ['', 'F&B', 'Salon', 'Health', 'Bank', 'Pharmacy', 'Laundry', 'Departmental store', 'Other'],
  unitStatus: ['', 'CD Executed', 'CD Not Executed', 'Unsold'],
  leaseAgrStatus: ['', 'With M3M', 'With Landlord'],
  spaStatus: ['', 'Done', 'Pending', 'Not Applicable'],
  guaranteeStatus: ['', 'Provided', 'Pending', 'Not Applicable'],
  chargesBorneBy: ['', 'Tenant', 'Landlord', 'Developer', 'Shared']
};

const LEASE_SECTIONS = [
  ['Booking & Brand', [
    ['bookingDate', 'Date of booking', 'date'],
    ['loiDate', 'LOI date', 'date'],
    ['leasingHod', 'Leasing HOD', 'text'],
    ['brandStatus', 'Brand status', OPT.brandStatus],
    ['availableFor', 'Available for', OPT.availableFor],
    ['rmName', 'RM name', 'text'],
    ['channelPartner', 'Channel partner', 'text'],
    ['category', 'Category', 'text']
  ]],
  ['Consent, Possession & TCV', [
    ['consentStatus', 'Consent status', OPT.yesNo],
    ['lms', 'LMS', OPT.yesNo],
    ['physicalPossessionStatus', 'Physical possession status', OPT.possession],
    ['handoverStatus', 'Handover status (possession team)', OPT.handoverTeam],
    ['tcv', 'TCV (₹)', 'num'],
    ['calledIncludingTax', 'Called including tax (₹)', 'num']
  ]],
  ['Agreement & Registration', [
    ['cdStatus', 'CD status', OPT.cdStatus],
    ['cdExecutionDate', 'CD execution date', 'date'],
    ['registrationStatus', 'Registration status', OPT.regStatus],
    ['agreementRegistrationDate', 'Agreement registration date', 'date'],
    ['agreementStatus', 'Agreement status', OPT.agrStatus],
    ['dealStatus', 'Status', 'text'],
    ['signedAgreementDate', 'Date of signed agreement', 'date'],
    ['agreementConsultant', 'Agreement consultant', 'text'],
    ['agreementSignedBrand', 'Agreement signed from brand', OPT.signedFrom],
    ['agreementSignedInvestor', 'Agreement signed from investor', OPT.signedFrom],
    ['dealWith', 'Deal with', 'text']
  ]],
  ['Key Dates', [
    ['chequeClearanceDate', 'Cheque clearance date', 'date'],
    ['dealApprovalDate', 'Deal approval date', 'date'],
    ['docLeaseCommencementDate', 'Doc lease commencement / handover', 'date'],
    ['actualHandoverDate', 'Actual handover date', 'date'],
    ['docOperationalDate', 'Doc operational date', 'date'],
    ['actualOperationalDate', 'Actual operational date', 'date'],
    ['docRentCommencementDate', 'Doc rent commencement date', 'date'],
    ['actualRcdDate', 'Actual RCD date', 'date']
  ]],
  ['Fitout & Capex', [
    ['stage', 'Stage', OPT.stage],
    ['operationalStatus', 'Operational / Not operational', OPT.opStatus],
    ['percentWork', '% of work', 'num'],
    ['fitoutPeriod', 'Fitout period', 'text'],
    ['loanRs', 'Loan (₹)', 'num'],
    ['capex', 'Capex (₹)', 'num'],
    ['capexReleased', 'Released (₹)', 'num'],
    ['capexDue', 'Due (₹)', 'num']
  ]],
  ['Tenure & Security Deposit', [
    ['tenureYears', 'Tenure (yrs)', 'num'],
    ['lockinMonths', 'Lock-in (months)', 'num'],
    ['minGuaranteePsf', 'Minimum guarantee (₹/sq ft)', 'num'],
    ['sdRate', 'SD rate', 'num'],
    ['sdSchedule', 'SD schedule', 'text'],
    ['securityDeposit', 'Security deposit (₹)', 'num'],
    ['sdDue', 'SD due (₹)', 'num'],
    ['sdReceived', 'SD received (₹)', 'num'],
    ['sdBalance', 'SD balance (₹)', 'num'],
    ['sdFutureDue', 'SD future due (₹)', 'num']
  ]],
  ['CAM', [
    ['camSchedule', 'CAM schedule', 'text'],
    ['camDeposit', 'CAM deposit (₹)', 'num'],
    ['camDue', 'CAM due (₹)', 'num'],
    ['camReceived', 'CAM received (₹)', 'num'],
    ['camBalance', 'CAM balance (₹)', 'num'],
    ['camFutureDue', 'CAM future due (₹)', 'num']
  ]],
  ['Brokerage', [
    ['brokerageTerms', 'Brokerage terms', 'text'],
    ['brokerageDisbursal', 'Brokerage disbursal', 'text'],
    ['brokerageRate', 'Brokerage rate', 'num'],
    ['brokerageAmount', 'Brokerage amount (₹)', 'num'],
    ['brokerageDue', 'Brokerage due (₹)', 'num'],
    ['brokeragePaid', 'Brokerage paid (₹)', 'num'],
    ['brokerageBalance', 'Balance (₹)', 'num'],
    ['futureBrokerage', 'Future brokerage (₹)', 'num']
  ]],
  ['Billing Config', [
    ['hsnCode', 'HSN/SAC code', 'text'],
    ['paymentTermsDays', 'Payment terms (days from invoice)', 'num'],
    ['igstApplicable', 'IGST applicable (interstate)', ['', 'Yes', 'No']]
  ]],
  ['Remarks', [
    ['standardRemarks', 'Standard remarks', 'area'],
    ['detailedRemarks', 'Detailed remarks', 'area'],
    ['customerDocRemarks', 'Customer documentation remarks', 'area'],
    ['billingRemarks', 'Remarks from billing', 'area']
  ]]
];

// Note for Approval (NFA) — a single consolidated tab mirroring the approval note.
// Fields marked {ro:true} are read-only mirrors of values entered on other tabs.
const NFA_ROWS = [
  ['section', 'Deal identification'],
  ['nfaClientName', 'Client name', 'text'],
  ['nfaOpportunityId', 'Opportunity ID', 'text'],
  ['nfaLessor', 'Lessor (legal entity / landlord)', 'text'],
  ['nfaLandlordDetails', 'Landlord details', 'area'],
  ['section', 'Unit & agreement status'],
  ['nfaUnitStatus', 'Unit status (CD Executed / Not Executed / Unsold)', OPT.unitStatus],
  ['nfaLeaseAgreementStatus', 'Lease agreement status (With M3M / With Landlord)', OPT.leaseAgrStatus],
  ['nfaSpaStatus', 'SPA status (mandatory for CD customers)', OPT.spaStatus],
  ['nfaLeaseGuaranteeStatus', 'Lease guarantee status', OPT.guaranteeStatus],
  ['section', 'Commercials'],
  ['minGuaranteePsf', 'Lease rent / MG (₹/sq ft)', 'num'],
  ['camSchedule', 'CAM charges / schedule', 'text'],
  ['revenueSharePct', 'Revenue share %', 'num'],
  ['nfaRentEscalation', 'Rent escalation', 'text'],
  ['nfaCostToCompany', 'Cost to company (₹)', 'num'],
  ['section', 'Fitout'],
  ['nfaTotalFitoutCost', 'Total fitout cost (₹)', 'num'],
  ['nfaFitoutSupport', 'Fitout support', 'text'],
  ['nfaFitoutChargesBorneBy', 'Fitout CAM & elec charges borne by', OPT.chargesBorneBy],
  ['nfaFitoutCamFreePeriod', 'Fitout CAM free period', 'text'],
  ['nfaFitoutRentFreePeriod', 'Fitout rent free period', 'text'],
  ['section', 'Lease terms'],
  ['tenureYears', 'Lease tenure (yrs)', 'num'],
  ['lockinMonths', 'Lock-in period (months)', 'num'],
  ['nfaRentSdSchedule', 'Rent security deposit & payment schedule', 'area'],
  ['nfaCamSdSchedule', 'CAM security deposit & payment schedule', 'area'],
  ['nfaStampDuty', 'Stamp duty', 'text'],
  ['nfaDeveloperScope', 'Developer scope of work', 'area'],
  ['nfaAdditionalTerms', 'Additional terms', 'area'],
  ['nfaSignage', 'Signage', 'text'],
  ['section', 'Brokerage & occupancy'],
  ['brokerageTerms', 'Brokerage', 'text'],
  ['brokerageDisbursal', 'Brokerage disbursal policy', 'text'],
  ['nfaOccupancyClause', 'Occupancy clause', 'area'],
  ['section', 'Dates'],
  ['docLeaseCommencementDate', 'Handover / lease commencement date', 'date'],
  ['nfaOperationalTerms', 'Operational / rent commencement date', 'area'],
  ['section', 'Cheques'],
  ['nfaFitoutSupportCheque', 'Interest-free fitout support (undated cheque)', 'text'],
  ['nfaLockinRentalCheque', 'Lock-in period rental cheque', 'text'],
  ['nfaChequeReceivedDetails', 'Cheque received details', 'area'],
  ['section', 'Approval'],
  ['nfaPreparedBy', 'Prepared by', 'text'],
  ['nfaPreparedDate', 'Prepared date', 'date'],
  ['nfaProposedBy', 'Proposed by', 'text'],
  ['nfaHod', 'HOD', 'text'],
  ['nfaApprovedBy1', 'Approved by', 'text'],
  ['nfaApprovedBy2', 'Approved by (2)', 'text']
];
const ALL_LEASE_KEYS = [...new Set([...LEASE_SECTIONS.flatMap(([, fs]) => fs.map(f => f[0])), ...NFA_ROWS.filter(r => r[0] !== 'section').map(r => r[0])])];

function LeaseFormModal({ id, db, onClose, refresh, notify }) {
  const existing = id ? findById(db.leases, id) : null;
  const vacantUnits = db.units.filter((u) => u.status !== 'Leased' || (existing && u.id === existing.unitId));
  const [form, setForm] = useState(() => {
    const base = existing ? {
      brandId: existing.brandId, unitId: existing.unitId, startDate: existing.startDate, months: 36,
      rentalType: existing.rentalType, mgBasis: existing.mgBasis, mg: existing.mg, revSharePct: existing.revSharePct,
      cam: existing.cam, utility: existing.utility, esc: existing.esc, deposit: existing.deposit, gst: existing.gst
    } : {
      brandId: db.brands[0]?.id || '', unitId: vacantUnits[0]?.id || '', startDate: new Date().toISOString().slice(0, 10), months: 36,
      rentalType: 'MG', mgBasis: 'PerSqFt', mg: 70, revSharePct: 8, cam: 20, utility: 12, esc: 5, deposit: '', gst: 18
    };
    // seed rich fields from the existing lease (or blank)
    for (const k of ALL_LEASE_KEYS) base[k] = existing && existing[k] != null ? existing[k] : '';
    return base;
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

  const renderField = ([k, label, type]) => {
    if (Array.isArray(type)) {
      const cur = form[k] ?? '';
      const opts = type.includes(cur) ? type : [...type, cur]; // keep an existing value not in the list
      return <div className="field" key={k}><label>{label}</label>
        <select value={cur} onChange={(e) => set(k, e.target.value)}>
          {opts.map((o) => <option key={o} value={o}>{o === '' ? '— select —' : o}</option>)}
        </select></div>;
    }
    if (type === 'area') return <div className="field" key={k} style={{ gridColumn: '1 / -1' }}><label>{label}</label><textarea value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>;
    const inputType = type === 'date' ? 'date' : type === 'num' ? 'number' : 'text';
    return <div className="field" key={k}><label>{label}</label><input type={inputType} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>;
  };

  const unit = findById(db.units, form.unitId);
  const brand = findById(db.brands, form.brandId);

  return (
    <Modal title={id ? 'Edit lease' : 'New lease'} onClose={onClose} onSave={save} wide>
      <div className="lease-form">

        {/* ===== Rental ===== */}
        <div className="form-section">
          <div className="sectlabel big">Rental</div>
          <div className="grp2">
            <div className="field"><label>Brand <span className="req">*</span></label>
              <select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
                {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Unit <span className="req">*</span></label>
              <select value={form.unitId} disabled={!!id} onChange={(e) => set('unitId', e.target.value)}>
                {vacantUnits.map((u) => <option key={u.id} value={u.id}>{u.name} · {nameOf(db.assets, u.assetId)}{u.owner ? ' · owner: ' + u.owner : ''}</option>)}
              </select>
            </div>
          </div>
          {unit && unit.owner ? <Callout>Unit owner (customer): <b>{unit.owner}</b></Callout> : null}
          <div className="grp3">
            <div className="field"><label>Start date <span className="req">*</span></label><input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
            <div className="field"><label>Term (months)</label><input type="number" value={form.months} disabled={!!id} onChange={(e) => set('months', +e.target.value)} /></div>
            <div className="field"><label>GST %</label><input type="number" value={form.gst} onChange={(e) => set('gst', +e.target.value)} /></div>
          </div>
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
          <div className="grp3">
            <div className="field"><label>CAM (₹/sq ft b-up)</label><input type="number" value={form.cam} onChange={(e) => set('cam', +e.target.value)} /></div>
            <div className="field"><label>Utility (₹/sq ft b-up)</label><input type="number" value={form.utility} onChange={(e) => set('utility', +e.target.value)} /></div>
            <div className="field"><label>Security deposit (₹)</label><input type="number" value={form.deposit} onChange={(e) => set('deposit', +e.target.value)} /></div>
          </div>
          <Callout>{RENTAL_HINT[form.rentalType]}</Callout>
        </div>

        {/* ===== Note for Approval ===== */}
        <div className="form-section">
          <div className="sectlabel big">Note for Approval</div>
          <div className="nfa-auto">
            <div><span>Project</span><b>{nameOf(db.assets, unit?.assetId) || 'Orchard Street'}</b></div>
            <div><span>Brand</span><b>{brand?.name || '—'}</b></div>
            <div><span>CP name</span><b>{form.channelPartner || '—'}</b></div>
            <div><span>Unit no</span><b>{unit?.name || '—'}</b></div>
            <div><span>Super area (sq ft)</span><b>{unit?.builtupArea != null ? (+unit.builtupArea).toLocaleString('en-IN') : '—'}</b></div>
            <div><span>Owner / customer</span><b>{unit?.owner || form.nfaClientName || '—'}</b></div>
          </div>
          <div className="lease-grid">
            {NFA_ROWS.map((row, idx) => {
              if (row[0] === 'section') return <div className="sectlabel sub-sect" key={'sec' + idx}>{row[1]}</div>;
              return renderField(row);
            })}
          </div>
        </div>

        {/* ===== All remaining detail sections ===== */}
        {LEASE_SECTIONS.map((sec, i) => (
          <div className="form-section" key={i}>
            <div className="sectlabel big">{sec[0]}</div>
            <div className="lease-grid">{sec[1].map(renderField)}</div>
          </div>
        ))}

      </div>
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
function SalesPage({ db, search, setSearch, setModal, notify, canEditView }) {
  const rsLeases = db.leases.filter((l) => ['PureRS', 'MGvsRS', 'VarRS'].includes(l.rentalType));
  const rows = db.sales.filter((s) => {
    const l = findById(db.leases, s.leaseId);
    return !search || [nameOf(db.brands, l?.brandId), s.ym].join(' ').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (a.ym < b.ym ? 1 : -1));

  return (
    <>
      {!canEditView && <Callout>You have view-only access to this section.</Callout>}
      <div className="toolbar" style={!canEditView ? { marginTop: 14 } : undefined}><SearchBox placeholder="Search sales by brand or month…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.sales.length === 0 ? (
          rsLeases.length ? <EmptyState thing="sales entry" onAdd={canEditView ? () => setModal({ type: 'sales' }) : null} /> : <EmptyMini text="No revenue-share leases yet. Create a Pure-RS or MG-vs-RS lease first." />
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
                    <td className="rowact">{canEditView ? <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteSales', id: s.id })}><DelIcon /></button> : <span className="sub">—</span>}</td>
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
function InvoicesPage({ db, search, setSearch, filterVal, setFilterVal, setModal, notify, canEditView, pendingDel }) {
  const pendingIds = new Set((pendingDel && pendingDel.invoices) || []);
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
        {db.invoices.length === 0 ? <EmptyState thing="invoice" onAdd={canEditView ? () => setModal({ type: 'generate' }) : null} /> : (
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
                    {pendingIds.has(i.id) ? <Pill color="amber">Deletion pending</Pill> : (
                      <>
                        {canEditView && i.status !== 'Paid' && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'collection', invoiceId: i.id })}>Collect</button>}
                        {canEditView && <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteInvoice', id: i.id })}><DelIcon /></button>}
                      </>
                    )}
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
        const res = await api.invoices.generate(ym, scope);
        await refresh(['invoices']);
        if (res.count) notify(`${res.count} invoice(s) generated for ${ymLabel(ym)}.`);
        else if (res.errors && res.errors.length) notify(`0 generated — ${res.errors[0].error}`, true);
        else notify(`No new invoices (scanned ${res.scanned ?? '?'} leases — already generated or nothing billable).`);
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

function ViewInvoiceModal({ id, db, onClose, setModal }) {
  const [printData, setPrintData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const i = findById(db.invoices, id);

  useEffect(() => {
    (async () => {
      try { setPrintData(await api.invoices.print(id)); } catch (_) { /* fallback to local data */ }
      setLoading(false);
    })();
  }, [id]); // eslint-disable-line

  if (!i) return null;
  const brand = findById(db.brands, i.brandId);
  const unit = findById(db.units, i.unitId);
  const asset = unit ? findById(db.assets, unit.assetId) : null;
  const company = brand ? findById(db.companies, brand.companyId) : null;

  const landlord = printData?.landlord || {
    name: asset?.landlordName || asset?.name, address: asset?.landlordAddress,
    gstin: asset?.gstin, pan: asset?.panNo,
    bank: { name: asset?.bankName, branch: asset?.bankBranch, acc: asset?.bankAcc, ifsc: asset?.bankIfsc, micr: asset?.bankMicr }
  };
  const tenant = printData?.tenant || {
    brandName: brand?.name, companyName: company?.name,
    address: brand?.address || brand?.regularAddress,
    gstin: company?.gstin, pan: company?.panNo
  };
  const inv = printData?.invoice || i;
  const igstMode = (inv.igstAmt || 0) > 0;
  const gstPct = inv.gstPct || 0;
  const leaseInfo = printData?.lease;
  const payDays = leaseInfo?.paymentTermsDays || inv.paymentTermsDays || 7;
  const hsnCode = leaseInfo?.hsnCode || inv.hsnCode || '997212';
  const pos = inv.placeOfSupply || 'HARYANA';
  const docDate = fmtDate(inv.ackDate ? inv.ackDate.slice(0, 10) : i.dueDate);
  const balance = inv.balance ?? (inv.total - (inv.paid || 0));

  const printInvoice = () => window.print();

  return (
    <Modal title={`Tax Invoice — ${i.no}`} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={printInvoice}>🖨 Print</button><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn btn-teal btn-sm" onClick={() => { onClose(); setModal({ type: 'sdAdjust', id }); }}>SD Adjust</button></>}>
      {loading ? <div className="empty"><p>Loading invoice…</p></div> : (
        <div className="einv inv-print">
          {/* Top: supplier GSTIN + name, QR-style IRN box */}
          <div className="einv-top">
            <div>
              <div className="einv-gstin">{landlord.gstin || 'GSTIN NOT SET'}</div>
              <div className="einv-suppname">{(landlord.name || '—').toUpperCase()}</div>
            </div>
            <div className="einv-qr">
              <div className="einv-qr-box">IRN QR</div>
              <div className="einv-qr-sub">{i.irn ? i.irn.slice(0, 16) + '…' : '—'}</div>
            </div>
          </div>

          {/* 1. e-Invoice Details */}
          <div className="einv-sec">
            <div className="einv-sec-hd">1. e-Invoice Details</div>
            <div className="einv-grid3">
              <div><b>IRN :</b> <span className="einv-mono">{i.irn || '—'}</span></div>
              <div><b>Ack No. :</b> {inv.ackNo || '—'}</div>
              <div><b>Ack Date :</b> {inv.ackDate ? new Date(inv.ackDate).toLocaleString('en-IN') : docDate}</div>
            </div>
          </div>

          {/* 2. Transaction Details */}
          <div className="einv-sec">
            <div className="einv-sec-hd">2. Transaction Details</div>
            <div className="einv-grid3">
              <div><b>Supply type Code :</b> B2B</div>
              <div><b>Document No. :</b> {i.no}</div>
              <div><b>IGST applicable despite Supplier and Recipient located in same State :</b> {igstMode ? 'Yes' : 'No'}</div>
              <div><b>Place of Supply :</b> {pos}</div>
              <div><b>Document Type :</b> Tax Invoice</div>
              <div><b>Document Date :</b> {docDate}</div>
            </div>
          </div>

          {/* 3. Party Details */}
          <div className="einv-sec">
            <div className="einv-sec-hd">3. Party Details</div>
            <div className="einv-parties">
              <div className="einv-party">
                <div className="einv-party-t">Supplier :</div>
                <div><b>GSTIN :</b> {landlord.gstin || '—'}</div>
                <div className="strong">{(landlord.name || '—').toUpperCase()}</div>
                {landlord.address && <div className="sub">{landlord.address}</div>}
                {landlord.pan && <div><b>PAN :</b> {landlord.pan}</div>}
              </div>
              <div className="einv-party">
                <div className="einv-party-t">Recipient :</div>
                <div><b>GSTIN :</b> {tenant.gstin || '—'}</div>
                <div className="strong">{(tenant.companyName || tenant.brandName || '—').toUpperCase()}</div>
                {tenant.brandName && tenant.companyName && <div className="sub">{tenant.brandName} · {unit?.name} · {asset?.name}</div>}
                {tenant.address && <div className="sub">{tenant.address}</div>}
                <div><b>Place of Supply :</b> {pos}</div>
                {tenant.pan && <div><b>PAN :</b> {tenant.pan}</div>}
              </div>
            </div>
          </div>

          {/* 4. Details of Goods / Services */}
          <div className="einv-sec">
            <div className="einv-sec-hd">4. Details of Goods / Services</div>
            <table className="einv-tbl">
              <thead>
                <tr><th>SlNo</th><th>Item Description</th><th>HSN Code</th><th>Quantity</th><th>Unit</th><th className="num">Unit Price(Rs)</th><th className="num">Discount(Rs)</th><th className="num">Taxable Amount(Rs)</th><th>Tax Rate (GST + Cess)</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>{i.desc || i.type}</td>
                  <td>{hsnCode}</td>
                  <td>1</td>
                  <td>OTH</td>
                  <td className="num">{Number(inv.amount).toFixed(2)}</td>
                  <td className="num">0</td>
                  <td className="num">{Number(inv.amount).toFixed(2)}</td>
                  <td>{gstPct.toFixed(2)} + 0.00 | 0.00 + 0</td>
                  <td className="num">{Number(inv.total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <table className="einv-tbl einv-taxrow">
              <thead>
                <tr><th className="num">Tax'ble Amt</th><th className="num">CGST Amt</th><th className="num">SGST Amt</th><th className="num">IGST Amt</th><th className="num">CESS Amt</th><th className="num">State CESS</th><th className="num">Discount</th><th className="num">Other Charges</th><th className="num">Round off Amt</th><th className="num">Tot Inv. Amt</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="num">{Number(inv.amount).toFixed(2)}</td>
                  <td className="num">{Number(inv.cgstAmt || 0).toFixed(2)}</td>
                  <td className="num">{Number(inv.sgstAmt || 0).toFixed(2)}</td>
                  <td className="num">{Number(inv.igstAmt || 0).toFixed(2)}</td>
                  <td className="num">0.00</td>
                  <td className="num">0.00</td>
                  <td className="num">0.00</td>
                  <td className="num">0.00</td>
                  <td className="num">0.00</td>
                  <td className="num"><b>{Number(inv.total).toFixed(2)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 5. Payment & compliance */}
          <div className="einv-sec">
            <div className="einv-sec-hd">5. Payment Terms & Compliance</div>
            <div className="einv-grid3">
              <div><b>Payment terms :</b> {payDays} days from invoice date</div>
              <div><b>Due date :</b> {fmtDate(i.dueDate)}</div>
              <div><b>Status :</b> {inv.status} {balance > 0 ? `(Balance ₹${Number(balance).toLocaleString('en-IN')})` : ''}</div>
            </div>
            <div className="einv-note"><b>TDS :</b> TDS as applicable under the Income Tax Act, 1961.</div>
            {landlord.bank?.acc && (
              <div className="einv-note">
                <b>Bank details for payment :</b> {landlord.bank.name}{landlord.bank.branch ? `, ${landlord.bank.branch}` : ''} · A/c No: {landlord.bank.acc}{landlord.bank.ifsc ? ` · IFSC: ${landlord.bank.ifsc}` : ''}{landlord.bank.micr ? ` · MICR: ${landlord.bank.micr}` : ''}
              </div>
            )}
          </div>

          {/* Footer strip */}
          <div className="einv-foot">
            <div>
              <div><b>Generated By :</b> {landlord.gstin || '—'}</div>
              <div><b>Print Date :</b> {new Date().toLocaleString('en-IN')}</div>
            </div>
            <div className="einv-ack-bar">{inv.ackNo || ''}</div>
            <div className="einv-sign">
              <div className="einv-esign">e-Invoice</div>
              <div className="sub">This is a computer-generated invoice.<br />No physical/digital signature required.</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* SD adjustment modal */
function SdAdjustModal({ id, db, onClose, refresh, notify }) {
  const i = findById(db.invoices, id);
  const [amt, setAmt] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  if (!i) return null;
  const balance = i.balance ?? (i.total - (i.paid || 0));

  const save = async () => {
    if (!amt || Number(amt) <= 0) return notify('Enter a positive SD adjustment amount.', true);
    setBusy(true);
    try {
      const res = await api.invoices.sdAdjust(id, Number(amt), note);
      await refresh(['invoices', 'collections']);
      notify(`SD adjustment of ${money0(res.adjAmt)} applied.`);
      onClose();
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`SD Adjustment — ${i.no}`} onClose={onClose} onSave={save} saveLabel={busy ? 'Saving…' : 'Apply adjustment'}>
      <Callout>Adjusts the security deposit amount against this invoice balance of {money0(balance)}. A receipt entry marked "SD-Adjust" will be created.</Callout>
      <div className="field"><label>SD amount to adjust <span className="req">*</span></label>
        <input type="number" value={amt} placeholder={`Max ${balance.toFixed(2)}`} onChange={(e) => setAmt(e.target.value)} /></div>
      <div className="field"><label>Note</label>
        <input type="text" value={note} placeholder="e.g. SD adjustment as per agreement clause 12" onChange={(e) => setNote(e.target.value)} /></div>
    </Modal>
  );
}

/* ===================== COLLECTIONS ===================== */
function CollectionMasterPage({ db, search, setSearch }) {
  // Aggregate invoiced / collected / outstanding per lease (brand + unit)
  const collByInv = {};
  (db.collections || []).forEach((c) => { collByInv[c.invoiceId] = (collByInv[c.invoiceId] || 0) + (+c.amount || 0); });

  const rowsByLease = {};
  (db.invoices || []).forEach((inv) => {
    const key = inv.leaseId || inv.id;
    if (!rowsByLease[key]) {
      const lease = findById(db.leases, inv.leaseId);
      rowsByLease[key] = {
        leaseId: inv.leaseId,
        brandId: inv.brandId || lease?.brandId,
        unitId: inv.unitId || lease?.unitId,
        invoiced: 0, collected: 0, count: 0
      };
    }
    rowsByLease[key].invoiced += (+inv.total || 0);
    rowsByLease[key].collected += (collByInv[inv.id] || 0);
    rowsByLease[key].count++;
  });

  let rows = Object.values(rowsByLease).map((r) => ({ ...r, outstanding: Math.max(0, r.invoiced - r.collected) }));
  const q = (search || '').toLowerCase();
  if (q) rows = rows.filter((r) => [nameOf(db.brands, r.brandId), nameOf(db.units, r.unitId)].join(' ').toLowerCase().includes(q));
  rows.sort((a, b) => b.outstanding - a.outstanding);

  const tot = rows.reduce((t, r) => ({ inv: t.inv + r.invoiced, col: t.col + r.collected, out: t.out + r.outstanding }), { inv: 0, col: 0, out: 0 });

  return (
    <>
      <div className="kpirow" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi"><div className="kpi-l">Total invoiced</div><div className="kpi-v">{money0(tot.inv)}</div></div>
        <div className="kpi"><div className="kpi-l">Total collected</div><div className="kpi-v" style={{ color: 'var(--green)' }}>{money0(tot.col)}</div></div>
        <div className="kpi"><div className="kpi-l">Outstanding</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{money0(tot.out)}</div></div>
      </div>
      <div className="toolbar"><SearchBox placeholder="Search brand or unit…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {rows.length === 0 ? <EmptyMini text="No invoices yet. Generate invoices to see collection status." /> : (
          <table>
            <thead><tr><th>Brand / Unit</th><th className="num">Invoices</th><th className="num">Invoiced</th><th className="num">Collected</th><th className="num">Outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const pct = r.invoiced > 0 ? Math.round((r.collected / r.invoiced) * 100) : 0;
                return (
                  <tr key={i}>
                    <td>{nameOf(db.brands, r.brandId)}<div className="sub">{nameOf(db.units, r.unitId)}</div></td>
                    <td className="num sub">{r.count}</td>
                    <td className="num">{money0(r.invoiced)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{money0(r.collected)}</td>
                    <td className="num strong" style={{ color: r.outstanding > 0 ? 'var(--amber)' : 'inherit' }}>{money0(r.outstanding)}</td>
                    <td>{r.outstanding <= 0 ? <Pill color="green">Cleared</Pill> : pct > 0 ? <Pill color="amber">{pct}% paid</Pill> : <Pill color="red">Unpaid</Pill>}</td>
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

function CollectionsPage({ db, search, setSearch, setModal, canEditView, pendingDel }) {
  const pendingIds = new Set((pendingDel && pendingDel.collections) || []);
  const rows = db.collections.filter((c) => {
    const inv = findById(db.invoices, c.invoiceId);
    return !search || [c.no, inv?.no, c.ref].join(' ').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      {!canEditView && <Callout>You have view-only access to this section.</Callout>}
      <div className="toolbar" style={!canEditView ? { marginTop: 14 } : undefined}><SearchBox placeholder="Search collections…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.collections.length === 0 ? <EmptyState thing="collection" onAdd={canEditView ? () => setModal({ type: 'collection' }) : null} /> : (
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
                    <td className="rowact">{pendingIds.has(c.id) ? <Pill color="amber">Deletion pending</Pill> : canEditView ? <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteCollection', id: c.id })}><DelIcon /></button> : <span className="sub">—</span>}</td>
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
function InvestorAccountsPage({ db, search, setSearch }) {
  // rent collected per unit (from collections -> invoices -> unit)
  const collByInv = {};
  (db.collections || []).forEach((c) => { collByInv[c.invoiceId] = (collByInv[c.invoiceId] || 0) + (+c.amount || 0); });
  const rentCollectedByUnit = {};
  (db.invoices || []).forEach((inv) => {
    if (inv.type && !['MG', 'RevShare', 'Rent'].includes(inv.type)) return; // rent-type invoices only
    const got = collByInv[inv.id] || 0;
    if (!inv.unitId) return;
    rentCollectedByUnit[inv.unitId] = (rentCollectedByUnit[inv.unitId] || 0) + got;
  });

  // disbursed per investor name (net paid, non-void)
  const disbursedByInvestor = {};
  const pendingByInvestor = {};
  (db.disbursals || []).forEach((d) => {
    if (d.status === 'Void') return;
    const key = (d.investorName || '').trim().toLowerCase();
    if (d.status === 'Processed' || d.status === 'Approved') disbursedByInvestor[key] = (disbursedByInvestor[key] || 0) + (+d.netPayable || 0);
    else pendingByInvestor[key] = (pendingByInvestor[key] || 0) + (+d.netPayable || 0);
  });

  // build per-investor accounts from investor units
  const acct = {};
  (db.investorUnits || []).forEach((iv) => {
    if (iv.status !== 'Approved') return;
    const unitRent = rentCollectedByUnit[iv.unitId] || 0;
    (iv.investors || []).forEach((inv) => {
      const key = (inv.name || '').trim().toLowerCase();
      if (!acct[key]) acct[key] = { name: inv.name, units: new Set(), share: 0, nri: inv.nri };
      acct[key].units.add(iv.unitId);
      acct[key].share += unitRent * ((+inv.disbursePct || 0) / 100);
    });
  });

  let rows = Object.entries(acct).map(([key, a]) => {
    const disbursed = disbursedByInvestor[key] || 0;
    const pending = pendingByInvestor[key] || 0;
    return {
      name: a.name, nri: a.nri, units: a.units.size,
      entitled: a.share, disbursed, pending,
      balance: Math.max(0, a.share - disbursed)
    };
  });
  const q = (search || '').toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  rows.sort((a, b) => b.entitled - a.entitled);

  const tot = rows.reduce((t, r) => ({ e: t.e + r.entitled, d: t.d + r.disbursed, b: t.b + r.balance }), { e: 0, d: 0, b: 0 });

  return (
    <>
      <Callout>Investor entitlement = rent collected on each owned unit × the investor's disbursement %. Balance = entitled − disbursed. This reconciles collections to investor distributions.</Callout>
      <div className="kpirow" style={{ margin: '14px 0 16px', gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi"><div className="kpi-l">Entitled (from collections)</div><div className="kpi-v">{money0(tot.e)}</div></div>
        <div className="kpi"><div className="kpi-l">Disbursed</div><div className="kpi-v" style={{ color: 'var(--green)' }}>{money0(tot.d)}</div></div>
        <div className="kpi"><div className="kpi-l">Balance payable</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{money0(tot.b)}</div></div>
      </div>
      <div className="toolbar"><SearchBox placeholder="Search investor…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {rows.length === 0 ? <EmptyMini text="No approved investor units with collected rent yet." /> : (
          <table>
            <thead><tr><th>Investor</th><th className="num">Units</th><th className="num">Entitled (₹)</th><th className="num">Disbursed (₹)</th><th className="num">Pending appr. (₹)</th><th className="num">Balance (₹)</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.name} {r.nri && <Pill color="blue">NRI</Pill>}</td>
                  <td className="num sub">{r.units}</td>
                  <td className="num">{money0(r.entitled)}</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{money0(r.disbursed)}</td>
                  <td className="num sub">{r.pending > 0 ? money0(r.pending) : '—'}</td>
                  <td className="num strong" style={{ color: r.balance > 0 ? 'var(--amber)' : 'inherit' }}>{money0(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function InvestorsPage({ db, search, setSearch, setModal, actingRole, refresh, notify, canEditView, pendingDel }) {
  const pendingIds = new Set((pendingDel && pendingDel.investors) || []);
  const rows = db.investorUnits.filter((iv) => !search || [iv.code, nameOf(db.units, iv.unitId), iv.investors.map((x) => x.name).join(' ')].join(' ').toLowerCase().includes(search.toLowerCase()));
  const mayApprove = canApproveRole(actingRole);
  const approve = async (id) => {
    try { await api.investorUnits.approve(id, actingRole); await refresh(['investorUnits']); notify('Investor unit approved.'); }
    catch (e) { notify(e.message, true); }
  };
  // rent collected per unit (collections -> invoices -> unit) — links Collection info to the Investor Account
  const collByInv = {};
  (db.collections || []).forEach((c) => { collByInv[c.invoiceId] = (collByInv[c.invoiceId] || 0) + (+c.amount || 0); });
  const rentCollectedByUnit = {};
  (db.invoices || []).forEach((inv) => {
    if (inv.type && !['MG', 'RevShare', 'Rent'].includes(inv.type)) return;
    if (!inv.unitId) return;
    rentCollectedByUnit[inv.unitId] = (rentCollectedByUnit[inv.unitId] || 0) + (collByInv[inv.id] || 0);
  });
  return (
    <>
      {canEditView && !mayApprove && (
        <Callout warn>You're acting as <b>{actingRole}</b> (maker). New/edited investor units need approval by an Admin, Finance or Portfolio Head.</Callout>
      )}
      {!canEditView && <Callout>You have view-only access to this section.</Callout>}
      <div className="toolbar" style={{ marginTop: 14 }}><SearchBox placeholder="Search investor units…" value={search} onChange={setSearch} /></div>
      <div className="tablewrap">
        {db.investorUnits.length === 0 ? <EmptyState thing="investor unit" onAdd={canEditView ? () => setModal({ type: 'investor' }) : null} /> : (
          <table>
            <thead><tr><th>Ref</th><th>Unit</th><th>Investors</th><th className="num">Ownership</th><th className="num">Rent collected</th><th className="num">Their share</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((iv) => {
                const u = findById(db.units, iv.unitId);
                const rentCollected = rentCollectedByUnit[iv.unitId] || 0;
                return (
                  <tr key={iv.id}>
                    <td><span className="code">{iv.code}</span></td>
                    <td><span className="strong">{u?.name || '—'}</span><div className="sub">{nameOf(db.assets, u?.assetId)} · Fl {iv.floor ?? 0}</div></td>
                    <td>{iv.investors.map((x, i) => (
                      <div key={i}>{x.name} {x.nri && <Pill color="blue">NRI</Pill>} {!x.gst && <Pill color="amber">No GST</Pill>}</div>
                    ))}</td>
                    <td className="num">{iv.investors.map((x) => `${x.disbursePct}%`).join(' / ')}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{money0(rentCollected)}</td>
                    <td className="num">{iv.investors.map((x) => money0(rentCollected * ((+x.disbursePct || 0) / 100))).join(' / ')}</td>
                    <td>{iv.status === 'Approved' ? <Pill color="green">Approved</Pill> : <Pill color="amber">Pending</Pill>}</td>
                    <td className="rowact">
                      {pendingIds.has(iv.id) ? <Pill color="amber">Deletion pending</Pill> : (
                        <>
                          {iv.status === 'Pending' && mayApprove && <button className="btn btn-teal btn-sm" onClick={() => approve(iv.id)}>Approve</button>}
                          {canEditView ? (
                            <>
                              <button className="iconbtn" title="Edit" onClick={() => setModal({ type: 'investor', id: iv.id })}><EditIcon /></button>
                              <button className="iconbtn danger" title="Delete" onClick={() => setModal({ type: 'confirmDeleteInvestor', id: iv.id })}><DelIcon /></button>
                            </>
                          ) : (!mayApprove && <span className="sub">—</span>)}
                        </>
                      )}
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
function DisbursementPage({ db, filterVal, setFilterVal, setModal, notify, actingRole, refresh, canEditView }) {
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
                      {!canEditView ? <span className="sub">—</span> : c.holdReason
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
                      {d.status === 'Pending' && canApproveRole(actingRole) && <button className="btn btn-teal btn-sm" onClick={async () => { try { await api.disbursement.approve(d.id, actingRole); load(); await refresh(['disbursals']); notify('Disbursal approved.'); } catch (e) { notify(e.message, true); } }}>Approve</button>}
                      <button className="iconbtn" title="Voucher" onClick={() => setModal({ type: 'viewDisb', disb: d })}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2h16v20l-3-2-3 2-2-2-2 2-3-2-3 2zM8 8h8M8 12h5" /></svg>
                      </button>
                      {canEditView && d.status !== 'Void' && <button className="iconbtn danger" title="Void" onClick={() => setModal({ type: 'voidDisb', id: d.id })}>
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
      notify(canApproveRole(actingRole) ? `Disbursed ${money0(net)} to ${c.investorName}.` : 'Disbursal created — awaiting approval.');
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
function DeletionsPage({ refresh, notify }) {
  const [tab, setTab] = useState('Pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { row, action }

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.deletionRequests.list(tab)); }
    catch (e) { notify(e.message, true); }
    setLoading(false);
  }, [tab]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const runDecision = async () => {
    const { row, action } = confirm;
    try {
      if (action === 'approve') { await api.deletionRequests.approve(row.id); notify('Deletion approved — record removed.'); }
      else { await api.deletionRequests.reject(row.id); notify('Deletion request rejected — record kept.'); }
      setConfirm(null);
      await load();
      await refresh(); // refresh underlying data + badges
    } catch (e) { notify(e.message, true); setConfirm(null); }
  };

  const ENTITY_LABEL = {
    companies: 'Company', assets: 'Project', blocks: 'Block', units: 'Unit', brands: 'Brand', users: 'User',
    leases: 'Lease', sales: 'Sales', invoices: 'Invoice', collections: 'Collection', investors: 'Investor unit'
  };

  return (
    <>
      <div className="toolbar">
        {['Pending', 'Approved', 'Rejected'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-teal' : 'btn-ghost'}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="tablewrap">
        {loading ? <div className="empty"><p>Loading…</p></div> :
          rows.length === 0 ? <EmptyMini text={`No ${tab.toLowerCase()} deletion requests.`} /> : (
            <table>
              <thead><tr><th>Type</th><th>Record</th><th>Reason</th><th>Requested by</th><th>When</th>{tab === 'Pending' ? <th></th> : <th>Decided by</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Pill color="grey">{ENTITY_LABEL[r.entity] || r.entity}</Pill></td>
                    <td className="strong">{r.label}</td>
                    <td className="sub">{r.reason || '—'}</td>
                    <td>{r.requestedBy}<div className="sub">{r.requestedRole}</div></td>
                    <td className="sub">{r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-GB') : '—'}</td>
                    {tab === 'Pending' ? (
                      <td className="rowact">
                        <button className="btn btn-teal btn-sm" onClick={() => setConfirm({ row: r, action: 'approve' })}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ row: r, action: 'reject' })}>Reject</button>
                      </td>
                    ) : (
                      <td>{r.decidedBy || '—'}<div className="sub">{r.decidedAt ? new Date(r.decidedAt).toLocaleString('en-GB') : ''}</div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {confirm && (
        <ConfirmModal
          title={confirm.action === 'approve' ? 'Approve deletion?' : 'Reject deletion request?'}
          message={confirm.action === 'approve'
            ? `This will permanently delete "${confirm.row.label}" (${ENTITY_LABEL[confirm.row.entity] || confirm.row.entity}), requested by ${confirm.row.requestedBy}. This cannot be undone.`
            : `The record "${confirm.row.label}" will be kept and the request from ${confirm.row.requestedBy} will be marked rejected.`}
          confirmLabel={confirm.action === 'approve' ? 'Approve & delete' : 'Reject request'}
          onClose={() => setConfirm(null)}
          onConfirm={runDecision}
        />
      )}
    </>
  );
}

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
          <div className="ph"><h3>Monthly disbursement report</h3><button className="btn btn-ghost btn-sm" onClick={exportDisb}>⬇ Excel CSV</button></div>
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
            <div className="ph"><h3>Deductions invoiced</h3></div>
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
            <div className="ph"><h3>SAP entry book</h3><button className="btn btn-ghost btn-sm" onClick={exportSAP}>⬇ GL CSV</button></div>
            <div className="pb">
              {sapRows.length === 0 ? <EmptyMini text="No postings to push yet." /> : (
                <table><thead><tr><th>GL</th><th>Doc</th><th>Type</th><th className="num">Amount</th></tr></thead>
                  <tbody>{sapRows.slice(0, 7).map((r, idx) => (
                    <tr key={idx}><td><span className="code">{r.gl}</span></td><td><span className="code">{r.doc}</span></td><td className="sub">{r.type}</td><td className="num">{money0(r.amount)}</td></tr>
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

/* ── GST Reconciliation Page ── */
function GstReconPage({ notify }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { (async () => { try { setRows(await api.reports.gstRecon()); } catch (e) { notify(e.message, true); } })(); }, []); // eslint-disable-line

  const exportCSV = () => {
    if (!rows) return;
    const hdr = [['Month', 'Invoices', 'Taxable Value', 'CGST Invoiced', 'SGST Invoiced', 'IGST Invoiced', 'Total GST', 'Gross Invoiced', 'Total Collected', 'Outstanding']];
    const data = rows.map((r) => [r.ym, r.invoiceCount, r.taxableValue, r.cgstInvoiced, r.sgstInvoiced, r.igstInvoiced, r.totalGst, r.grossInvoiced, r.totalCollected, r.outstanding]);
    download('gst_reconciliation.csv', toCSV([...hdr, ...data]));
    notify('Exported gst_reconciliation.csv');
  };

  if (!rows) return <div className="empty"><p>Loading GST reconciliation…</p></div>;
  const totals = rows.reduce((t, r) => ({
    taxableValue: t.taxableValue + r.taxableValue, cgst: t.cgst + r.cgstInvoiced, sgst: t.sgst + r.sgstInvoiced,
    igst: t.igst + r.igstInvoiced, grossInvoiced: t.grossInvoiced + r.grossInvoiced,
    totalCollected: t.totalCollected + r.totalCollected, outstanding: t.outstanding + r.outstanding
  }), { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, grossInvoiced: 0, totalCollected: 0, outstanding: 0 });

  return (
    <>
      <div className="kpirow" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi"><div className="kpi-l">Total taxable value</div><div className="kpi-v">{money0(totals.taxableValue)}</div></div>
        <div className="kpi"><div className="kpi-l">Total GST (CGST+SGST+IGST)</div><div className="kpi-v">{money0(totals.cgst + totals.sgst + totals.igst)}</div></div>
        <div className="kpi"><div className="kpi-l">Total collected</div><div className="kpi-v" style={{ color: 'var(--green)' }}>{money0(totals.totalCollected)}</div></div>
        <div className="kpi"><div className="kpi-l">Outstanding</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{money0(totals.outstanding)}</div></div>
      </div>
      <div className="panel">
        <div className="ph"><h3>GST Reconciliation — Month-wise</h3><button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Excel CSV</button></div>
        <div className="pb">
          {rows.length === 0 ? <EmptyMini text="No invoice data for GST reconciliation." /> : (
            <table>
              <thead><tr><th>Month</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Gross Inv.</th><th className="num">Collected</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ym}>
                    <td><b>{ymLabel(r.ym)}</b><div className="sub">{r.invoiceCount} invoices</div></td>
                    <td className="num">{money0(r.taxableValue)}</td>
                    <td className="num">{money0(r.cgstInvoiced)}</td>
                    <td className="num">{money0(r.sgstInvoiced)}</td>
                    <td className="num">{money0(r.igstInvoiced)}</td>
                    <td className="num strong">{money0(r.grossInvoiced)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{money0(r.totalCollected)}</td>
                    <td className="num" style={{ color: r.outstanding > 0 ? 'var(--amber)' : 'inherit' }}>{money0(r.outstanding)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)' }}>
                  <td>TOTAL</td>
                  <td className="num">{money0(totals.taxableValue)}</td>
                  <td className="num">{money0(totals.cgst)}</td>
                  <td className="num">{money0(totals.sgst)}</td>
                  <td className="num">{money0(totals.igst)}</td>
                  <td className="num">{money0(totals.grossInvoiced)}</td>
                  <td className="num">{money0(totals.totalCollected)}</td>
                  <td className="num">{money0(totals.outstanding)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/* ── TDS Reconciliation Page ── */
function TdsReconPage({ notify }) {
  const [data, setData] = useState(null);
  useEffect(() => { (async () => { try { setData(await api.reports.tdsRecon()); } catch (e) { notify(e.message, true); } })(); }, []); // eslint-disable-line

  const exportCSV = () => {
    if (!data) return;
    const hdr = [['Receipt No', 'Date', 'Invoice No', 'Type', 'Month', 'Brand', 'Amt Received', 'TDS %', 'TDS Deducted', 'Instrument', 'Ref']];
    const rows = data.rows.map((r) => [r.receiptNo, r.collDate, r.invoiceNo, r.invoiceType, r.ym, r.brandName, r.amtReceived, r.tdsPct, r.tdsDeducted, r.instrument, r.ref || '']);
    download('tds_reconciliation.csv', toCSV([...hdr, ...rows]));
    notify('Exported tds_reconciliation.csv');
  };

  if (!data) return <div className="empty"><p>Loading TDS reconciliation…</p></div>;
  return (
    <>
      <div className="kpirow" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="kpi"><div className="kpi-l">Total amount received</div><div className="kpi-v">{money0(data.totalAmtReceived)}</div></div>
        <div className="kpi"><div className="kpi-l">Total TDS deducted</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{money0(data.totalTdsDeducted)}</div></div>
      </div>
      <div className="panel">
        <div className="ph"><h3>TDS Deducted — Receipt-wise</h3><button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Excel CSV</button></div>
        <div className="pb">
          {data.rows.length === 0 ? <EmptyMini text="No TDS deductions recorded yet." /> : (
            <table>
              <thead><tr><th>Receipt</th><th>Invoice</th><th>Date</th><th>Brand</th><th>Month</th><th className="num">Amount</th><th className="num">TDS%</th><th className="num">TDS Amt</th><th>Instrument</th></tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td><span className="code">{r.receiptNo}</span></td>
                    <td><span className="code">{r.invoiceNo}</span></td>
                    <td className="sub">{fmtDate(r.collDate)}</td>
                    <td>{r.brandName}</td>
                    <td className="sub">{ymLabel(r.ym)}</td>
                    <td className="num">{money0(r.amtReceived)}</td>
                    <td className="num sub">{r.tdsPct}%</td>
                    <td className="num strong" style={{ color: 'var(--amber)' }}>{money0(r.tdsDeducted)}</td>
                    <td><Pill color="grey">{r.instrument}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Agreement Reconciliation Page ── */
function AgreementReconPage({ notify }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { (async () => { try { setRows(await api.reports.agreementRecon()); } catch (e) { notify(e.message, true); } })(); }, []); // eslint-disable-line

  const exportCSV = () => {
    if (!rows) return;
    const hdr = [['Lease', 'Brand', 'Unit', 'Start', 'End', 'Type', 'MG', 'MG Basis', 'RS%', 'CAM', 'GST%', 'SD', 'MG Billed', 'RS Billed', 'CAM Billed', 'Total Received', 'TDS Received']];
    const data = rows.map((r) => [r.leaseCode, r.brandName, r.unitName, r.startDate, r.endDate, r.rentalType, r.mg, r.mgBasis, r.revSharePct, r.cam, r.gst, r.deposit, r.mgBilled, r.rsBilled, r.camBilled, r.totalReceived, r.tdsReceived]);
    download('agreement_reconciliation.csv', toCSV([...hdr, ...data]));
    notify('Exported agreement_reconciliation.csv');
  };

  if (!rows) return <div className="empty"><p>Loading agreement reconciliation…</p></div>;
  return (
    <>
      <div className="panel">
        <div className="ph"><h3>Lease Terms vs Actual Billing</h3><button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Excel CSV</button></div>
        <div className="pb">
          {rows.length === 0 ? <EmptyMini text="No lease data yet." /> : (
            <table>
              <thead><tr><th>Brand / Unit</th><th>Type</th><th className="num">MG (agreed)</th><th className="num">MG Billed</th><th className="num">RS Billed</th><th className="num">CAM Billed</th><th className="num">Total Recd</th><th className="num">SD</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.leaseId}>
                    <td><b>{r.brandName}</b><div className="sub">{r.unitName} · {r.leaseCode}</div><div className="sub">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</div></td>
                    <td><RentTypePill t={r.rentalType} /></td>
                    <td className="num">{money0(r.mg)}{r.mgBasis === 'PerSqFt' ? '/sqft' : ''}</td>
                    <td className="num" style={{ color: r.mgBilled > 0 ? 'var(--green)' : 'var(--muted)' }}>{money0(r.mgBilled)}</td>
                    <td className="num">{money0(r.rsBilled)}</td>
                    <td className="num">{money0(r.camBilled)}</td>
                    <td className="num strong" style={{ color: 'var(--green)' }}>{money0(r.totalReceived)}</td>
                    <td className="num sub">{money0(r.deposit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Security Deposit Reconciliation Page ── */
function SdReconPage({ notify }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { (async () => { try { setRows(await api.reports.sdRecon()); } catch (e) { notify(e.message, true); } })(); }, []); // eslint-disable-line

  const exportCSV = () => {
    if (!rows) return;
    const hdr = [['Brand', 'Unit', 'Lease', 'SD Agreed', 'SD Collected', 'SD Adjusted', 'SD Balance']];
    const data = rows.map((r) => [r.brandName, r.unitName, r.leaseCode, r.sdAgreed, r.sdCollected, r.sdAdjusted, r.sdBalance]);
    download('sd_reconciliation.csv', toCSV([...hdr, ...data]));
    notify('Exported sd_reconciliation.csv');
  };

  if (!rows) return <div className="empty"><p>Loading SD reconciliation…</p></div>;
  const totals = rows.reduce((t, r) => ({ agreed: t.agreed + r.sdAgreed, collected: t.collected + r.sdCollected, adjusted: t.adjusted + r.sdAdjusted, balance: t.balance + r.sdBalance }), { agreed: 0, collected: 0, adjusted: 0, balance: 0 });

  return (
    <>
      <div className="kpirow" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi"><div className="kpi-l">SD Agreed</div><div className="kpi-v">{money0(totals.agreed)}</div></div>
        <div className="kpi"><div className="kpi-l">SD Collected</div><div className="kpi-v" style={{ color: 'var(--green)' }}>{money0(totals.collected)}</div></div>
        <div className="kpi"><div className="kpi-l">SD Adjusted</div><div className="kpi-v" style={{ color: 'var(--amber)' }}>{money0(totals.adjusted)}</div></div>
        <div className="kpi"><div className="kpi-l">SD Balance (held)</div><div className="kpi-v" style={{ color: 'var(--teal)' }}>{money0(totals.balance)}</div></div>
      </div>
      <div className="panel">
        <div className="ph"><h3>Security Deposit Reconciliation</h3><button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Excel CSV</button></div>
        <div className="pb">
          {rows.length === 0 ? <EmptyMini text="No security deposits recorded yet." /> : (
            <table>
              <thead><tr><th>Brand / Unit</th><th className="num">SD Agreed</th><th className="num">SD Collected</th><th className="num">SD Adjusted</th><th className="num">Balance Held</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.leaseId}>
                    <td><b>{r.brandName}</b><div className="sub">{r.unitName} · {r.leaseCode}</div></td>
                    <td className="num">{money0(r.sdAgreed)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{money0(r.sdCollected)}</td>
                    <td className="num" style={{ color: 'var(--amber)' }}>{money0(r.sdAdjusted)}</td>
                    <td className="num strong" style={{ color: 'var(--teal)' }}>{money0(r.sdBalance)}</td>
                    <td>{r.sdBalance <= 0 ? <Pill color="green">Fully adjusted</Pill> : r.sdAdjusted > 0 ? <Pill color="amber">Partially adjusted</Pill> : <Pill color="grey">Held</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
