import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mapLink } from '../api.js';

export default function Report() {
  const [meta, setMeta] = useState({ categories: [], priorities: [] });
  const [form, setForm] = useState({
    title: '', description: '', category: 'Infrastructure', priority: 'medium',
    location_text: '', reporter_name: '', reporter_id: '', reporter_contact: '',
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [geo, setGeo] = useState(null); // { lat, lng, accuracy }
  const [geoState, setGeoState] = useState('idle'); // idle | loading | error
  const [geoError, setGeoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoState('error');
      setGeoError('This browser does not support location. Please type the place below.');
      return;
    }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoState('idle');
      },
      (err) => {
        setGeoState('error');
        setGeoError(
          err.code === 1
            ? 'Location permission was denied. Allow it in your browser, or type the place below.'
            : 'Could not get your location. Please type the place below.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!photo) return setError('Please add a photo of the problem.');
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('photo', photo);
    if (geo) { body.append('lat', geo.lat); body.append('lng', geo.lng); }
    setBusy(true);
    try {
      const res = await api.submitIssue(body);
      setDone(res.tracking_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="card narrow center">
        <div className="check">✓</div>
        <h1>Complaint submitted</h1>
        <p>The HOD and Admin Office can now see it on their dashboards.</p>
        <p className="muted">Save your tracking ID to follow progress:</p>
        <div className="tid">{done}</div>
        <div className="row center-row">
          <Link className="btn" to={`/track/${done}`}>Track this complaint</Link>
          <button className="btn ghost" onClick={() => window.location.reload()}>Report another</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h1>Report a campus problem</h1>
      <p className="muted">
        Take a photo, describe what is wrong and where. Your report goes straight to the HOD and Admin Office.
      </p>

      <form onSubmit={submit}>
        <label className="field">
          <span>Photo of the problem *</span>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={pickPhoto} hidden />
          {preview ? (
            <div className="photo-wrap">
              <img src={preview} alt="Selected problem" className="photo-preview" />
              <button type="button" className="btn ghost small" onClick={() => fileRef.current.click()}>Retake / change</button>
            </div>
          ) : (
            <button type="button" className="photo-drop" onClick={() => fileRef.current.click()}>
              <span className="big">📷</span>
              Tap to take or choose a photo
            </button>
          )}
        </label>

        <label className="field">
          <span>Short title *</span>
          <input value={form.title} onChange={set('title')} maxLength={120} required placeholder="e.g. Water leakage near Block B washroom" />
        </label>

        <div className="grid2">
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={set('category')}>
              {meta.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>How urgent?</span>
            <select value={form.priority} onChange={set('priority')}>
              {meta.priorities.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Describe the problem *</span>
          <textarea rows={4} value={form.description} onChange={set('description')} maxLength={2000} required placeholder="What is wrong, since when, and who it affects" />
        </label>

        <div className="field">
          <span>Location</span>
          <div className="geo-box">
            <button type="button" className="btn small" onClick={locate} disabled={geoState === 'loading'}>
              {geoState === 'loading' ? 'Getting location…' : geo ? '📍 Update my location' : '📍 Tag my current location'}
            </button>
            {geo && (
              <span className="geo-ok">
                Tagged ({geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}) ±{Math.round(geo.accuracy)} m ·{' '}
                <a href={mapLink(geo.lat, geo.lng)} target="_blank" rel="noreferrer">check on map</a>
                {' · '}
                <button type="button" className="link" onClick={() => setGeo(null)}>remove</button>
              </span>
            )}
            {geoState === 'error' && <span className="error-text">{geoError}</span>}
          </div>
          <input value={form.location_text} onChange={set('location_text')} maxLength={200} placeholder="Block / room / landmark (e.g. CSE Block, 2nd floor corridor)" />
        </div>

        <fieldset>
          <legend>Your details</legend>
          <div className="grid2">
            <label className="field">
              <span>Name *</span>
              <input value={form.reporter_name} onChange={set('reporter_name')} maxLength={80} required />
            </label>
            <label className="field">
              <span>Roll no. / Staff ID</span>
              <input value={form.reporter_id} onChange={set('reporter_id')} maxLength={40} />
            </label>
          </div>
          <label className="field">
            <span>Phone or email (so staff can reach you)</span>
            <input value={form.reporter_contact} onChange={set('reporter_contact')} maxLength={80} />
          </label>
        </fieldset>

        {error && <p className="error-text">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
      </form>
    </section>
  );
}
