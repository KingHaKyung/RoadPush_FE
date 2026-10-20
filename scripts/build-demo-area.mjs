// 예시 지역(성남시 분당구 서현·수내 일대) 표준노드링크를 잘라 src/data/nodelink.ts와 GeoJSON을 만든다.
// 예시 관측(src/data/observations.ts)도 이 지역 링크에 다시 배정한다.
// 사용: node scripts/build-demo-area.mjs [원본 폴더=data/raw]
import fs from 'node:fs';
import path from 'node:path';
import { DATE, eachLink, openDbf, readNodePositions } from './nodelink-shp.mjs';

const SRC = process.argv[2] ?? 'data/raw';
const AREA = '성남시 분당구 서현·수내 일대';
const BOUNDS = { south: 37.3745, west: 127.108, north: 37.3905, east: 127.134 };
const GEOJSON = 'data/roadpush_seongnam_nodelink.geojson';
/** 지도에 표시할 곳: [노드 이름, 표시 이름] */
const LANDMARKS = [['서현역(수인분당선)', '서현역'], ['수내역1번출구', '수내역'], ['분당구청사거리', '분당구청']];
/** 장비 이름 앞부분 → 배정할 쪽 (서현역 동쪽, 수내역 서쪽) */
const DEV_SIDE = { 서현: 'east', 수내: 'west' };

