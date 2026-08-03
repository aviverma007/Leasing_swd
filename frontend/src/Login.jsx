import React, { useState } from 'react';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    if (!username || !password) { setErr('Enter username and password.'); return; }
    setBusy(true);
    try {
      const { token, user } = await api.auth.login(username.trim(), password);
      setToken(token);
      onLogin(user, token);
    } catch (e2) {
      setErr(e2.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <img className="logo-img" src="/smartworld-icon.png" alt="Smart World" />
          <div>
            <h1>SMART LEASING</h1>
            <span>Smart World Developers</span>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label>Username / Email</label>
            <input autoFocus value={username} placeholder="admin or your email"
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} placeholder="Your password"
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <div className="login-err">{err}</div>}
          <button className="btn btn-teal login-btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="login-hint">Admin signs in with the configured admin credentials. Other users are created inside the app under User Master.</p>
      </div>
    </div>
  );
}
