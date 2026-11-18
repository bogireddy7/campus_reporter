import { useCallback, useEffect, useState } from 'react';
import MapView from './MapView.jsx';
import { api, catLabel, formatDate, mapLink, STATUS_LABEL } from '../api.js';

const ROLE_LABEL = { hod: 'Head of Department', office: 'Admin Office' };

export function Timeline({ items = [] }) {
  return (
    <ol className="timeline">
      {items.map((t, i) => (
        <li key={i}>
          <span className={`dot s-${t.status}`} />
          <div>
            <strong>{STATUS_LABEL[t.status]}</strong>
            <span className="muted"> · {t.author} · {formatDate(t.created_at)}</span>
            {t.note && <p>{t.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, tone, active, onClick }) {
  return (
    <button className={`stat ${tone || ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </button>
  );
}

function Detail({ id, onClose, onChanged }) {
  const [issue, setIssue] = useState(null);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await api.issue(id);
    setIssue(data);
    setStatus(data.status);
    setPriority(data.priority);
    setNote('');
  }, [id]);

  useEffect(() => { setIssue(null); load().catch((e) => setError(e.message)); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.updateIssue(id, { status, priority, note });
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        {!issue ? (
          <p>{error || 'Loading…'}</p>
        ) : (
          <>
            <div className="row between top">
              <div>
                <p className="muted">{issue.tracking_id} · {catLabel(issue)}</p>
                <h2>{issue.title}</h2>
              </div>
              <span className={`pill s-${issue.status}`}>{STATUS_LABEL[issue.status]}</span>
            </div>

            <a href={`/uploads/${issue.photo}`} target="_blank" rel="noreferrer">
              <img className="detail-photo" src={`/uploads/${issue.photo}`} alt={issue.title} />
            </a>

            <p className="desc">{issue.description}</p>

            <dl className="facts">
              <dt>Location</dt>
              <dd>
                {issue.location_text || '—'}
                {issue.lat != null && (
                  <>
                    <br />
                    <a href={mapLink(issue.lat, issue.lng)} target="_blank" rel="noreferrer">
                      📍 Open on map ({issue.lat.toFixed(5)}, {issue.lng.toFixed(5)})
                    </a>
                  </>
                )}
                {issue.lat == null && <span className="muted"> (no GPS tag)</span>}
              </dd>
              <dt>Reported by</dt>
              <dd>
                {issue.reporter_name}
                {issue.reporter_id ? ` (${issue.reporter_id})` : ''}
                {issue.reporter_contact && <><br />{issue.reporter_contact}{issue.reporter_verified ? <span className="vtag">✓ verified {issue.reporter_contact_type === 'email' ? 'email' : 'phone'}</span> : null}</>}
              </dd>
              <dt>Reported</dt>
              <dd>{formatDate(issue.created_at)}</dd>
            </dl>

            <form className="update-form" onSubmit={save}>
              <h3>Update this complaint</h3>
              <div className="grid2">
                <label className="field">
                  <span>Status</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Priority</span>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Note (visible to the reporter)</span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Plumber assigned, will be fixed by tomorrow" />
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save update'}</button>
            </form>

            <h3>History</h3>
            <Timeline items={issue.timeline} />
          </>
        )}
      </aside>
    </div>
  );
}

export default function Dashboard({ user }) {
  const [meta, setMeta] = useState({ categories: [], priorities: [] });
  const [stats, setStats] = useState(null);
  const [issues, setIssues] = useState([]);
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', q: '' });
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('list'); // list | map
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [list, s] = await Promise.all([api.issues(params), api.stats()]);
      setIssues(list);
      setStats(s);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const t = setInterval(refresh, 30000); // pick up new complaints automatically
    return () => clearInterval(t);
  }, [refresh]);

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const statusFilter = (s) => setFilters((f) => ({ ...f, status: f.status === s ? '' : s }));

  return (
    <section className="dash">
      <div className="row between">
        <div>
          <h1>{ROLE_LABEL[user.role]} dashboard</h1>
          <p className="muted">Welcome, {user.name}. All complaints appear here as soon as they are submitted.</p>
        </div>
        <button className="btn ghost" onClick={refresh}>Refresh</button>
      </div>

      {stats && (
        <div className="stats">
          <Stat label="All complaints" value={stats.total} active={!filters.status} onClick={() => setFilters((f) => ({ ...f, status: '' }))} />
          <Stat label="Pending" value={stats.byStatus.pending} tone="warn" active={filters.status === 'pending'} onClick={() => statusFilter('pending')} />
          <Stat label="In progress" value={stats.byStatus.in_progress} tone="info" active={filters.status === 'in_progress'} onClick={() => statusFilter('in_progress')} />
          <Stat label="Resolved" value={stats.byStatus.resolved} tone="good" active={filters.status === 'resolved'} onClick={() => statusFilter('resolved')} />
          <div className="stat alert">
            <span className="stat-value">{stats.urgentOpen}</span>
            <span className="stat-label">Urgent / high open</span>
          </div>
        </div>
      )}

      <div className="filters">
        <input placeholder="Search title, ID, name, place…" value={filters.q} onChange={setF('q')} />
        <select value={filters.category} onChange={setF('category')}>
          <option value="">All categories</option>
          {meta.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filters.priority} onChange={setF('priority')}>
          <option value="">Any priority</option>
          {meta.priorities.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      <div className="view-toggle" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>☰ List</button>
        <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>📍 Map</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {view === 'map' && !loading ? (
        <MapView issues={issues} onOpen={setOpenId} />
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : issues.length === 0 ? (
        <div className="empty">No complaints match these filters.</div>
      ) : (
        <ul className="issue-list">
          {issues.map((i) => (
            <li key={i.id} className={`issue p-${i.priority}`} onClick={() => setOpenId(i.id)}>
              <img src={`/uploads/${i.photo}`} alt="" loading="lazy" />
              <div className="issue-body">
                <div className="row between">
                  <strong>{i.title}</strong>
                  <span className={`pill s-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                </div>
                <p className="clip">{i.description}</p>
                <p className="meta">
                  <span className={`prio ${i.priority}`}>{i.priority}</span>
                  {catLabel(i)} · {i.location_text || (i.lat != null ? 'GPS tagged' : 'No location')}
                  {i.lat != null && ' 📍'} · {i.reporter_name} · {formatDate(i.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </section>
  );
}
