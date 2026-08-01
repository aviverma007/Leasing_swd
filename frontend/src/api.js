const BASE = '/api';

let authToken = null;
export function setToken(t) { authToken = t; }
export function getToken() { return authToken; }

async function req(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && onAuthExpired) {
    authToken = null;
    onAuthExpired();
  }
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
    release: (id) => req('POST', `/leases/${id}/release`)
  },
  sales: crud('/sales'),
  invoices: {
    ...crud('/invoices'),
    generate: (ym, scope) => req('POST', '/invoices/generate', { ym, scope }),
    adhoc: (body) => req('POST', '/invoices/adhoc', body)
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
    log: () => req('GET', '/reports/log')
  },
  deletionRequests: {
    list: (status) => req('GET', '/deletion-requests' + (status ? `?status=${status}` : '')),
    pendingMap: () => req('GET', '/deletion-requests/pending-map'),
    count: () => req('GET', '/deletion-requests/count'),
    approve: (id, note) => req('POST', `/deletion-requests/${id}/approve`, { note }),
    reject: (id, note) => req('POST', `/deletion-requests/${id}/reject`, { note })
  }
};
