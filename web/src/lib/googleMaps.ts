// Google Maps JavaScript API loader + small helpers shared by every map in the app.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
    __gmapReady?: () => void;
  }
}

export type LatLng = { lat: number; lng: number };

// Istanbul: default map center and default demo waypoints.
export const ISTANBUL_CENTER: LatLng = { lat: 41.0082, lng: 28.9784 };
export const DEFAULT_ORIGIN = { label: 'مطار إسطنبول', coord: { lat: 41.2753, lng: 28.7519 } };
export const DEFAULT_DESTINATION = { label: 'ميدان تقسيم، إسطنبول', coord: { lat: 41.037, lng: 28.9851 } };

let scriptPromise: Promise<any> | null = null;
let loadedKey = '';

export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps && loadedKey === key) return Promise.resolve(window.google);
  if (scriptPromise && loadedKey === key) return scriptPromise;
  loadedKey = key;
  scriptPromise = new Promise((resolve, reject) => {
    window.__gmapReady = () => resolve(window.google);
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&callback=__gmapReady&language=ar&region=TR&loading=async`;
    script.async = true;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface HtmlMarker {
  setMap(map: any): void;
  getPosition(): LatLng;
}

// A marker whose look is plain HTML, anchored at its bottom-center on the position.
// (Avoids AdvancedMarkerElement, which requires a Map ID from Google Cloud.)
export function createHtmlMarker(g: any, position: LatLng, html: string, onClick?: () => void): HtmlMarker {
  class Overlay extends g.maps.OverlayView {
    div: HTMLDivElement | null = null;
    onAdd() {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.cursor = onClick ? 'pointer' : 'default';
      div.innerHTML = html;
      if (onClick) div.addEventListener('click', onClick);
      this.div = div;
      this.getPanes().overlayMouseTarget.appendChild(div);
    }
    draw() {
      if (!this.div) return;
      const p = this.getProjection().fromLatLngToDivPixel(new g.maps.LatLng(position.lat, position.lng));
      if (!p) return;
      this.div.style.left = `${p.x}px`;
      this.div.style.top = `${p.y}px`;
      this.div.style.transform = 'translate(-50%, -100%)';
    }
    onRemove() {
      this.div?.remove();
      this.div = null;
    }
    getPosition() {
      return position;
    }
  }
  return new Overlay() as unknown as HtmlMarker;
}

export function pinHtml(color: string, text: string, badge?: string, dir = 'rtl'): string {
  const badgeHtml = badge
    ? `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#fff;color:${color};text-align:center;line-height:18px;font-size:11px;font-weight:900">${escapeHtml(badge)}</span>`
    : `<span style="width:6px;height:6px;border-radius:999px;background:#fff;display:inline-block"></span>`;
  return `<div dir="${dir}" style="display:flex;flex-direction:column;align-items:center">
    <div style="background:${color};color:#fff;font-size:12px;padding:4px 10px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,.35);border:2px solid #fff;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit">
      ${badgeHtml}<span style="font-weight:600">${escapeHtml(text)}</span>
    </div>
    <div style="width:2px;height:12px;background:${color}"></div>
  </div>`;
}
