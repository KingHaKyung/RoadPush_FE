import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { KOREA_BOUNDS, MAP_ZOOM, tileUrl } from '../lib/tiles';

const TILES = (import.meta.env.VITE_VWORLD_PROXY as string | undefined)?.trim();
/** 위치를 아직 모를 때 보여 줄 곳 (분당구 서현역 부근) */
const FALLBACK: [number, number] = [37.3846, 127.1236];
const PIN = L.divIcon({
  className: 'rp-pin', iconSize: [32, 40], iconAnchor: [16, 38],
  html: '<svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true"><path d="M16 39S3 24 3 15a13 13 0 0 1 26 0c0 9-13 24-13 24z"/><circle cx="16" cy="15" r="5" fill="#fff"/></svg>',
});

/** 제보 위치: 지도를 누르거나 핀을 끌어 정한다. onFail: 배경지도를 못 불러왔는지 (지도 안내 문구를 숨기는 데 쓴다) */
export function LocationMap({ loc, onPick, onFail }: { loc: { lat: number; lng: number } | null; onPick: (lat: number, lng: number) => void; onFail?: (failed: boolean) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const tiles = useRef<L.TileLayer | null>(null);
  /** 배경지도를 못 받음 (주소가 없거나 타일이 계속 실패). 위치는 '현재 위치 사용'으로도 정할 수 있다 */
  const [failed, setFailed] = useState(!TILES);
  const count = useRef({ ok: 0, bad: 0 });
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => { fail.current?.(failed); }, [failed]);

  useEffect(() => {
    const m = L.map(el.current!, {
      center: FALLBACK, zoom: 16, minZoom: MAP_ZOOM.min, maxZoom: MAP_ZOOM.max, zoomControl: false, attributionControl: !!TILES,
      maxBounds: KOREA_BOUNDS, maxBoundsViscosity: 1,
    });
    // 지도 위 출처는 배경지도(브이월드)만 (Leaflet 링크는 뺀다)
    m.attributionControl?.setPrefix(false);
    if (TILES) {
      tiles.current = L.tileLayer(tileUrl(TILES, 'Base/{z}/{y}/{x}.png'), { minZoom: MAP_ZOOM.min, maxZoom: MAP_ZOOM.max, attribution: '배경지도 © 브이월드(국토교통부)' })
        .on('tileload', () => { count.current.ok++; setFailed(false); })
        // 한 장도 못 받은 채 여러 장 실패하면 연결 문제로 본다
        .on('tileerror', () => { if (++count.current.bad >= 4 && !count.current.ok) setFailed(true); })
        .addTo(m);
    }
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; pin.current = null; tiles.current = null; };
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

  const retry = () => { count.current = { ok: 0, bad: 0 }; setFailed(false); tiles.current?.redraw(); };

  return (
    <div className="rp-mapwrap">
      <div ref={el} className="rp-map" role="application" aria-label="제보 위치 지도. 누르면 그 자리로 위치가 바뀝니다" />
      {failed && (
        <div className="rp-map-error">
          <EmptyState kind="offline" small title="지도를 불러오지 못했습니다" desc="아래 '현재 위치 사용'을 누르면 지금 있는 곳으로 접수할 수 있습니다."
            action={TILES ? { label: '다시 시도', onClick: retry } : undefined} />
        </div>
      )}
    </div>
  );
}