const W = 1000;
const midLat = ((BOUNDS.south + BOUNDS.north) / 2) * (Math.PI / 180);
const H = Math.round((W * (BOUNDS.north - BOUNDS.south)) / ((BOUNDS.east - BOUNDS.west) * Math.cos(midLat)));
const svg = ([lat, lng]) => [
  Math.round(((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W * 10) / 10,
  Math.round(((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * H * 10) / 10,
];
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const inside = ([lat, lng], m = 0) => {
  const dy = (BOUNDS.north - BOUNDS.south) * m, dx = (BOUNDS.east - BOUNDS.west) * m;
  return lat >= BOUNDS.south + dy && lat <= BOUNDS.north - dy && lng >= BOUNDS.west + dx && lng <= BOUNDS.east - dx;
};

/** 원본에서 이름이 비었거나 '-'인 도로 */
const roadName = (nm) => (!nm || nm === '-' ? '이름 없는 도로' : nm);

// 1) 링크: 중간점이 범위 안에 있는 것
const segs = [];
eachLink(SRC, (ll, g) => {
  const mid = ll[Math.floor(ll.length / 2)];
  if (!inside(mid)) return;
  segs.push({
    id: g('LINK_ID'), links: [g('LINK_ID')], a: g('F_NODE'), b: g('T_NODE'),
    road: roadName(g('ROAD_NAME')), rank: g('ROAD_RANK'),
    lanes: Number(g('LANES')) || 0, spd: Number(g('MAX_SPD')) || 0, len: Math.round(Number(g('LENGTH')) || 0),
    pts: ll.map(svg), ll: ll.map(([la, ln]) => [r6(la), r6(ln)]),
    _len: Number(g('LENGTH')) || 0,
  });
});
segs.sort((x, y) => x.id.localeCompare(y.id));

// 2) 노드: 링크 양 끝
const used = new Set(segs.flatMap((s) => [s.a, s.b]));
const pos = readNodePositions(SRC);
const ndbf = openDbf(path.join(SRC, 'MOCT_NODE.dbf'));
const nodes = {}, nodeType = {};
for (let i = 0; i < ndbf.n; i++) {
  const id = ndbf.get(i, 'NODE_ID');
  if (!used.has(id) || !pos.has(id)) continue;
  const ll = pos.get(id);
  nodes[id] = [...svg(ll), ndbf.get(i, 'NODE_NAME') || '중간 지점', r6(ll[0]), r6(ll[1])];
  nodeType[id] = ndbf.get(i, 'NODE_TYPE');
}

// 3) 예시 관측 배정: 같은 링크였던 관측·같은 CCTV 관측은 같은 링크로
const obsFile = 'src/data/observations.ts';
let obsSrc = fs.readFileSync(obsFile, 'utf8');
obsSrc = obsSrc.replace(/dev: '신촌-/g, "dev: '서현-").replace(/dev: '이대-/g, "dev: '수내-")
  .replace(/dev: '연세-02'/g, "dev: '서현-01'");
const obs = [...obsSrc.matchAll(/id: '([^']+)', src: '(\w+)', dev: '([^']+)'/g)].map((m) => ({ id: m[1], src: m[2], dev: m[3] }));
const oldTs = fs.readFileSync('src/data/nodelink.ts', 'utf8');
const oldSegOf = JSON.parse(oldTs.match(/SEG_OF: Record<string, string> = (\{[\s\S]*?\});/)[1]);

const parent = new Map(obs.map((o) => [o.id, o.id]));
const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
const union = (x, y) => parent.set(find(x), find(y));
for (const o of obs) for (const p of obs) {
  if (o.id < p.id && ((oldSegOf[o.id] && oldSegOf[o.id] === oldSegOf[p.id]) || (o.src === 'cctv' && o.dev === p.dev))) union(o.id, p.id);
}
const groups = new Map();
for (const o of obs) (groups.get(find(o.id)) ?? groups.set(find(o.id), []).get(find(o.id))).push(o);

// 보행 위험을 볼 만한 이름 있는 생활도로 중에서, 서로 떨어지게 고른다
const midOf = (s) => s.ll[Math.floor(s.ll.length / 2)];
const cands = segs.filter((s) => s.road !== '이름 없는 도로' && s.rank >= '103' && s.rank <= '107' && s._len >= 40 && s._len <= 260 && inside(midOf(s), 0.1));
const midLng = (BOUNDS.west + BOUNDS.east) / 2;
const dist = (p, q) => Math.hypot(p[0] - q[0], (p[1] - q[1]) * Math.cos(midLat));
const chosen = [], roadsUsed = new Set(), segOf = {};
const ordered = [...groups.values()].sort((x, y) => y.length - x.length || x[0].id.localeCompare(y[0].id));
for (const g of ordered) {
  const side = g.map((o) => DEV_SIDE[o.dev.split('-')[0]]).find(Boolean);
  const pool = cands.filter((s) => !chosen.includes(s) && (!side || (side === 'east') === (midOf(s)[1] >= midLng)));
  let best = null, bestScore = -1;
  for (const s of pool) {
    const d = chosen.length ? Math.min(...chosen.map((c) => dist(midOf(c), midOf(s)))) : 1;
    const score = d * (roadsUsed.has(s.road) ? 0.4 : 1) * (s.rank <= '105' ? 0.7 : 1);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  chosen.push(best);
  roadsUsed.add(best.road);
  for (const o of g) segOf[o.id] = best.id;
}

// 3-2) 관측 좌표: 배정한 링크 위 한 점에서 보도 쪽으로 조금 비킨 곳. 같은 CCTV는 같은 좌표, 단속차량은 관측마다 다르게
const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function pointOn(ll, frac, side) {
  const lens = ll.slice(1).map((p, i) => dist(ll[i], p));
  let left = lens.reduce((a, b) => a + b, 0) * frac;
  for (let i = 0; i < lens.length; i++) {
    if (left > lens[i] && i < lens.length - 1) { left -= lens[i]; continue; }
    const [a, b] = [ll[i], ll[i + 1]], t = lens[i] ? left / lens[i] : 0;
    const lat = a[0] + (b[0] - a[0]) * t, lng = a[1] + (b[1] - a[1]) * t;
    // 진행 방향의 수직으로 SIDE_M만큼 (위경도 1도 ≈ 111,320m)
    const dy = (b[0] - a[0]) * 111320, dx = (b[1] - a[1]) * 111320 * Math.cos(midLat), l = Math.hypot(dx, dy) || 1;
    return [r6(lat + ((dx / l) * SIDE_M * side) / 111320), r6(lng - ((dy / l) * SIDE_M * side) / (111320 * Math.cos(midLat)))];
  }
  return ll[0];
}
const SIDE_M = 7;
const posOf = {};
for (const o of obs) {
  const sg = segById(segOf[o.id]);
  const key = o.src === 'cctv' ? o.dev : o.id;
  const h = hash(key);
  posOf[o.id] = pointOn(sg.ll, o.src === 'cctv' ? 0.4 : 0.2 + (h % 600) / 1000, h % 2 ? 1 : -1);
}
obsSrc = obsSrc.replace(/(id: '([^']+)', src: '\w+', dev: '[^']+')(, lat: [\d.]+, lng: [\d.]+)?/g,
  (_, head, id) => `${head}, lat: ${posOf[id][0]}, lng: ${posOf[id][1]}`);

// 4) 저장
for (const s of segs) delete s._len;
const segOfTxt = obs.map((o) => ` ${JSON.stringify(o.id)}: ${JSON.stringify(segOf[o.id])}`).join(',\n');
fs.writeFileSync('src/data/nodelink.ts', `// 국토교통부 표준노드링크(${DATE} 배포)에서 ${AREA}만 잘라낸 예시 데이터
// scripts/build-demo-area.mjs로 만든다. pts: 약도용 SVG 좌표, ll: [위도, 경도]
import type { NodeMap, Segment } from '../types';

export const AREA_NAME = ${JSON.stringify(AREA)};
export const MAP_W = ${W};
export const MAP_H = ${H};
export const MAP_BOUNDS = ${JSON.stringify(BOUNDS).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace('{', '{ ').replace('}', ' }')};

/** 지도에 표시할 곳: [노드 이름, 표시 이름] */
export const LANDMARKS: [string, string][] = ${JSON.stringify(LANDMARKS)};

export const NODES: NodeMap = ${JSON.stringify(nodes)};

export const SEGMENTS: Segment[] = ${JSON.stringify(segs)};

/** 예시 관측 → 링크 배정 */
export const SEG_OF: Record<string, string> = {
${segOfTxt}
};
`);
fs.writeFileSync(obsFile, obsSrc);
fs.writeFileSync(GEOJSON, JSON.stringify({
  type: 'FeatureCollection', name: path.basename(GEOJSON, '.geojson'),
  features: [
    ...segs.map((s) => ({ type: 'Feature', properties: { kind: 'link', LINK_ID: s.id, F_NODE: s.a, T_NODE: s.b, ROAD_NAME: s.road, ROAD_RANK: s.rank, LANES: s.lanes, MAX_SPD: s.spd, LENGTH: s.len }, geometry: { type: 'LineString', coordinates: s.ll.map(([la, ln]) => [ln, la]) } })),
    ...Object.entries(nodes).map(([id, n]) => ({ type: 'Feature', properties: { kind: 'node', NODE_ID: id, NODE_NAME: n[2], NODE_TYPE: nodeType[id] }, geometry: { type: 'Point', coordinates: [n[4], n[3]] } })),
  ],
}));
console.log(`${AREA}: 링크 ${segs.length} · 노드 ${Object.keys(nodes).length} · ${W}×${H}`);
for (const g of ordered) { const s = segById(segOf[g[0].id]); console.log(`  ${s.road} (${s.rank}, ${s.len}m) ← ${g.map((o) => `${o.id} ${o.dev}`).join(', ')}`); }
function segById(id) { return segs.find((s) => s.id === id); }
