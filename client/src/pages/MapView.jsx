import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { catLabel, STATUS_LABEL } from '../api.js';

const PRIORITY_COLOR = { urgent: '#b42318', high: '#e8742a', medium: '#e0b21f', low: '#8e9bd0' };
const CLOSED_COLOR = '#9aa0b8';

// Popup content is built with DOM nodes + textContent so complaint text can never inject HTML.
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
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary small';
  btn.textContent = 'Open details';
  btn.addEventListener('click', () => onOpen(issue.id));
  box.append(title, meta, place, btn);
  return box;
}

export default function MapView({ issues, onOpen }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedKey = useRef('');
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const tagged = issues.filter((i) => i.lat != null && i.lng != null);
  const untagged = issues.length - tagged.length;

  useEffect(() => {
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const points = [];
    // Draw closed complaints first so open ones sit on top.
    const ordered = [...tagged].sort((a, b) => Number(isOpen(a)) - Number(isOpen(b)));
    for (const issue of ordered) {
      const open = isOpen(issue);
      const marker = L.circleMarker([issue.lat, issue.lng], {
        radius: open ? 11 : 8,
        color: '#ffffff',
        weight: 2,
        fillColor: open ? PRIORITY_COLOR[issue.priority] || PRIORITY_COLOR.medium : CLOSED_COLOR,
        fillOpacity: open ? 0.95 : 0.6,
      });
      marker.bindPopup(() => popupFor(issue, (id) => onOpenRef.current(id)));
      const tip = document.createElement('span'); // a DOM node, not a string, so Leaflet never parses it as HTML
      tip.textContent = issue.title;
      marker.bindTooltip(tip, { direction: 'top' });
      marker.addTo(layer);
      points.push([issue.lat, issue.lng]);
    }

    // Re-centre only when the set of complaints changes, so the 30 s auto-refresh does not undo panning.
    const key = tagged.map((i) => i.id).sort((a, b) => a - b).join(',');
    if (points.length && key !== fittedKey.current) {
      fittedKey.current = key;
      map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 18 });
    }
  }, [issues]); // eslint-disable-line react-hooks/exhaustive-deps

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

const isOpen = (i) => i.status === 'pending' || i.status === 'in_progress';
