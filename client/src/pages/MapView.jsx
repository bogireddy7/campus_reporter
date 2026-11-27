import { useEffect, useRef, useState } from 'react';
import { catLabel, mapLink, navLink, STATUS_LABEL } from '../api.js';

const PRIORITY_COLOR = { urgent: '#b42318', high: '#e8742a', medium: '#e0b21f', low: '#8e9bd0' };
const CLOSED_COLOR = '#9aa0b8';
const isOpen = (i) => i.status === 'pending' || i.status === 'in_progress';

// Loads the Google Maps JavaScript API once.
let loader = null;
function loadGoogleMaps(key, onAuthFailure) {
  window.gm_authFailure = onAuthFailure; // Google calls this when the key is wrong / not allowed for this site
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  loader ??= new Promise((resolve, reject) => {
    window.__gmapsReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmapsReady&v=weekly`;
    s.async = true;
    s.onerror = () => { loader = null; s.remove(); reject(new Error('Could not load Google Maps. Check the internet connection.')); };
    document.head.appendChild(s);
  });
  return loader;
}

// Popup content is built from DOM nodes + textContent so complaint text can never inject HTML.
function popupFor(issue, onOpen, onDirections) {
  const box = document.createElement('div');
  box.className = 'map-popup';
  const title = document.createElement('strong');
  title.textContent = issue.title;
  const meta = document.createElement('div');
  meta.className = 'map-popup-meta';
  meta.textContent = `${STATUS_LABEL[issue.status]} · ${issue.priority} · ${catLabel(issue)}`;
  const place = document.createElement('div');
  place.className = 'map-popup-meta';
  place.textContent = issue.location_text || 'GPS tagged';
  const actions = document.createElement('div');
  actions.className = 'map-popup-actions';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn primary small';
  open.textContent = 'Open details';
  open.addEventListener('click', () => onOpen(issue.id));
  const dir = document.createElement('button');
  dir.type = 'button';
  dir.className = 'btn small dir-btn';
  dir.textContent = '🧭 Directions';
  dir.addEventListener('click', () => onDirections(issue));
  const nav = document.createElement('a');
  nav.className = 'btn small nav-btn';
  nav.textContent = '➜ Navigate';
  nav.href = navLink(issue.lat, issue.lng);
  nav.target = '_blank';
  nav.rel = 'noopener noreferrer';
  actions.append(open, dir, nav);
  box.append(title, meta, place, actions);
  return box;
}

/** Shown when no Google Maps key is set up yet: the located complaints with Google Maps / Navigate links. */
function Fallback({ tagged, reason }) {
  return (
    <div className="map-fallback">
      <strong>The map is not switched on yet.</strong>
      <p className="muted">{reason}</p>
      {tagged.length > 0 && (
        <ul>
          {tagged.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.title}</strong>
                <br />
                <span className="muted-inline">{i.location_text || 'GPS tagged'} · {i.priority}</span>
              </span>
              <span className="row-actions">
                <a className="btn small" href={mapLink(i.lat, i.lng)} target="_blank" rel="noreferrer">View</a>
                <a className="btn small nav-btn" href={navLink(i.lat, i.lng)} target="_blank" rel="noreferrer">➜ Navigate</a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MapView({ issues, onOpen, mapsKey }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoRef = useRef(null);
  const fittedKey = useRef('');
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const rendererRef = useRef(null);
  const [route, setRoute] = useState(null); // { issue, mode, state: 'locating'|'loading'|'ok'|'error', info, steps, error }
  const startDirections = (issue) => setRoute({ issue, mode: 'WALKING', state: 'locating' });
  const startRef = useRef(startDirections);
  startRef.current = startDirections;
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState('');

  const tagged = issues.filter((i) => i.lat != null && i.lng != null);
  const untagged = issues.length - tagged.length;

  // Create the map once.
  useEffect(() => {
    if (!mapsKey) return undefined;
    let cancelled = false;
    loadGoogleMaps(mapsKey, () => setProblem('Google rejected the map key. Check that "Maps JavaScript API" is enabled for it and that billing is active on the Google Cloud project.'))
      .then((maps) => {
        if (cancelled || !elRef.current) return;
        mapRef.current = new maps.Map(elRef.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        infoRef.current = new maps.InfoWindow();
        setReady(true);
      })
      .catch((e) => !cancelled && setProblem(e.message));
    return () => { cancelled = true; };
  }, [mapsKey]);

  // Draw / refresh the pins.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const maps = window.google.maps;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const points = [];
    // Closed complaints first so open ones sit on top.
    const ordered = [...tagged].sort((a, b) => Number(isOpen(a)) - Number(isOpen(b)));
    for (const issue of ordered) {
      const open = isOpen(issue);
      const marker = new maps.Marker({
        map: mapRef.current,
        position: { lat: issue.lat, lng: issue.lng },
        title: issue.title, // plain text tooltip
        zIndex: open ? 2 : 1,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: open ? 11 : 8,
          fillColor: open ? PRIORITY_COLOR[issue.priority] || PRIORITY_COLOR.medium : CLOSED_COLOR,
          fillOpacity: open ? 0.95 : 0.6,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      marker.addListener('click', () => {
        infoRef.current.setContent(popupFor(issue, (id) => onOpenRef.current(id), (i) => startRef.current(i)));
        infoRef.current.open({ map: mapRef.current, anchor: marker });
      });
      markersRef.current.push(marker);
      points.push({ lat: issue.lat, lng: issue.lng });
    }

    // Re-centre only when the set of complaints changes, so the 30 s auto-refresh does not undo panning.
    const key = tagged.map((i) => i.id).sort((a, b) => a - b).join(',');
    if (points.length && key !== fittedKey.current) {
      fittedKey.current = key;
      const bounds = new maps.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 60);
      if (points.length === 1) mapRef.current.setZoom(17);
    }
  }, [issues, ready]); // eslint-disable-line react-hooks/exhaustive-deps


  // Directions: from the viewer's current location to the complaint, drawn on the map with step-by-step text.
  const originRef = useRef(null);
  useEffect(() => {
    if (!ready || !route) return undefined;
    const maps = window.google.maps;
    let cancelled = false;
    const fail = (error) => !cancelled && setRoute((r) => r && { ...r, state: 'error', error });

    const compute = (origin) => {
      setRoute((r) => r && { ...r, state: 'loading' });
      new maps.DirectionsService().route(
        { origin, destination: { lat: route.issue.lat, lng: route.issue.lng }, travelMode: maps.TravelMode[route.mode] },
        (result, status) => {
          if (cancelled) return;
          if (status !== 'OK') {
            fail(
              status === 'ZERO_RESULTS'
                ? 'No route found between your location and this place for this travel mode. Try the other mode.'
                : status === 'REQUEST_DENIED' || status === 'UNKNOWN_ERROR'
                  ? 'Google refused the directions request. In Google Cloud, enable "Directions API" for this key (and make sure billing is on).'
                  : `Could not get directions (${status}).`
            );
            return;
          }
          if (!rendererRef.current) rendererRef.current = new maps.DirectionsRenderer({ map: mapRef.current, suppressMarkers: false });
          rendererRef.current.setMap(mapRef.current);
          rendererRef.current.setDirections(result);
          const leg = result.routes[0].legs[0];
          // Google gives each step as HTML; keep only its text so nothing can be injected.
          const text = (h) => new DOMParser().parseFromString(h, 'text/html').body.textContent;
          setRoute((r) => r && {
            ...r, state: 'ok', info: { distance: leg.distance.text, duration: leg.duration.text, from: leg.start_address },
            steps: leg.steps.map((st) => ({ text: text(st.instructions), distance: st.distance.text })),
          });
        }
      );
    };

    if (originRef.current) compute(originRef.current);
    else if (!navigator.geolocation) fail('This browser cannot share your location. Use the Navigate button instead.');
    else {
      navigator.geolocation.getCurrentPosition(
        (pos) => { originRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; if (!cancelled) compute(originRef.current); },
        (err) => fail(err.code === 1
          ? 'Location permission was denied. Allow location for this site in your browser, then try again. (Or use the Navigate button.)'
          : 'Could not find your location. Use the Navigate button, which asks Google Maps for the start point.'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    }
    return () => { cancelled = true; };
  }, [route?.issue?.id, route?.mode, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearRoute = () => { rendererRef.current?.setMap(null); setRoute(null); };

  if (!mapsKey) {
    return <Fallback tagged={tagged} reason="The administrator needs to add a Google Maps key (GOOGLE_MAPS_API_KEY, see the README). Until then, use the Navigate buttons below." />;
  }
  if (problem) return <Fallback tagged={tagged} reason={problem} />;

  return (
    <div className="map-wrap">
      <div ref={elRef} className="map" role="region" aria-label="Map of geo-tagged complaints" />
      {route && (
        <div className="dir-panel" role="region" aria-label="Directions">
          <div className="dir-head">
            <strong>Directions to {route.issue.title}</strong>
            <button type="button" className="link" onClick={clearRoute}>✕ Close</button>
          </div>
          <div className="channel-toggle" role="radiogroup" aria-label="Travel mode">
            {[['WALKING', '🚶 Walk'], ['DRIVING', '🚗 Drive'], ['BICYCLING', '🚲 Cycle']].map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={route.mode === m} className={route.mode === m ? 'on' : ''}
                onClick={() => setRoute((r) => ({ ...r, mode: m, state: 'loading' }))}>{label}</button>
            ))}
          </div>
          {(route.state === 'locating' || route.state === 'loading') && (
            <p className="waiting" role="status"><span className="spinner" aria-hidden="true" />{route.state === 'locating' ? 'Finding your location… allow it if your browser asks.' : 'Getting the route…'}</p>
          )}
          {route.state === 'error' && (
            <p className="error-text">{route.error}{' '}
              <a href={navLink(route.issue.lat, route.issue.lng)} target="_blank" rel="noreferrer">Open in Google Maps ➜</a></p>
          )}
          {route.state === 'ok' && (
            <>
              <p className="dir-summary"><strong>{route.info.duration}</strong> · {route.info.distance}</p>
              <ol className="dir-steps">
                {route.steps.map((st, i) => <li key={i}>{st.text} <span className="muted-inline">({st.distance})</span></li>)}
              </ol>
              <a className="btn small nav-btn" href={navLink(route.issue.lat, route.issue.lng)} target="_blank" rel="noreferrer">➜ Start navigation in Google Maps</a>
            </>
          )}
        </div>
      )}
      <div className="map-legend">
        <span><i style={{ background: PRIORITY_COLOR.urgent }} /> Urgent</span>
        <span><i style={{ background: PRIORITY_COLOR.high }} /> High</span>
        <span><i style={{ background: PRIORITY_COLOR.medium }} /> Medium</span>
        <span><i style={{ background: PRIORITY_COLOR.low }} /> Low</span>
        <span><i style={{ background: CLOSED_COLOR }} /> Resolved / rejected</span>
      </div>
      <p className="muted">
        {tagged.length} complaint{tagged.length === 1 ? '' : 's'} on the map
        {untagged > 0 && ` · ${untagged} without a GPS tag (see the list view)`}
      </p>
    </div>
  );
}
