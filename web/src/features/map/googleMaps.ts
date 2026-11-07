// Google Maps JavaScript API loader + small helpers shared by every map in the app.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
    __gmapReady?: () => void;
  }
}

export type LatLng = { lat: number; lng: number };

// Istanbul: used only until the server's configured map center is known.
export const ISTANBUL_CENTER: LatLng = { lat: 41.0082, lng: 28.9784 };

let scriptPromise: Promise<any> | null = null;
let loadedKey = '';

// With `loading=async` Google calls the callback as soon as its bootstrap is ready, BEFORE the real
// libraries exist (google.maps.Map can still be undefined: "Map is not a constructor", seen on slow
// connections). So the promise resolves only after the libraries we use have been imported.
const LIBRARIES = ['core', 'maps', 'streetView'];

export function loadGoogleMaps(key: string): Promise<any> {
  if (scriptPromise && loadedKey === key) return scriptPromise; // loading, or already loaded
  loadedKey = key;
  scriptPromise = new Promise((resolve, reject) => {
    window.__gmapReady = () => {
      const g = window.google;
      if (typeof g?.maps?.importLibrary !== 'function') return resolve(g); // classic loader: all is ready
      Promise.all(LIBRARIES.map((l) => g.maps.importLibrary(l)))
        .then(() => resolve(g))
        .catch((e) => {
          scriptPromise = null;
          reject(e instanceof Error ? e : new Error('failed to load Google Maps libraries'));
        });
    };
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
  setPosition(p: LatLng): void;
  /** The marker's root element (null until it has been added to a map). */
  element(): HTMLDivElement | null;
}

// A marker whose look is plain HTML. `anchor` picks which point of the element sits on the
// position: the bottom-center (pins) or the center (a moving vehicle dot).
// (Avoids AdvancedMarkerElement, which requires a Map ID from Google Cloud.)
export function createHtmlMarker(
  g: any,
  position: LatLng,
  html: string,
  onClick?: () => void,
  anchor: 'bottom' | 'center' = 'bottom',
): HtmlMarker {
  class Overlay extends g.maps.OverlayView {
    div: HTMLDivElement | null = null;
    pos: LatLng = position;
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
      const proj = this.getProjection();
      if (!proj) return;
      const p = proj.fromLatLngToDivPixel(new g.maps.LatLng(this.pos.lat, this.pos.lng));
      if (!p) return;
      this.div.style.left = `${p.x}px`;
      this.div.style.top = `${p.y}px`;
      this.div.style.transform = anchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
    }
    onRemove() {
      this.div?.remove();
      this.div = null;
    }
    getPosition() {
      return this.pos;
    }
    setPosition(p: LatLng) {
      this.pos = p;
      this.draw();
    }
    element() {
      return this.div;
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
