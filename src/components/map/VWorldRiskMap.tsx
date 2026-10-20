import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useEffect, useRef, useState } from 'react';
import { LANDMARKS, MAP_BOUNDS, NODES, SEGMENTS } from '../../data/nodelink';
import { loadCenterline, resolvePick } from '../../lib/centerline';
import { ROAD_CLICK, SHOW_LANDMARKS } from '../../lib/features';
import { loadIndex, loadTilesIn } from '../../lib/nodelinkTiles';
import { PASS, PIN_COLOR } from '../../lib/constants';
import { midOf, segById } from '../../lib/segments';
import type { Pass, Segment } from '../../types';
import type { Pin, RiskMapProps } from './types';

const SELECT = '#256EF4';
const RISK_ORDER: Record<Pass, number> = { passable: 0, hold: 1, narrowed: 2, blocked: 3 };
const PASS_ORDER: Pass[] = ['blocked', 'narrowed', 'hold', 'passable'];
/** 줌 16 기준 도로 폭(px). 약도(SvgRiskMap)의 등급별 폭과 같은 비율 */
const ROAD_W: Record<string, number> = { '101': 9, '102': 8, '103': 7, '104': 5.5, '105': 4.8, '106': 4.5, '107': 3.4, '108': 2.6 };
const roadW = (rank: string, zoom: number) => Math.max(1.2, (ROAD_W[rank] ?? 3) * 2 ** ((zoom - 16) * 0.85));
/** 실제 폭이 이보다 가늘면 이 굵기로 그린다(px). 줌 15에서 6m 도로는 1.6px라 바탕에 묻힌다 */
const minRoadPx = (zoom: number) => (zoom <= 15 ? 2.6 : zoom === 16 ? 3.6 : zoom === 17 ? 4.6 : 5.6);
/** 화면에 그릴 도로 폭(px): 연속수치지형도 도로폭(m)이 있으면 실제 폭, 없으면 등급별 폭 */
const widthPx = (sg: Segment, zoom: number) => {
  if (!sg.width) return roadW(sg.rank, zoom);
  const mpp = (156543.034 * Math.cos((sg.ll[0][0] * Math.PI) / 180)) / 2 ** zoom;
  return Math.max(minRoadPx(zoom), sg.width / mpp);
};
/** 줌 14에서도 보일 넓은 도로(m) */
const MAJOR_WIDTH = 15;
/** 선택한 도로 강조의 최대 굵기(px) */
const SEL_MAX_W = 12;
/** 핀 마커 옵션: 묶음 색을 정하려고 판정을 들고 다닌다 */
type PinOptions = L.MarkerOptions & { pass: Pass };
/** 이 줌 이상에서 전국 도로망을 그린다. 한 단계 아래(ALL_ZOOM-1)는 지방도 이상만 */
const ALL_ZOOM = 15;
const MAJOR_RANK = '106';
/** 도로명 라벨을 다는 줌과 최대 개수 */
const LABEL_ZOOM = 16;
const MAX_LABELS = 60;
/** 메모리에 남겨 둘 타일 수 */
const KEEP_TILES = 40;
const CL_ATTR = '도로폭 © 국토지리정보원 연속수치지형도';
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

/** 핀 말풍선·이름: 위치 · 판정 · 위험도 */
const tipText = (p: Pin) => `${p.obs.place} · ${PASS[p.pass].label}${p.obs.risk == null ? '' : ` · 위험도 ${p.obs.risk}점`}${p.n > 1 ? ` · 관측 ${p.n}건` : ''}`;
const tipHtml = (p: Pin) => `<b>${esc(p.obs.place)}</b><span>${PASS[p.pass].label}${p.obs.risk == null ? '' : ` · 위험도 ${p.obs.risk}점`}${p.n > 1 ? ` · 관측 ${p.n}건` : ''}</span>`;
/** 핀이 화면 가장자리(말풍선·핀 머리가 잘리는 곳)에 있을 때만 지도를 옮긴다 */
function panIfNeeded(m: L.Map, ll: L.LatLngExpression) {
  const pt = m.latLngToContainerPoint(ll), size = m.getSize();
  if (pt.x < 60 || pt.x > size.x - 60 || pt.y < 100 || pt.y > size.y - 40) m.panTo(ll);
}

function readBase(): boolean {
  try { return localStorage.getItem(BASE_KEY) !== 'off'; } catch { return true; }
}

