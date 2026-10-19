import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { LANDMARKS, MAP_BOUNDS, NODES, SEGMENTS } from '../../data/nodelink';
import { loadIndex, loadTilesIn } from '../../lib/nodelinkTiles';
import { midOf, segById } from '../../lib/segments';
import type { Pass, Segment } from '../../types';
import type { RiskMapProps } from './types';

// 위험 색은 KRDS 시스템 색 (밝은 도로 위에서도 잘 보이는 진한 톤)
const HEX: Record<Pass, string> = { blocked: '#DE3412', narrowed: '#C78500', passable: '#228738', hold: '#58616A' };
const SELECT = '#256EF4';
/** 범례(Pill)와 같은 모양: 단절 ■, 좁아짐 ▲, 판단 유보 ◆ */
const MARK: Record<Pass, string> = {
  blocked: 'M3 3h12v12H3z', narrowed: 'M9 2l7.5 13.5h-15z', hold: 'M9 1.5l7.5 7.5-7.5 7.5-7.5-7.5z', passable: '',
};
const RISK_ORDER: Record<Pass, number> = { passable: 0, hold: 1, narrowed: 2, blocked: 3 };
/** 줌 16 기준 도로 폭(px). 약도(SvgRiskMap)의 등급별 폭과 같은 비율 */
const ROAD_W: Record<string, number> = { '101': 9, '102': 8, '103': 7, '104': 5.5, '105': 4.8, '106': 4.5, '107': 3.4, '108': 2.6 };
const roadW = (rank: string, zoom: number) => Math.max(1.2, (ROAD_W[rank] ?? 3) * 2 ** ((zoom - 16) * 0.85));
/** 이 줌 이상에서 전국 도로망을 그린다. 한 단계 아래(ALL_ZOOM-1)는 지방도 이상만 */
const ALL_ZOOM = 15;
const MAJOR_RANK = '106';
/** 도로명 라벨을 다는 줌과 최대 개수 */
const LABEL_ZOOM = 16;
const MAX_LABELS = 60;
/** 메모리에 남겨 둘 타일 수 */
const KEEP_TILES = 40;
const STATIC_IDS = new Set(SEGMENTS.map((s) => s.id));
const BASE_KEY = 'roadpush.basemap';

/** CSS 토큰(라이트·다크)에서 도로 색을 읽는다 */
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 도로 링크. 처음 화면에 들어올 때 선을 만든다 */
type Road = { sg: Segment; bb: [number, number, number, number]; edge: L.Polyline | null; fill: L.Polyline | null };
const road = (sg: Segment): Road => {
  const la = sg.ll.map((p) => p[0]), ln = sg.ll.map((p) => p[1]);
  return { sg, bb: [Math.min(...la), Math.min(...ln), Math.max(...la), Math.max(...ln)], edge: null, fill: null };
};

function readBase(): boolean {
  try { return localStorage.getItem(BASE_KEY) !== 'off'; } catch { return true; }
}

