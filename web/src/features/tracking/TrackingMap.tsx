/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import type { TrackingDriver } from '../../types';
import { useI18n } from '../../i18n';
import { createHtmlMarker, escapeHtml, type HtmlMarker } from '../map/googleMaps';
import { useGoogleMap, useMapLayers } from '../map/useGoogleMap';
import { FRESHNESS_COLOR, freshnessOf } from './freshness';

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

const GLIDE_MS = 2800; // a marker slides to its new position over (a bit less than) the poll interval

function pinHtml(d: TrackingDriver, selected: boolean): string {
  const level = freshnessOf(d.ageSeconds);
  const color = FRESHNESS_COLOR[level];
  const speed = level === 'live' && d.speedKmh != null && d.speedKmh >= 3 ? ` • ${Math.round(d.speedKmh)} كم/س` : '';
  const arrow =
    level === 'live' && d.heading != null
      ? `<svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${d.heading}deg);flex:none"><path d="M12 2 20 21l-8-4-8 4Z" fill="#fff"/></svg>`
      : `<span style="width:8px;height:8px;border-radius:50%;background:#fff;flex:none"></span>`;
  return `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="display:flex;align-items:center;gap:6px;background:${color};color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;border:2px solid ${selected ? '#1d4ed8' : '#fff'};box-shadow:0 3px 10px rgba(0,0,0,.4);${level === 'live' ? 'animation:drvPulse 2s infinite' : 'opacity:.9'}">
      ${arrow}<span>${escapeHtml(d.name)}${speed}</span>
    </div>
    <div style="width:2px;height:10px;background:${color}"></div></div>`;
}

/** Live map of the drivers: one persistent marker each, gliding to every new position. */
export function TrackingMap({ drivers, selectedId, followId, onSelect, fitSignal, traffic, className }: TrackingMapProps) {
  const { dir } = useI18n();
  const gm = useGoogleMap();
  const { mapRef, gRef, ready } = gm;
  useMapLayers(gm, { traffic });
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
      const html = pinHtml(d, d.id === selectedId);
      const cur = markers.current.get(d.id);
      if (!cur) {
        const marker = createHtmlMarker(g, { lat: d.lat, lng: d.lng }, html, () => onSelectRef.current(d.id));
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
      <div className={`flex items-center justify-center rounded-2xl border border-dashed border-border bg-surface2 p-6 text-center text-sm text-muted ${className ?? ''}`}>
        {gm.error ? `تعذّر تحميل الخريطة: ${gm.error}` : 'خريطة Google غير مفعّلة بعد'}
      </div>
    );
  }
  return <div ref={gm.divRef} className={`overflow-hidden rounded-2xl border border-border ${className ?? ''}`} data-testid="tracking-map" />;
}
