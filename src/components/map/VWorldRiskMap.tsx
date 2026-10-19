import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { MAP_BOUNDS, SEGMENTS } from '../../data/nodelink';
import { loadIndex, loadTilesIn } from '../../lib/nodelinkTiles';
import { midOf, segById } from '../../lib/segments';
import type { Pass, Segment } from '../../types';
import type { RiskMapProps } from './types';

// 브이월드 회색 배경지도 위에서 잘 보이는 KRDS 시스템 색
const HEX: Record<Pass, string> = { blocked: '#DE3412', narrowed: '#C78500', passable: '#228738', hold: '#58616A' };
/** 관측 없는 링크: 위험 구간보다 눈에 덜 띄게 가늘고 옅게 */
const BG_LINE: L.PolylineOptions = { color: '#8A949E', weight: 1.6, opacity: 0.6 };
const SELECT = '#256EF4';
/** 범례(Pill)와 같은 모양: 단절 ■, 좁아짐 ▲, 판단 유보 ◆ */
const MARK: Record<Pass, string> = {
  blocked: 'M3 3h12v12H3z', narrowed: 'M9 2l7.5 13.5h-15z', hold: 'M9 1.5l7.5 7.5-7.5 7.5-7.5-7.5z', passable: '',
};
const RISK_ORDER: Record<Pass, number> = { passable: 0, hold: 1, narrowed: 2, blocked: 3 };
/** 이 줌 이상에서 전국 도로망을 그린다. 한 단계 아래(ALL_ZOOM-1)는 지방도 이상만 */
const ALL_ZOOM = 15;
const MAJOR_RANK = '106';
/** 메모리에 남겨 둘 타일 수 */
const KEEP_TILES = 40;
const STATIC_IDS = new Set(SEGMENTS.map((s) => s.id));

/** 배경 링크. line은 처음 화면에 들어올 때 만든다 */
type BgLine = { sg: Segment; bb: [number, number, number, number]; line: L.Polyline | null };
const bbox = (sg: Segment): BgLine['bb'] => {
  const la = sg.ll.map((p) => p[0]), ln = sg.ll.map((p) => p[1]);
  return [Math.min(...la), Math.min(...ln), Math.max(...la), Math.max(...ln)];
};

