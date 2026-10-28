import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

const TILES = (import.meta.env.VITE_VWORLD_PROXY as string | undefined)?.trim();
/** 위치를 아직 모를 때 보여 줄 곳 (분당구 서현역 부근) */
const FALLBACK: [number, number] = [37.3846, 127.1236];
const PIN = L.divIcon({
  className: 'rp-pin', iconSize: [32, 40], iconAnchor: [16, 38],
  html: '<svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true"><path d="M16 39S3 24 3 15a13 13 0 0 1 26 0c0 9-13 24-13 24z"/><circle cx="16" cy="15" r="5" fill="#fff"/></svg>',
});

/** 제보 위치: 지도를 누르거나 핀을 끌어 정한다 */
export function LocationMap({ loc, onPick }: { loc: { lat: number; lng: number } | null; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const m = L.map(el.current!, { center: FALLBACK, zoom: 16, zoomControl: false, attributionControl: !!TILES });
    // 지도 위 출처는 배경지도(브이월드)만 (Leaflet 링크는 뺀다)
    m.attributionControl?.setPrefix(false);
    if (TILES) L.tileLayer(`${TILES}/Base/{z}/{y}/{x}.png`, { maxZoom: 19, attribution: '배경지도 © 브이월드(국토교통부)' }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; pin.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m || !loc) return;
    if (!pin.current) {
      pin.current = L.marker([loc.lat, loc.lng], { icon: PIN, draggable: true, keyboard: false }).addTo(m);
      pin.current.on('dragend', () => { const p = pin.current!.getLatLng(); pick.current(p.lat, p.lng); });
      m.setView([loc.lat, loc.lng], 17);
    } else {
      pin.current.setLatLng([loc.lat, loc.lng]);
      if (!m.getBounds().pad(-0.2).contains([loc.lat, loc.lng])) m.panTo([loc.lat, loc.lng]);
    }
  }, [loc]);

  return <div ref={el} className="rp-map" role="application" aria-label="제보 위치 지도. 누르면 그 자리로 위치가 바뀝니다" />;
}