/** VITE_VWORLD_KEY가 있으면 쓰는 지도: 표준노드링크 도로를 직접 그리고 브이월드는 옅은 배경으로 */
export function VWorldRiskMap({ apiKey, statusOf, selected, onSelect, focusKey, onError }: RiskMapProps & { apiKey: string; onError: (msg: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const riskRenderer = useRef<L.SVG | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(ALL_ZOOM);
  const [base, setBase] = useState(readBase);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, {
      center: [(MAP_BOUNDS.south + MAP_BOUNDS.north) / 2, (MAP_BOUNDS.west + MAP_BOUNDS.east) / 2],
      zoom: ALL_ZOOM, minZoom: 7, maxZoom: 19, zoomControl: false, preferCanvas: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    let failed = 0, loaded = 0;
    tilesRef.current = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(apiKey)}/white/{z}/{y}/{x}.png`, {
      minZoom: 7, maxZoom: 19, attribution: '배경지도 © 브이월드(국토교통부) · 도로 © 국토교통부 표준노드링크',
    })
      .on('tileload', () => { loaded++; })
      .on('tileerror', () => { if (++failed >= 6 && !loaded) onError('브이월드 배경지도를 불러오지 못했습니다'); });
    // 도로 테두리 < 도로 < 위험 구간 < 라벨 순으로 겹친다
    for (const [name, z] of [['road-edge', 404], ['road', 405], ['risk', 420], ['labels', 450]] as const) m.createPane(name).style.zIndex = String(z);
    m.getPane('labels')!.style.pointerEvents = 'none';
    m.getPane('road-edge')!.style.pointerEvents = 'none';
    m.on('zoomend', () => setZoom(m.getZoom()));
    map.current = m;
    overlay.current = L.layerGroup().addTo(m);
    // 위험 구간은 SVG로: 캔버스는 화면 전체에서 클릭을 가로채 아래 도로를 누를 수 없게 된다
    riskRenderer.current = L.svg({ pane: 'risk' });
    setReady(true);
    return () => { m.remove(); map.current = null; setReady(false); };
  }, [apiKey, onError]);

  // 배경지도 켜기·끄기
  useEffect(() => {
    const m = map.current, t = tilesRef.current; if (!ready || !m || !t) return;
    if (base) t.addTo(m); else t.remove();
    try { localStorage.setItem(BASE_KEY, base ? 'on' : 'off'); } catch { /* 저장 못 해도 화면은 그대로 */ }
  }, [ready, base]);

  // 도로망: 예시 지역 + 화면에 걸친 전국 타일. 도로명 라벨도 함께
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    let seq = 0;
    const demo = SEGMENTS.map(road);
    const tiles = new Map<string, Road[]>();
    const edges = L.layerGroup().addTo(m), fills = L.layerGroup().addTo(m), labels = L.layerGroup().addTo(m);
    const edgeR = L.canvas({ pane: 'road-edge', padding: 0.5 });
    const fillR = L.canvas({ pane: 'road', padding: 0.5, tolerance: 6 });

    const draw = (rs: Road[], on: boolean, z: number, box: number[], color: { road: string; edge: string }) => {
      const [s0, w0, n0, e0] = box;
      for (const r of rs) {
        const vis = on && (z >= ALL_ZOOM || r.sg.rank <= MAJOR_RANK) && r.bb[0] <= n0 && r.bb[2] >= s0 && r.bb[1] <= e0 && r.bb[3] >= w0;
        if (!vis) {
          if (r.fill) { edges.removeLayer(r.edge!); fills.removeLayer(r.fill); r.edge = r.fill = null; }
          continue;
        }
        const w = roadW(r.sg.rank, z);
        if (!r.fill) {
          const id = r.sg.id;
          r.edge = L.polyline(r.sg.ll, { renderer: edgeR, interactive: false, lineCap: 'round', lineJoin: 'round' });
          r.fill = L.polyline(r.sg.ll, { renderer: fillR, lineCap: 'round', lineJoin: 'round' }).on('click', () => pick.current(id));
          edges.addLayer(r.edge); fills.addLayer(r.fill);
        }
        r.edge!.setStyle({ color: color.edge, weight: w + 2.4, opacity: 1 });
        r.fill.setStyle({ color: color.road, weight: w, opacity: 1 });
      }
    };

    // 도로 이름마다 화면에서 가장 긴 링크 하나에 라벨을 단다
    const label = (z: number, rs: Road[]) => {
      labels.clearLayers();
      if (z < LABEL_ZOOM) return;
      const best = new Map<string, { len: number; lat: number; lng: number; ang: number }>();
      for (const r of rs) {
        if (!r.fill || r.sg.road === '이름 없는 도로') continue;
        const pts = r.sg.ll.map((p) => m.latLngToLayerPoint(p));
        const mid = midOf(pts.map((p) => [p.x, p.y] as [number, number]));
        if (mid.tot < 90) continue;
        const cur = best.get(r.sg.road);
        if (cur && cur.len >= mid.tot) continue;
        const ll = m.layerPointToLatLng([mid.x, mid.y]);
        best.set(r.sg.road, { len: mid.tot, lat: ll.lat, lng: ll.lng, ang: mid.ang });
      }
      [...best.entries()].sort((x, y) => y[1].len - x[1].len).slice(0, MAX_LABELS).forEach(([name, b]) => {
        let a = b.ang; if (a > 90) a -= 180; if (a < -90) a += 180;
        labels.addLayer(L.marker([b.lat, b.lng], {
          pane: 'labels', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'road-label', iconSize: [0, 0], html: `<span style="transform:translate(-50%,-50%) rotate(${a.toFixed(1)}deg)">${esc(name)}</span>` }),
        }));
      });
    };

    const refresh = async () => {
      const my = ++seq;
      const z = m.getZoom(), b = m.getBounds();
      const pad = (b.getNorth() - b.getSouth()) * 0.25;
      const box = [b.getSouth() - pad, b.getWest() - pad, b.getNorth() + pad, b.getEast() + pad];
      const color = { road: token('--road') || '#fff', edge: token('--road-edge') || '#CDD1D5' };
      draw(demo, true, z, box, color);
      let got: { key: string; segs: Segment[] }[] = [];
      if (z >= ALL_ZOOM - 1) {
        setNote('도로 구간을 불러오는 중…');
        try {
          got = await loadTilesIn({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
        } catch (e) {
          if (my === seq) setNote((e as Error).message);
          return;
        }
        if (my !== seq) return;
      }
      const want = new Set(got.map((g) => g.key));
      for (const { key, segs } of got) {
        if (!tiles.has(key)) tiles.set(key, segs.filter((sg) => !STATIC_IDS.has(sg.id)).map(road));
      }
      for (const [key, rs] of tiles) draw(rs, want.has(key), z, box, color);
      // 오래된 타일 정리 (구간 정보는 segById에 남는다)
      for (const key of [...tiles.keys()]) {
        if (tiles.size <= KEEP_TILES) break;
        if (!want.has(key)) tiles.delete(key);
      }
      label(z, [...demo, ...[...want].flatMap((k) => tiles.get(k) ?? [])]);
      if (z >= ALL_ZOOM) setNote(null);
      else if (z === ALL_ZOOM - 1) setNote('지방도 이상만 표시 중 · 더 확대하면 모든 도로가 보입니다');
      else setNote((await loadIndex()) ? '지도를 더 확대하면 전국 표준노드링크 도로가 보입니다' : null);
    };

    // 다크 모드로 바뀌면 도로 색을 다시 읽는다
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    m.on('moveend', refresh);
    mq.addEventListener('change', refresh);
    refresh();
    return () => {
      seq++;
      m.off('moveend', refresh);
      mq.removeEventListener('change', refresh);
      edges.remove(); fills.remove(); labels.remove();
    };
  }, [ready]);

  // 위험 구간·선택 강조·역 표시
  useEffect(() => {
    const g = overlay.current, renderer = riskRenderer.current; if (!ready || !g || !renderer) return;
    g.clearLayers();
    const risk: [Segment, Pass][] = [];
    for (const sg of SEGMENTS) {
      const st = statusOf(sg.id);
      if (st?.shown) risk.push([sg, st.pass]);
    }
    const sel = selected ? segById.get(selected) : undefined;
    if (sel) g.addLayer(L.polyline(sel.ll, { renderer, color: SELECT, weight: roadW(sel.rank, zoom) + 14, opacity: 0.4, interactive: false }));
    // 통과 가능 → 판단 유보 → 좁아짐 → 단절 순으로 위에 그린다
    risk.sort((x, y) => RISK_ORDER[x[1]] - RISK_ORDER[y[1]]);
    for (const [sg, pass] of risk) {
      const w = Math.max(pass === 'passable' ? 3.5 : 5, roadW(sg.rank, zoom) + (pass === 'passable' ? 0 : 1.5));
      g.addLayer(L.polyline(sg.ll, {
        renderer, color: HEX[pass], weight: w, opacity: 1, lineCap: pass === 'hold' ? 'butt' : 'round',
        dashArray: pass === 'hold' ? `${w * 1.6} ${w}` : undefined,
      }).on('click', () => onSelect(sg.id)));
      if (pass === 'passable') continue;
      // 짧은 구간도 찾을 수 있게 가운데에 범례와 같은 모양을 찍는다
      const c = midOf(sg.ll);
      g.addLayer(L.marker([c.x, c.y], {
        icon: L.divIcon({ className: '', html: `<svg class="risk-mk" viewBox="0 0 18 18" width="18" height="18"><path d="${MARK[pass]}" fill="${HEX[pass]}"/></svg>`, iconSize: [18, 18] }),
        keyboard: false, title: sg.road,
      }).on('click', () => onSelect(sg.id)));
    }
    for (const [nm, lab] of LANDMARKS) {
      const n = Object.values(NODES).find((v) => v[2] === nm); if (!n) continue;
      g.addLayer(L.marker([n[3], n[4]], {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'map-station', iconSize: [0, 0], html: `<i></i><span>${esc(lab)}</span>` }),
      }));
    }
  }, [ready, statusOf, selected, onSelect, zoom]);

  // 선택 구간으로 이동
  useEffect(() => {
    const m = map.current; if (!ready || !m || !selected) return;
    const sg = segById.get(selected); if (!sg) return;
    m.fitBounds(L.latLngBounds(sg.ll), { padding: [120, 120], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  return (
    <>
      <div ref={el} className={`vworld-map${base ? '' : ' no-base'}`} aria-label="표준노드링크 위험 구간 지도" />
      <button type="button" className="map-base-btn" aria-pressed={base} onClick={() => setBase((v) => !v)}>
        배경지도 {base ? '끄기' : '켜기'}
      </button>
      {note && <div className="map-note" role="status">{note}</div>}
    </>
  );
}