/** VITE_VWORLD_KEY가 있으면 쓰는 브이월드 배경지도 */
export function VWorldRiskMap({ apiKey, statusOf, selected, onSelect, focusKey, onError }: RiskMapProps & { apiKey: string; onError: (msg: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const riskRenderer = useRef<L.Canvas | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { center: [(MAP_BOUNDS.south + MAP_BOUNDS.north) / 2, (MAP_BOUNDS.west + MAP_BOUNDS.east) / 2], zoom: ALL_ZOOM, minZoom: 7, maxZoom: 19, zoomControl: false, preferCanvas: true });
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    let failed = 0, loaded = 0;
    L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(apiKey)}/white/{z}/{y}/{x}.png`, {
      minZoom: 7, maxZoom: 19, attribution: '배경지도 © 브이월드(국토교통부)',
    })
      .on('tileload', () => { loaded++; })
      .on('tileerror', () => { if (++failed >= 6 && !loaded) onError('브이월드 배경지도를 불러오지 못했습니다'); })
      .addTo(m);
    // 배경 도로 < 관측 구간 순서로 겹치도록 레이어를 나눈다
    m.createPane('bg-roads').style.zIndex = '410';
    m.createPane('risk').style.zIndex = '420';
    map.current = m;
    overlay.current = L.layerGroup().addTo(m);
    riskRenderer.current = L.canvas({ pane: 'risk', tolerance: 6 });
    setReady(true);
    return () => { m.remove(); map.current = null; setReady(false); };
  }, [apiKey, onError]);

  // 전국 도로망: 화면에 걸친 타일만 불러와 그린다
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    let seq = 0;
    const tiles = new Map<string, BgLine[]>();
    const group = L.layerGroup().addTo(m);
    const renderer = L.canvas({ pane: 'bg-roads', padding: 0.5, tolerance: 6 });

    const refresh = async () => {
      const my = ++seq;
      const zoom = m.getZoom();
      if (zoom < ALL_ZOOM - 1) {
        group.clearLayers();
        tiles.forEach((ls) => ls.forEach((l) => { l.line = null; }));
        setNote((await loadIndex()) ? '지도를 더 확대하면 전국 표준노드링크 도로가 보입니다' : null);
        return;
      }
      const b = m.getBounds();
      setNote('도로 구간을 불러오는 중…');
      let got: { key: string; segs: Segment[] }[];
      try {
        got = await loadTilesIn({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
      } catch (e) {
        if (my === seq) setNote((e as Error).message);
        return;
      }
      if (my !== seq) return;
      const want = new Set(got.map((g) => g.key));
      for (const { key, segs } of got) {
        if (!tiles.has(key)) tiles.set(key, segs.filter((sg) => !STATIC_IDS.has(sg.id)).map((sg) => ({ sg, bb: bbox(sg), line: null })));
      }
      // 화면(+여백) 안에 걸치는 링크만 지도에 올린다
      const pad = (b.getNorth() - b.getSouth()) * 0.25;
      const [s0, w0, n0, e0] = [b.getSouth() - pad, b.getWest() - pad, b.getNorth() + pad, b.getEast() + pad];
      for (const [key, ls] of tiles) {
        const on = want.has(key);
        for (const l of ls) {
          const vis = on && (zoom >= ALL_ZOOM || l.sg.rank <= MAJOR_RANK) && l.bb[0] <= n0 && l.bb[2] >= s0 && l.bb[1] <= e0 && l.bb[3] >= w0;
          if (vis && !l.line) {
            const id = l.sg.id;
            l.line = L.polyline(l.sg.ll, { ...BG_LINE, renderer }).on('click', () => pick.current(id));
            group.addLayer(l.line);
          } else if (!vis && l.line) {
            group.removeLayer(l.line);
            l.line = null;
          }
        }
      }
      // 오래된 타일 정리 (구간 정보는 segById에 남는다)
      for (const key of [...tiles.keys()]) {
        if (tiles.size <= KEEP_TILES) break;
        if (!want.has(key)) tiles.delete(key);
      }
      setNote(zoom < ALL_ZOOM ? '지방도 이상만 표시 중 · 더 확대하면 모든 도로가 보입니다' : null);
    };

    m.on('moveend', refresh);
    refresh();
    return () => { seq++; m.off('moveend', refresh); group.remove(); };
  }, [ready]);

  // 관측 구간·선택 강조 다시 그리기
  useEffect(() => {
    const g = overlay.current, renderer = riskRenderer.current; if (!ready || !g || !renderer) return;
    g.clearLayers();
    const risk: [Segment, Pass][] = [];
    for (const sg of SEGMENTS) {
      const st = statusOf(sg.id);
      if (st?.shown) risk.push([sg, st.pass]);
      else g.addLayer(L.polyline(sg.ll, { ...BG_LINE, renderer }).on('click', () => onSelect(sg.id)));
    }
    const sel = selected ? segById.get(selected) : undefined;
    if (sel) g.addLayer(L.polyline(sel.ll, { renderer, color: SELECT, weight: 22, opacity: 0.55, interactive: false }));
    // 통과 가능 → 판단 유보 → 좁아짐 → 단절 순으로 위에 그린다
    risk.sort((x, y) => RISK_ORDER[x[1]] - RISK_ORDER[y[1]]);
    for (const [sg, pass] of risk) {
      const w = pass === 'passable' ? 4 : 6;
      g.addLayer(L.polyline(sg.ll, { renderer, color: '#fff', weight: w + 4, opacity: 1, interactive: false }));
      g.addLayer(L.polyline(sg.ll, { renderer, color: HEX[pass], weight: w, opacity: 1, dashArray: pass === 'hold' ? '8 6' : undefined })
        .on('click', () => onSelect(sg.id)));
      if (pass === 'passable') continue;
      // 짧은 구간도 찾을 수 있게 가운데에 범례와 같은 모양을 찍는다
      const m = midOf(sg.ll);
      g.addLayer(L.marker([m.x, m.y], {
        icon: L.divIcon({ className: '', html: `<svg class="risk-mk" viewBox="0 0 18 18" width="18" height="18"><path d="${MARK[pass]}" fill="${HEX[pass]}"/></svg>`, iconSize: [18, 18] }),
        keyboard: false, title: sg.road,
      }).on('click', () => onSelect(sg.id)));
    }
  }, [ready, statusOf, selected, onSelect]);

  // 선택 구간으로 이동
  useEffect(() => {
    const m = map.current; if (!ready || !m || !selected) return;
    const sg = segById.get(selected); if (!sg) return;
    m.fitBounds(L.latLngBounds(sg.ll), { padding: [120, 120], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  return (
    <>
      <div ref={el} className="vworld-map" aria-label="브이월드 배경지도 위 위험 구간" />
      {note && <div className="map-note" role="status">{note}</div>}
    </>
  );
}
