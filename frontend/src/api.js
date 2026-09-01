const BASE = '/api';
const TOKEN_KEY = 'scoopsense_token';

let authToken = (() => {
  try { return sessionStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
})();

export function setToken(t) {
  authToken = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* storage unavailable */ }
}
export function getToken() { return authToken; }

async function req(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && onAuthExpired) { authToken = null; onAuthExpired(); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let onAuthExpired = null;
export function setAuthExpiredHandler(fn) { onAuthExpired = fn; }

const crud = (path) => ({
  list: () => req('GET', path),
  create: (body) => req('POST', path, body),
  update: (id, body) => req('PUT', `${path}/${id}`, body),
  remove: (id, reason) => req('DELETE', `${path}/${id}`, reason ? { reason } : undefined)
});

export const api = {
  health: () => req('GET', '/health'),
  auth: {
    login: (username, password) => req('POST', '/auth/login', { username, password }),
    me: () => req('GET', '/auth/me')
  },
  companies: crud('/companies'),
  assets: crud('/assets'),
  blocks: crud('/blocks'),
  units: crud('/units'),
  brands: crud('/brands'),
  users: crud('/users'),
  leases: {
    ...crud('/leases'),
    hold: (id, remarks) => req('POST', `/leases/${id}/hold`, { remarks }),
    setAlerts: (id, enabled) => req('POST', `/leases/${id}/alerts`, { enabled }),
    release: (id) => req('POST', `/leases/${id}/release`)
  },
  sales: crud('/sales'),
  invoices: {
    ...crud('/invoices'),
    generate: (ym, scope) => req('POST', '/invoices/generate', { ym, scope }),
    generatePool: (ym, leaseIds, desc) => req('POST', '/invoices/generate-pool', { ym, leaseIds, desc }),
    adhoc: (body) => req('POST', '/invoices/adhoc', body),
    print: (id) => req('GET', `/invoices/${id}/print`),
    sdAdjust: (id, sdAdjAmt, note) => req('POST', `/invoices/${id}/sd-adjust`, { sdAdjAmt, note })
  },
  collections: crud('/collections'),
  investorUnits: {
    ...crud('/investor-units'),
    approve: (id, actingRole) => req('POST', `/investor-units/${id}/approve`, { actingRole })
  },
  disbursement: {
    candidates: (ym) => req('GET', `/disbursement/candidates?ym=${ym}`),
    list: () => req('GET', '/disbursement'),
    process: (body) => req('POST', '/disbursement/process', body),
    approve: (id, actingRole) => req('POST', `/disbursement/${id}/approve`, { actingRole }),
    void: (id, reason) => req('POST', `/disbursement/${id}/void`, { reason })
  },
  reports: {
    summary: () => req('GET', '/reports/summary'),
    sapEntries: () => req('GET', '/reports/sap-entries'),
    log: () => req('GET', '/reports/log'),
    gstRecon: () => req('GET', '/reports/gst-recon'),
    tdsRecon: () => req('GET', '/reports/tds-recon'),
    agreementRecon: () => req('GET', '/reports/agreement-recon'),
    sdRecon: () => req('GET', '/reports/sd-recon'),
    alerts: () => req('GET', '/reports/alerts')
  },
  deletionRequests: {
    list: (status) => req('GET', '/deletion-requests' + (status ? `?status=${status}` : '')),
    pendingMap: () => req('GET', '/deletion-requests/pending-map'),
    count: () => req('GET', '/deletion-requests/count'),
    approve: (id, note) => req('POST', `/deletion-requests/${id}/approve`, { note }),
    reject: (id, note) => req('POST', `/deletion-requests/${id}/reject`, { note })
  },
  userAdmin: {
    meta: (id) => req('GET', `/user-admin/${id}/meta`),
    resetPassword: (id, newPassword) => req('POST', `/user-admin/${id}/reset-password`, { newPassword })
  }
};
