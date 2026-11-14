import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session } from '../api.js';

export default function Register({ onLogin }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'hod', password: '', confirm: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { confirm, ...body } = form;
      const { token, user } = await api.register(body);
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
      <h1>Create staff account</h1>
      <p className="muted">
        For the HOD and the Admin Office. You need the staff access code from whoever runs this system.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>I am the</span>
          <select value={form.role} onChange={set('role')}>
            <option value="hod">HOD (Head of Department)</option>
            <option value="office">Admin Office</option>
          </select>
        </label>
        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={set('name')} maxLength={80} required autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="username" />
        </label>
        <label className="field">
          <span>Password (min 8 characters)</span>
          <input type="password" value={form.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" value={form.confirm} onChange={set('confirm')} minLength={8} required autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Staff access code</span>
          <input value={form.code} onChange={set('code')} required autoComplete="off" placeholder="e.g. 9F3A1C7D" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="muted center">Already have an account? <Link to="/admin/login">Log in</Link></p>
    </section>
  );
}
