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
function popupFor(issue, onOpen) {
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
  const nav = document.createElement('a');
  nav.className = 'btn small nav-btn';
  nav.textContent = '➜ Navigate';
  nav.href = navLink(issue.lat, issue.lng);
  nav.target = '_blank';
  nav.rel = 'noopener noreferrer';
  actions.append(open, nav);
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
        infoRef.current.setContent(popupFor(issue, (id) => onOpenRef.current(id)));
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

  if (!mapsKey) {
    return <Fallback tagged={tagged} reason="The administrator needs to add a Google Maps key (GOOGLE_MAPS_API_KEY, see the README). Until then, use the Navigate buttons below." />;
  }
  if (problem) return <Fallback tagged={tagged} reason={problem} />;

  return (
    <div className="map-wrap">
      <div ref={elRef} className="map" role="region" aria-label="Map of geo-tagged complaints" />
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
