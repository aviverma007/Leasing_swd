import React, { useState } from 'react';
import { api, setToken } from './api.js';

/* Site-plan motif: plot outlines with unit numbers, one unit lit in teal —
   drawn from the product's own subject (leasable commercial units). */
function SitePlan() {
  return (
    <svg className="login2-plan" viewBox="0 0 360 420" fill="none" aria-hidden="true">
      <g stroke="#3A4E78" strokeWidth="1.4">
        <rect x="24" y="22" width="150" height="96" rx="2" />
        <rect x="186" y="22" width="150" height="60" rx="2" />
        <rect x="186" y="94" width="72" height="96" rx="2" />
        <rect x="270" y="94" width="66" height="96" rx="2" />
        <rect x="24" y="130" width="70" height="60" rx="2" />
        <rect x="106" y="130" width="68" height="60" rx="2" />
        <rect x="24" y="202" width="312" height="52" rx="2" strokeDasharray="5 5" />
        <rect x="24" y="266" width="106" height="110" rx="2" />
        <rect x="246" y="266" width="90" height="110" rx="2" />
      </g>
      {/* the leased unit */}
      <rect x="142" y="266" width="92" height="110" rx="2" fill="rgba(14,148,136,.28)" stroke="#17B3A3" strokeWidth="1.8" />
      <g fill="#6D7FA0" fontFamily="IBM Plex Mono, monospace" fontSize="11">
        <text x="40" y="44">G-01</text>
        <text x="202" y="44">G-02</text>
        <text x="202" y="116">G-03</text>
        <text x="286" y="116">G-04</text>
        <text x="40" y="152">K-01</text>
        <text x="122" y="152">K-02</text>
        <text x="150" y="222">PASSAGE</text>
        <text x="40" y="288">F-01</text>
        <text x="262" y="288">F-03</text>
      </g>
      <g fontFamily="IBM Plex Mono, monospace" fontSize="11">
        <text x="158" y="288" fill="#5EEAD4">F-02</text>
        <text x="158" y="306" fill="#9FB3CF" fontSize="9">LEASED</text>
      </g>
      {/* dimension ticks */}
      <g stroke="#2C3D63" strokeWidth="1">
        <path d="M24 396 h312 M24 390 v12 M336 390 v12" />
      </g>
      <text x="158" y="412" fill="#5D6F92" fontFamily="IBM Plex Mono, monospace" fontSize="9">84.0 M</text>
    </svg>
  );
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    if (!username || !password) { setErr('Enter your username and password to continue.'); return; }
    setBusy(true);
    try {
      const { token, user } = await api.auth.login(username.trim(), password);
      setToken(token);
      onLogin(user, token);
    } catch (e2) {
      setErr(e2.message || 'Sign-in failed — check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login2">
      <div className="login2-hero">
        <div className="login2-brand">
          <img src="/smartworld-icon.png" alt="Smart World Developers" />
          <div>
            <h1>Smart Leasing</h1>
            <span>Smart World Developers</span>
          </div>
        </div>
        <div className="login2-tag">
          <h2>Every unit, every deed, every rupee — in one register.</h2>
          <p>From site plan to signed deed to GST-compliant invoice: the leasing
             lifecycle of our commercial assets, managed end to end with the
             reconciliations finance signs off on.</p>
        </div>
        <div className="login2-stats">
          <div><b>199</b><span>units on register</span></div>
          <div><b>42</b><span>live leases</span></div>
          <div><b>12</b><span>Excel reports</span></div>
        </div>
        <SitePlan />
      </div>

      <div className="login2-form">
        <div className="login2-card">
          <h3>Sign in</h3>
          <p className="sub2">Use the account IT shared with you.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Username or email</label>
              <input autoFocus value={username} placeholder="admin or your email"
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} placeholder="Your password"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && <div className="login-err">{err}</div>}
            <button className="btn btn-teal login-btn" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="login2-foot">Forgot your password? Ask IT — an admin resets it from
            User Master. New users are also created there.</p>
        </div>
      </div>
    </div>
  );
}