/** VITE_VWORLD_KEY가 있으면 쓰는 지도: 표준노드링크 도로를 직접 그리고 브이월드는 옅은 배경으로 */
export function VWorldRiskMap({ apiKey, pins, selectedPin, onPickPin, hoverPin, selected, onSelect, focusKey, onError }: RiskMapProps & { apiKey: string; onError: (msg: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const riskRenderer = useRef<L.SVG | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const pickPin = useRef(onPickPin);
  pickPin.current = onPickPin;
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(ALL_ZOOM);
  const [base, setBase] = useState(readBase);
  const [note, setNote] = useState<string | null>(null);
  /** 도로중심선을 불러와 링크에 실제 도로폭이 붙었는지 (위험 구간 굵기를 다시 계산) */
  const [widths, setWidths] = useState(false);

  useEffect(() => {
    const m = L.map(el.current!, {
      center: [(MAP_BOUNDS.south + MAP_BOUNDS.north) / 2, (MAP_BOUNDS.west + MAP_BOUNDS.east) / 2],
      zoom: ALL_ZOOM, minZoom: 7, maxZoom: 19, zoomControl: false, preferCanvas: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false).addAttribution('도로 © 국토교통부 표준노드링크(2026-10-14)');
    let failed = 0, loaded = 0;
    tilesRef.current = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(apiKey)}/white/{z}/{y}/{x}.png`, {
      minZoom: 7, maxZoom: 19, attribution: '배경지도 © 브이월드(국토교통부)',
    })
      .on('tileload', () => { loaded++; })
      .on('tileerror', () => { if (++failed >= 6 && !loaded) onError('브이월드 배경지도를 불러오지 못했습니다'); });
    // 도로 테두리 < 도로 < 위험 구간 < 라벨 순으로 겹친다
    for (const [name, z] of [['road-edge', 404], ['road', 405], ['risk', 420], ['labels', 450]] as const) m.createPane(name).style.zIndex = String(z);
    m.getPane('labels')!.style.pointerEvents = 'none';
    m.getPane('road-edge')!.style.pointerEvents = 'none';
    if (!ROAD_CLICK) m.getPane('road')!.style.pointerEvents = 'none';
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
    /** 연속수치지형도 도로중심선. 불러오면 예시 지역은 표준노드링크 대신 이것으로 그린다 */
    let cl: Road[] = [];
    const tiles = new Map<string, Road[]>();
    const edges = L.layerGroup().addTo(m), fills = L.layerGroup().addTo(m), labels = L.layerGroup().addTo(m);
    const edgeR = L.canvas({ pane: 'road-edge', padding: 0.5 });
    const fillR = L.canvas({ pane: 'road', padding: 0.5, tolerance: 6 });

    const draw = (rs: Road[], on: boolean, z: number, box: number[], color: { road: string; edge: string }) => {
      const [s0, w0, n0, e0] = box;
      for (const r of rs) {
        const vis = on && (z >= ALL_ZOOM || (r.sg.cl ? r.sg.width! >= MAJOR_WIDTH : r.sg.rank <= MAJOR_RANK)) && r.bb[0] <= n0 && r.bb[2] >= s0 && r.bb[1] <= e0 && r.bb[3] >= w0;
        if (!vis) {
          if (r.fill) { edges.removeLayer(r.edge!); fills.removeLayer(r.fill); r.edge = r.fill = null; }
          continue;
        }
        const w = widthPx(r.sg, z);
        if (!r.fill) {
          const sg = r.sg;
          r.edge = L.polyline(sg.ll, { renderer: edgeR, interactive: false, lineCap: 'round', lineJoin: 'round' });
          // 도로중심선을 누르면 가까운 표준노드링크 링크를 고른다 (관측은 링크에 붙어 있다)
          r.fill = L.polyline(sg.ll, { renderer: fillR, lineCap: 'round', lineJoin: 'round', interactive: ROAD_CLICK });
          if (ROAD_CLICK) r.fill.on('click', (e: L.LeafletMouseEvent) => pick.current(sg.cl ? resolvePick([e.latlng.lat, e.latlng.lng], sg) : sg.id));
          edges.addLayer(r.edge); fills.addLayer(r.fill);
        }
        r.edge!.setStyle({ color: color.edge, weight: w + 2.4, opacity: 1 });
        r.fill.setStyle({ color: color.road, weight: w, opacity: 1 });
      }
    };

    // 도로 이름마다 화면에서 가장 긴 링크 하나에 라벨을 단다
    const label = (z: number, rs: Road[], box: number[]) => {
      const [s0, w0, n0, e0] = box;
      labels.clearLayers();
      if (z < LABEL_ZOOM) return;
      const best = new Map<string, { len: number; lat: number; lng: number; ang: number }>();
      for (const r of rs) {
        const inView = r.bb[0] <= n0 && r.bb[2] >= s0 && r.bb[1] <= e0 && r.bb[3] >= w0;
        if (!(r.fill || inView) || r.sg.road === '이름 없는 도로') continue;
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
      draw(demo, !cl.length, z, box, color);
      draw(cl, true, z, box, color);
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
      label(z, [...demo, ...[...want].flatMap((k) => tiles.get(k) ?? [])], box);
      if (z >= ALL_ZOOM) setNote(null);
      else if (z === ALL_ZOOM - 1) setNote('지방도 이상만 표시 중 · 더 확대하면 모든 도로가 보입니다');
      else setNote((await loadIndex()) ? '지도를 더 확대하면 전국 표준노드링크 도로가 보입니다' : null);
    };

    // 다크 모드로 바뀌면 도로 색을 다시 읽는다
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    loadCenterline().then((segs) => {
      if (seq < 0 || !segs.length) return;
      cl = segs.map(road);
      m.attributionControl.addAttribution(CL_ATTR);
      setWidths(true);
      refresh();
    });
    m.on('moveend', refresh);
    mq.addEventListener('change', refresh);
    refresh();
    return () => {
      seq = -1;
      m.off('moveend', refresh);
      mq.removeEventListener('change', refresh);
      edges.remove(); fills.remove(); labels.remove();
      m.attributionControl.removeAttribution(CL_ATTR);
    };
  }, [ready]);

  // 관측 핀: 같은 좌표 관측을 한 핀으로, 축소하면 가까운 핀끼리 묶어 개수로
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 56, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 18,
      // 묶음 색은 그 안에서 가장 위험한 판정
      iconCreateFunction: (c) => {
        const passes = c.getAllChildMarkers().map((mk) => (mk.options as PinOptions).pass);
        const worst = passes.reduce((x, y) => (RISK_ORDER[y] > RISK_ORDER[x] ? y : x));
        const label = PASS_ORDER.filter((p) => passes.includes(p)).map((p) => `${PASS[p].label} ${passes.filter((x) => x === p).length}`).join(' · ');
        // 숫자가 잘 보이게 크게: 지점 수가 많을수록 조금 더 크게
        const n = c.getChildCount(), size = n < 5 ? 48 : n < 10 ? 54 : 60;
        return L.divIcon({
          className: 'pin-cluster', iconSize: [size, size],
          // 판정별 개수는 마우스를 올리거나 키보드로 선택하면 말풍선으로, 화면 낭독기에는 숨김 글로
          html: `<span class="pc-n" aria-hidden="true" style="--c:${PIN_COLOR[worst].fill};--ink:${PIN_COLOR[worst].ink}">${n}</span>`
            + `<span class="pc-tip" aria-hidden="true">${label}</span><span class="vh">관측 지점 ${n}곳 묶음: ${label}. 누르면 확대</span>`,
        });
      },
    });
    cluster.addTo(m);
    clusterRef.current = cluster;
    return () => { cluster.remove(); clusterRef.current = null; };
  }, [ready]);

  useEffect(() => {
    const c = clusterRef.current, m = map.current; if (!ready || !c || !m) return;
    c.clearLayers();
    markers.current.clear();
    for (const p of pins) {
      const on = p.key === selectedPin;
      const mk = L.marker([p.lat, p.lng], {
        pass: p.pass, keyboard: true, zIndexOffset: on ? 1000 : RISK_ORDER[p.pass] * 10,
        icon: L.divIcon({
          className: `pin${on ? ' on' : ''}`, iconSize: [30, 38], iconAnchor: [15, 36],
          // 아이콘 없이 색으로만 구분 (판정 이름은 title·aria-label과 범례로)
          html: `<svg viewBox="0 0 30 38" width="30" height="38" aria-hidden="true"><path class="pin-body" d="M15 37C15 37 2 22.5 2 14a13 13 0 0 1 26 0c0 8.5-13 23-13 23z" fill="${PIN_COLOR[p.pass].fill}"/>`
            // 이 지점의 관측 수 (2건 이상일 때 핀 머리 가운데에)
            + `${p.n > 1 ? `<text x="15" y="14" fill="${PIN_COLOR[p.pass].ink}">${p.n}</text>` : ''}</svg>`,
        }),
      } as PinOptions);
      // 마우스를 올리거나 키보드로 선택하면 말풍선으로 빠르게 확인 (위치 · 판정 · 위험도)
      mk.bindTooltip(tipHtml(p), { direction: 'top', offset: [0, -34], className: 'pin-tip', opacity: 1 });
      // 누르면 바로 오른쪽 상세. 지도는 핀이 가장자리에 걸릴 때만 옮긴다
      const choose = (byKey: boolean) => {
        panIfNeeded(m, [p.lat, p.lng]);
        pickPin.current(p);
        if (byKey) setTimeout(() => document.querySelector<HTMLElement>('.side .back')?.focus(), 50);
      };
      mk.on('click', () => choose(false));
      // 핀이 묶음에서 풀려 지도에 올라올 때마다 새 요소가 생기므로 그때 이름·키보드 처리를 붙인다
      mk.on('add', () => {
        const node = mk.getElement(); if (!node) return;
        node.setAttribute('aria-label', tipText(p));
        node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(true); } });
        node.addEventListener('focus', () => mk.openTooltip());
        node.addEventListener('blur', () => mk.closeTooltip());
      });
      markers.current.set(p.key, mk);
      c.addLayer(mk);
    }
  }, [ready, pins, selectedPin]);

  // 오른쪽 목록에서 마우스를 올린 지점: 핀(묶여 있으면 그 묶음)을 강조하고 말풍선을 띄운다
  useEffect(() => {
    const c = clusterRef.current; if (!ready || !c || !hoverPin) return;
    const mk = markers.current.get(hoverPin); if (!mk) return;
    const shown = c.getVisibleParent(mk) as L.Marker | null;
    const node = shown?.getElement();
    node?.classList.add('hl');
    if (shown === mk) mk.openTooltip();
    return () => { node?.classList.remove('hl'); if (shown === mk) mk.closeTooltip(); };
  }, [ready, hoverPin, pins, selectedPin]);

  // 선택 강조(도로를 눌렀을 때)·역 표시
  useEffect(() => {
    const g = overlay.current, renderer = riskRenderer.current; if (!ready || !g || !renderer) return;
    g.clearLayers();
    const sel = !selectedPin && selected ? segById.get(selected) : undefined;
    if (sel) g.addLayer(L.polyline(sel.ll, { renderer, color: SELECT, weight: Math.min(SEL_MAX_W, widthPx(sel, zoom)) + 12, opacity: 0.4, interactive: false }));
    for (const [nm, lab] of SHOW_LANDMARKS ? LANDMARKS : []) {
      const n = Object.values(NODES).find((v) => v[2] === nm); if (!n) continue;
      g.addLayer(L.marker([n[3], n[4]], {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'map-station', iconSize: [0, 0], html: `<i></i><span>${esc(lab)}</span>` }),
      }));
    }
  }, [ready, selected, selectedPin, zoom, widths]);

  // 선택한 핀(없으면 링크)으로 이동
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    const mk = selectedPin ? markers.current.get(selectedPin) : undefined;
    // 목록에서 골랐을 때: 묶음에 숨어 있으면 풀릴 만큼 확대하고, 화면 가장자리면 옮긴다
    if (mk) { clusterRef.current?.zoomToShowLayer(mk, () => panIfNeeded(m, mk.getLatLng())); return; }
    const sg = selected ? segById.get(selected) : undefined;
    if (sg) m.fitBounds(L.latLngBounds(sg.ll), { padding: [120, 120], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  return (
    <>
      <div ref={el} className={`vworld-map${base ? '' : ' no-base'}`} aria-label="관측 지점 지도" />
      <button type="button" className="krds-btn xsmall tertiary map-base-btn" aria-pressed={base} onClick={() => setBase((v) => !v)}>
        배경지도 {base ? '끄기' : '켜기'}
      </button>
      {note && <div className="map-note" role="status">{note}</div>}
    </>
  );
}
