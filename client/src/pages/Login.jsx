import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login(email, password);
      session.save(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card tiny">
      <h1>Staff login</h1>
      <p className="muted">For the HOD and the Admin Office.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
      <p className="muted center">New staff member? <Link to="/admin/register">Create your account</Link></p>
    </section>
  );
}
