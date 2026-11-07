/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useMapConfig } from '../../config';
import { useTheme } from '../../theme';
import { ISTANBUL_CENTER, loadGoogleMaps, type LatLng } from './googleMaps';
import { DARK_STYLE } from './mapStyles';

interface Options {
  center?: LatLng;
  zoom?: number;
  /** Hide Google's own controls (the page draws its own). */
  disableDefaultUI?: boolean;
  /** Called when the map (not a marker) is tapped. */
  onClick?: (lat: number, lng: number) => void;
  /** Anything else to pass to `new google.maps.Map` (e.g. tilt). */
  extra?: Record<string, unknown>;
}

export interface GoogleMapHandle {
  divRef: RefObject<HTMLDivElement>;
  mapRef: MutableRefObject<any>;
  gRef: MutableRefObject<any>;
  /** The map exists and `google.maps` is loaded. */
  ready: boolean;
  error: string;
  /** The server has no Google Maps key. */
  keyMissing: boolean;
}

/**
 * One place that loads Google Maps, creates the map in `divRef`, keeps its look in sync with the
 * app theme (night style) and reports `ready`. The map and `google` live in refs.
 */
export function useGoogleMap(opts: Options = {}): GoogleMapHandle {
  const { googleMapsApiKey, googleMapId, defaultCenter, defaultZoom } = useMapConfig();
  const { theme } = useTheme();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const onClick = useRef(opts.onClick);
  onClick.current = opts.onClick;

  // 1) load the script
  useEffect(() => {
    if (!googleMapsApiKey) return;
    let cancelled = false;
    loadGoogleMaps(googleMapsApiKey)
      .then((g) => {
        if (cancelled) return;
        gRef.current = g;
        setLoaded(true);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey]);

  // 2) create the map once its container exists
  useEffect(() => {
    if (!loaded || !divRef.current || mapRef.current) return;
    const g = gRef.current;
    const map = new g.maps.Map(divRef.current, {
      center: opts.center ?? defaultCenter ?? ISTANBUL_CENTER,
      zoom: opts.zoom ?? defaultZoom ?? 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      ...(opts.disableDefaultUI ? { disableDefaultUI: true } : {}),
      ...(googleMapId ? { mapId: googleMapId } : {}),
      ...opts.extra,
    });
    map.getStreetView().setOptions({ enableCloseButton: true, addressControl: false, fullscreenControl: false });
    map.addListener('click', (e: any) => onClick.current?.(e.latLng.lat(), e.latLng.lng()));
    mapRef.current = map;
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // 3) night style follows the app theme
  useEffect(() => {
    if (!ready || googleMapId) return;
    mapRef.current?.setOptions({ styles: theme === 'dark' ? DARK_STYLE : [] });
  }, [ready, theme, googleMapId]);

  return { divRef, mapRef, gRef, ready, error, keyMissing: !googleMapsApiKey };
}

/** Switches Google's overlay layers (live traffic, public transport, bike lanes) on and off. */
export function useMapLayers(
  h: Pick<GoogleMapHandle, 'mapRef' | 'gRef' | 'ready'>,
  layers: { traffic?: boolean; transit?: boolean; bicycling?: boolean },
) {
  const objs = useRef<Record<string, any>>({});
  const { traffic, transit, bicycling } = layers;
  useEffect(() => {
    const map = h.mapRef.current;
    const g = h.gRef.current;
    if (!h.ready || !map || !g) return;
    const apply = (key: string, on: boolean | undefined, make: () => any) => {
      if (on) {
        objs.current[key] ??= make();
        objs.current[key].setMap(map);
      } else objs.current[key]?.setMap(null);
    };
    apply('traffic', traffic, () => new g.maps.TrafficLayer());
    apply('transit', transit, () => new g.maps.TransitLayer());
    apply('bicycling', bicycling, () => new g.maps.BicyclingLayer());
  }, [h.ready, traffic, transit, bicycling, h.mapRef, h.gRef]);
}

/** Opens Street View at the nearest panorama; resolves false when there is no coverage nearby. */
export function openStreetView(h: Pick<GoogleMapHandle, 'mapRef' | 'gRef'>, at: LatLng): Promise<boolean> {
  const map = h.mapRef.current;
  const g = h.gRef.current;
  if (!map || !g) return Promise.resolve(false);
  return new Promise((resolve) => {
    new g.maps.StreetViewService().getPanorama({ location: at, radius: 150 }, (data: any, status: string) => {
      if (status !== 'OK' || !data?.location?.pano) return resolve(false);
      const pano = map.getStreetView();
      pano.setPano(data.location.pano);
      pano.setPov({ heading: 0, pitch: 0 });
      pano.setVisible(true);
      resolve(true);
    });
  });
}
