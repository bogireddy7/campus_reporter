import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, STATUS_LABEL } from '../api.js';
import { Timeline } from './Dashboard.jsx';

export default function Track() {
  const { tid } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(tid || '');
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tid) { setIssue(null); return; }
    setError('');
    api.track(tid).then(setIssue).catch((e) => { setIssue(null); setError(e.message); });
  }, [tid]);

  const go = (e) => {
    e.preventDefault();
    if (input.trim()) navigate(`/track/${input.trim().toUpperCase()}`);
  };

  return (
    <section className="card narrow">
      <h1>Track a complaint</h1>
      <form className="row" onSubmit={go}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tracking ID, e.g. CR-7K2M9P" />
        <button className="btn primary">Check</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {issue && (
        <div className="track-result">
          <div className="row between">
            <h2>{issue.title}</h2>
            <span className={`pill s-${issue.status}`}>{STATUS_LABEL[issue.status]}</span>
          </div>
          <p className="muted">
            {issue.tracking_id} · {issue.category}
            {issue.location_text ? ` · ${issue.location_text}` : ''} · reported {formatDate(issue.created_at)}
          </p>
          <h3>Progress</h3>
          <Timeline items={issue.timeline} />
        </div>
      )}
    </section>
  );
}
