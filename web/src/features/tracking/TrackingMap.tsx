/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { TrackingDriver } from '../../types';
import { useI18n } from '../../i18n';
import { createHtmlMarker, escapeHtml, type HtmlMarker } from '../map/googleMaps';
import { useGoogleMap, useMapLayers } from '../map/useGoogleMap';
import { ageLabel, FRESHNESS_COLOR, freshnessOf } from './freshness';
import { plateLetters } from './plate';

interface TrackingMapProps {
  drivers: TrackingDriver[];
  selectedId: string | null;
  /** Keep the map centered on this driver as they move. */
  followId: string | null;
  onSelect: (id: string) => void;
  /** Changing this value refits the map to every located driver. */
  fitSignal: number;
  traffic?: boolean;
  className?: string;
}

export interface TrackingMapHandle {
  zoomBy: (delta: number) => void;
}

const GLIDE_MS = 2800; // a marker slides to its new position over (a bit less than) the poll interval

/**
 * A car seen from above, pointing where it is heading, with just the letters of its plate under it
 * (e.g. MPV): enough to tell the cars apart. The driver's name is in the list and on selection.
 */
function carHtml(d: TrackingDriver, selected: boolean): string {
  const level = freshnessOf(d.ageSeconds);
  const color = FRESHNESS_COLOR[level];
  const letters = escapeHtml(plateLetters(d.vehicle?.plate, d.name));
  // A car that has gone quiet is drawn grey with how long ago it was last heard (not live, not a guess).
  const quietFor = level === 'stale' && d.ageSeconds != null ? escapeHtml(ageLabel(d.ageSeconds)) : '';
  const heading = level === 'live' || level === 'recent' ? (d.heading ?? 0) : 0;
  const ring = selected
    ? '<div style="position:absolute;inset:-9px;border-radius:50%;border:3px solid #2563eb;background:rgba(37,99,235,.12)"></div>'
    : level === 'live'
      ? '<div style="position:absolute;inset:-4px;border-radius:50%;animation:drvPulse 2s infinite"></div>'
      : '';
  return `<div style="position:relative;width:28px;height:46px;opacity:${level === 'stale' || level === 'none' ? 0.8 : 1}">
    ${ring}
    <svg viewBox="0 0 28 46" width="28" height="46" style="position:relative;transform:rotate(${heading}deg);transition:transform .6s linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">
      <rect x="1" y="9" width="4" height="9" rx="1.5" fill="#1f2937"/><rect x="23" y="9" width="4" height="9" rx="1.5" fill="#1f2937"/>
      <rect x="1" y="29" width="4" height="9" rx="1.5" fill="#1f2937"/><rect x="23" y="29" width="4" height="9" rx="1.5" fill="#1f2937"/>
      <rect x="3.5" y="2" width="21" height="42" rx="9" fill="${color}" stroke="#fff" stroke-width="2"/>
      <path d="M7 14Q14 9 21 14L19.5 20H8.5Z" fill="#dbeafe"/>
      <rect x="8.5" y="22" width="11" height="9" rx="2" fill="${color}" stroke="#fff" stroke-opacity=".55"/>
      <path d="M8.5 33H19.5L21 37Q14 40 7 37Z" fill="#dbeafe"/>
      <circle cx="8.5" cy="4.6" r="1.6" fill="#fde047"/><circle cx="19.5" cy="4.6" r="1.6" fill="#fde047"/>
    </svg>
    <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;background:#0f172a;color:#fff;border:2px solid ${selected ? '#2563eb' : color};border-radius:8px;padding:1px 7px;font:800 12px/16px system-ui,sans-serif;letter-spacing:.5px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.45)">${letters}</div>${quietFor ? `<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:25px;background:rgba(255,255,255,.95);color:#374151;border-radius:6px;padding:0 6px;font:700 10px/15px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${quietFor}</div>` : ''}
  </div>`;
}

/** Live map of the drivers: one persistent marker each, gliding to every new position. */
export const TrackingMap = forwardRef<TrackingMapHandle, TrackingMapProps>(function TrackingMap(
  { drivers, selectedId, followId, onSelect, fitSignal, traffic, className },
  handle,
) {
  const { dir } = useI18n();
  const gm = useGoogleMap({ disableDefaultUI: true });
  const { mapRef, gRef, ready } = gm;
  useMapLayers(gm, { traffic });
  useImperativeHandle(handle, () => ({ zoomBy: (d) => gm.mapRef.current?.setZoom((gm.mapRef.current.getZoom() ?? 12) + d) }), [gm.mapRef]);
  const markers = useRef(new Map<string, { marker: HtmlMarker; html: string; lat: number; lng: number }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The pulse animation for live drivers.
  useEffect(() => {
    if (document.getElementById('drv-pulse-style')) return;
    const st = document.createElement('style');
    st.id = 'drv-pulse-style';
    st.textContent = '@keyframes drvPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.55)}100%{box-shadow:0 0 0 12px rgba(22,163,74,0)}}';
    document.head.appendChild(st);
  }, []);

  // Markers: create, move (smoothly), restyle, remove.
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g) return;
    const seen = new Set<string>();
    for (const d of drivers) {
      if (d.lat == null || d.lng == null) continue;
      seen.add(d.id);
      const html = carHtml(d, d.id === selectedId);
      const cur = markers.current.get(d.id);
      if (!cur) {
        const marker = createHtmlMarker(g, { lat: d.lat, lng: d.lng }, html, () => onSelectRef.current(d.id), 'center');
        marker.setMap(map);
        markers.current.set(d.id, { marker, html, lat: d.lat, lng: d.lng });
        continue;
      }
      if (cur.html !== html) {
        const el = cur.marker.element();
        if (el) el.innerHTML = html;
        cur.html = html;
      }
      if (cur.lat !== d.lat || cur.lng !== d.lng) {
        const el = cur.marker.element();
        if (el) {
          el.style.transition = `left ${GLIDE_MS}ms linear, top ${GLIDE_MS}ms linear`;
          setTimeout(() => {
            el.style.transition = '';
          }, GLIDE_MS + 50);
        }
        cur.marker.setPosition({ lat: d.lat, lng: d.lng });
        cur.lat = d.lat;
        cur.lng = d.lng;
      }
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.marker.setMap(null);
        markers.current.delete(id);
      }
    }
  }, [drivers, selectedId, ready, dir, mapRef, gRef]);

  // Following one driver.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followId) return;
    const d = drivers.find((x) => x.id === followId);
    if (d?.lat != null && d.lng != null) map.panTo({ lat: d.lat, lng: d.lng });
  }, [drivers, followId, mapRef]);

  // Fit to everyone (first time, and whenever asked).
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g) return;
    const located = drivers.filter((d) => d.lat != null && d.lng != null);
    if (!located.length) return;
    const bounds = new g.maps.LatLngBounds();
    located.forEach((d) => bounds.extend({ lat: d.lat as number, lng: d.lng as number }));
    if (located.length === 1) {
      map.setCenter({ lat: located[0].lat as number, lng: located[0].lng as number });
      map.setZoom(15);
    } else map.fitBounds(bounds, 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, ready, drivers.some((d) => d.lat != null)]);

  // Focus on a chosen driver.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const d = drivers.find((x) => x.id === selectedId);
    if (d?.lat != null && d.lng != null) {
      map.panTo({ lat: d.lat, lng: d.lng });
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(
    () => () => {
      markers.current.forEach((m) => m.marker.setMap(null));
      markers.current.clear();
    },
    [],
  );

  if (gm.keyMissing || gm.error) {
    return (
      <div className={`flex items-center justify-center bg-surface2 p-6 text-center text-sm text-muted ${className ?? ''}`}>
        {gm.error ? `تعذّر تحميل الخريطة: ${gm.error}` : 'خريطة Google غير مفعّلة بعد'}
      </div>
    );
  }
  return <div ref={gm.divRef} className={className} data-testid="tracking-map" />;
});
