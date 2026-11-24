import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mapLink, reporterSession, session } from '../api.js';

const maskContact = (c) => `${c.slice(0, 3)} ${'•'.repeat(5)}${c.slice(-3)}`; // +91 •••••210

/* ---------- Step 1 + 2: confirm who you are ---------- */
function Verify({ onVerified }) {
  const [step, setStep] = useState('details'); // details | code
  const [form, setForm] = useState({ name: '', roll_no: '', contact: '' });
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null); // { contact, contact_type, delivery }
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState(null); // { sms, whatsapp } once the server has told us
  const [channel, setChannel] = useState('sms');

  useEffect(() => {
    api.meta().then((m) => {
      const c = m.otp_channels || { sms: true, whatsapp: false };
      setChannels(c);
      setChannel(c.sms ? 'sms' : 'whatsapp');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const sendCode = async (e, forcedChannel) => {
    e?.preventDefault?.();
    const via = typeof forcedChannel === 'string' ? forcedChannel : channel;
    setError('');
    setBusy(true);
    try {
      const res = await api.requestOtp({ ...form, channel: via });
      setChannel(via);
      setSent(res);
      setCode('');
      setCooldown(30);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.verifyOtp({ contact: sent.contact, code });
      reporterSession.save(data);
      onVerified(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card narrow">
      <div className="steps">
        <span className={`step ${step === 'details' ? 'on' : 'done'}`}><b>1</b> Your details</span>
        <span className="step-line" />
        <span className={`step ${step === 'code' ? 'on' : ''}`}><b>2</b> Confirm code</span>
        <span className="step-line" />
        <span className="step"><b>3</b> Report</span>
      </div>

      {step === 'details' ? (
        <form onSubmit={sendCode}>
          <h1>Verify yourself to report</h1>
          <p className="muted">
            To keep complaints genuine, we confirm your mobile number with a one-time code sent to your phone before you can report a problem.
          </p>
          <label className="field">
            <span>Full name *</span>
            <input value={form.name} onChange={set('name')} maxLength={80} required autoComplete="name" />
          </label>
          <label className="field">
            <span>Roll number / Staff ID *</span>
            <input value={form.roll_no} onChange={set('roll_no')} maxLength={40} required />
          </label>
          <label className="field">
            <span>Mobile number *</span>
            <div className="phone-input">
              <span className="phone-prefix">+91</span>
              <input
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value.replace(/[^\d+\s-]/g, '') }))}
                maxLength={16}
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
              />
            </div>
            <small className="hint">We will send a 6-digit code to this number by {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.</small>
          </label>
          {channels?.sms && channels?.whatsapp && (
            <div className="field">
              <span>Send my code by</span>
              <div className="channel-toggle" role="radiogroup" aria-label="How to receive the code">
                <button type="button" role="radio" aria-checked={channel === 'sms'} className={channel === 'sms' ? 'on' : ''} onClick={() => setChannel('sms')}>💬 SMS</button>
                <button type="button" role="radio" aria-checked={channel === 'whatsapp'} className={channel === 'whatsapp' ? 'on' : ''} onClick={() => setChannel('whatsapp')}>🟢 WhatsApp</button>
              </div>
            </div>
          )}
          {channels && !channels.sms && !channels.whatsapp && (
            <p className="notice">Phone verification is not set up on this site yet. Please ask the administrator to add the SMS or WhatsApp settings.</p>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary wide" disabled={busy || (channels && !channels.sms && !channels.whatsapp)}>{busy ? 'Sending code…' : 'Send verification code'}</button>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <h1>Enter the code</h1>
          <p className="muted">
            We sent a 6-digit code by {sent.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to <strong>{maskContact(sent.contact)}</strong>. It is valid for 10 minutes.
          </p>
          <label className="field">
            <span>Verification code</span>
            <input
              className="otp-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={6}
              required
              autoFocus
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify and continue'}</button>
          <div className="row between otp-links">
            <button type="button" className="link" onClick={() => { setStep('details'); setError(''); }}>← Change details</button>
            <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={() => sendCode(null, sent.channel)}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
          {channels?.sms && channels?.whatsapp && (
            <p className="otp-links center">
              Not getting it?{' '}
              <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={() => sendCode(null, sent.channel === 'sms' ? 'whatsapp' : 'sms')}>
                Send it by {sent.channel === 'sms' ? 'WhatsApp' : 'SMS'} instead
              </button>
            </p>
          )}
        </form>
      )}
    </section>
  );
}

/* ---------- Step 3: the complaint ---------- */
function ReportForm({ auth, onChangeUser }) {
  const [meta, setMeta] = useState({ categories: [], priorities: [] });
  const [form, setForm] = useState({
    title: '', description: '', category: 'Infrastructure', category_other: '', priority: 'medium', location_text: '',
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
  const { reporter, token } = auth;

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
    if (form.category === 'Other' && !form.category_other.trim()) return setError('Please type what kind of problem this is.');
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('photo', photo);
    if (geo) { body.append('lat', geo.lat); body.append('lng', geo.lng); }
    setBusy(true);
    try {
      const res = await api.submitIssue(body, token);
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
          <Link className="btn primary" to={`/track/${done}`}>Track this complaint</Link>
          <button className="btn ghost" onClick={() => window.location.reload()}>Report another</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card narrow">
      {!reporter.staff && (
        <div className="steps">
          <span className="step done"><b>✓</b> Your details</span>
          <span className="step-line done" />
          <span className="step done"><b>✓</b> Confirm code</span>
          <span className="step-line done" />
          <span className="step on"><b>3</b> Report</span>
        </div>
      )}

      <div className="verified">
        <span className="verified-badge">{reporter.staff ? '✓ Staff' : '✓ Verified'}</span>
        <div>
          <strong>{reporter.name}</strong> · {reporter.roll_no}
          <br />
          <span className="muted-inline">{reporter.staff ? 'Logged in, no verification needed' : maskContact(reporter.contact)}</span>
        </div>
        {!reporter.staff && <button type="button" className="link" onClick={onChangeUser}>Not you?</button>}
      </div>

      <h1>Report a campus problem</h1>
      <p className="muted">
        Take a photo, describe what is wrong and where. Your report goes straight to the HOD and Admin Office.
      </p>

      <form onSubmit={submit}>
        <div className="field">
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
        </div>

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

        {form.category === 'Other' && (
          <label className="field">
            <span>What kind of problem is this? *</span>
            <input value={form.category_other} onChange={set('category_other')} maxLength={60} required placeholder="e.g. Stray dogs, Wi-Fi, Parking" autoFocus />
          </label>
        )}

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

        {error && <p className="error-text">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
      </form>
    </section>
  );
}

export default function Report({ user }) {
  const [auth, setAuth] = useState(() => reporterSession.get());

  useEffect(() => {
    const expired = () => setAuth(null);
    window.addEventListener('cr-reporter-expired', expired);
    return () => window.removeEventListener('cr-reporter-expired', expired);
  }, []);

  // HOD / Admin Office are already logged in, so they report directly without an OTP.
  if (user && session.token) {
    const roll = user.role === 'hod' ? 'HOD' : 'Admin Office';
    return (
      <ReportForm
        auth={{ token: session.token, reporter: { name: user.name, roll_no: roll, contact: user.email, contact_type: 'email', staff: true } }}
        onChangeUser={() => {}}
      />
    );
  }
  if (!auth) return <Verify onVerified={setAuth} />;
  return <ReportForm auth={auth} onChangeUser={() => { reporterSession.clear(); setAuth(null); }} />;
}
