// 국토교통부 표준노드링크 SHP(전국) → 카카오맵용 격자 타일 JSON
// 사용: node scripts/build-nodelink-tiles.mjs [원본 폴더=data/raw] [출력 폴더=public/nodelink]
// 원본 폴더에는 MOCT_LINK.shp/.shx/.dbf, MOCT_NODE.shp/.dbf가 있어야 합니다.
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] ?? 'data/raw';
const OUT = process.argv[3] ?? 'public/nodelink';
const TILE = 0.05; // 격자 크기(도). 클라이언트 src/lib/nodelinkTiles.ts와 같아야 함
const Q = 1e5; // 좌표 정밀도 1e-5도(약 1m)
const DATE = '2026-10-14';

// ITRF2000 중부원점 TM(GRS80, 원점 38N 127E, 가산 200000/600000, 축척 1) → 위경도
const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
const lat0 = (38 * Math.PI) / 180, lon0 = (127 * Math.PI) / 180, FE = 200000, FN = 600000;
const m1 = 1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256;
const meridian = (p) => a * (m1 * p - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
  + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
const M0 = meridian(lat0);
const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
function toLatLng(x, y) {
  const mu = (M0 + (y - FN)) / (a * m1);
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const C = ep2 * c * c, T = t * t, N = a / Math.sqrt(1 - e2 * s * s), R = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const D = (x - FE) / N;
  const lat = p1 - ((N * t) / R) * (D ** 2 / 2 - ((5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * D ** 6) / 720);
  const lng = lon0 + (D - ((1 + 2 * T + C) * D ** 3) / 6 + ((5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * D ** 5) / 120) / c;
  return [(lat * 180) / Math.PI, (lng * 180) / Math.PI];
}

// DBF를 레코드 단위로 읽는 함수 (한글은 CP949)
const dec = new TextDecoder('euc-kr');
function openDbf(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(4), hl = buf.readUInt16LE(8), rl = buf.readUInt16LE(10);
  const fields = {};
  for (let o = 32, p = 1; buf[o] !== 0x0d; o += 32) {
    const name = buf.toString('latin1', o, o + 11).replace(/\0.*$/s, '');
    const len = buf[o + 16];
    fields[name] = [p, len];
    p += len;
  }
  const get = (i, name) => { const [p, len] = fields[name]; const s = hl + i * rl + p; return dec.decode(buf.subarray(s, s + len)).trim(); };
  return { n, get };
}

console.time('노드');
const nodeDbf = openDbf(path.join(SRC, 'MOCT_NODE.dbf'));
const nodeName = new Map();
for (let i = 0; i < nodeDbf.n; i++) {
  const nm = nodeDbf.get(i, 'NODE_NAME');
  if (nm) nodeName.set(nodeDbf.get(i, 'NODE_ID'), nm);
}
console.timeEnd('노드');
console.log(`노드 ${nodeDbf.n.toLocaleString()} (이름 있음 ${nodeName.size.toLocaleString()})`);

console.time('링크');
const linkDbf = openDbf(path.join(SRC, 'MOCT_LINK.dbf'));
const shp = fs.readFileSync(path.join(SRC, 'MOCT_LINK.shp'));
const shx = fs.readFileSync(path.join(SRC, 'MOCT_LINK.shx'));
const nRec = (shx.length - 100) / 8;
if (nRec !== linkDbf.n) throw new Error(`SHP(${nRec})와 DBF(${linkDbf.n}) 레코드 수가 다릅니다`);

/** 타일 키 → { s: 링크 JSON 문자열[], n: 노드 이름 } */
const tiles = new Map();
let skipped = 0;
for (let i = 0; i < nRec; i++) {
  const off = shx.readUInt32BE(100 + i * 8) * 2 + 8; // 레코드 헤더(8바이트) 다음
  const type = shp.readInt32LE(off);
  if (type !== 3 && type !== 13 && type !== 23) { skipped++; continue; }
  const nParts = shp.readInt32LE(off + 36), nPts = shp.readInt32LE(off + 40);
  const ptOff = off + 44 + nParts * 4;
  const ll = [];
  for (let k = 0; k < nPts; k++) ll.push(toLatLng(shp.readDoubleLE(ptOff + k * 16), shp.readDoubleLE(ptOff + k * 16 + 8)));
  const mid = ll[Math.floor(ll.length / 2)];
  const ty = Math.floor(mid[0] / TILE), tx = Math.floor(mid[1] / TILE);
  const key = `${ty}_${tx}`;
  let t = tiles.get(key);
  if (!t) tiles.set(key, (t = { s: [], n: {} }));

  // 타일 원점 기준 1e-5도 정수, 앞 점과의 차이로 저장
  let py = Math.round(ty * TILE * Q), px = Math.round(tx * TILE * Q);
  const c = [];
  for (const [lat, lng] of ll) {
    const y = Math.round(lat * Q), x = Math.round(lng * Q);
    c.push(y - py, x - px);
    py = y; px = x;
  }
  const g = (nm) => linkDbf.get(i, nm);
  const a = g('F_NODE'), b = g('T_NODE');
  for (const id of [a, b]) { const nm = nodeName.get(id); if (nm) t.n[id] = nm; }
  t.s.push(JSON.stringify([g('LINK_ID'), a, b, g('ROAD_NAME'), g('ROAD_RANK'), Number(g('LANES')) || 0,
    Number(g('MAX_SPD')) || 0, Math.round(Number(g('LENGTH')) || 0), c]));
  if (i % 200000 === 0) console.log(`  ${i.toLocaleString()} / ${nRec.toLocaleString()}`);
}
console.timeEnd('링크');

console.time('저장');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 't'), { recursive: true });
const index = {};
let bytes = 0;
for (const [key, t] of tiles) {
  const body = `{"s":[${t.s.join(',')}],"n":${JSON.stringify(t.n)}}`;
  fs.writeFileSync(path.join(OUT, 't', `${key}.json`), body);
  index[key] = t.s.length;
  bytes += body.length;
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ date: DATE, tile: TILE, q: Q, links: nRec - skipped, nodes: nodeDbf.n, tiles: index }));
console.timeEnd('저장');
console.log(`타일 ${tiles.size.toLocaleString()}개 · 링크 ${(nRec - skipped).toLocaleString()} · ${(bytes / 1e6).toFixed(0)}MB → ${OUT}`);
