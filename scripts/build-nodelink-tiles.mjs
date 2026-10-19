// 국토교통부 표준노드링크 SHP(전국) → 지도용 격자 타일 JSON
// 사용: node scripts/build-nodelink-tiles.mjs [원본 폴더=data/raw] [출력 폴더=public/nodelink]
// 원본 폴더에는 MOCT_LINK.shp/.shx/.dbf, MOCT_NODE.dbf가 있어야 합니다.
import fs from 'node:fs';
import path from 'node:path';
import { DATE, eachLink, readNodeNames } from './nodelink-shp.mjs';

const SRC = process.argv[2] ?? 'data/raw';
const OUT = process.argv[3] ?? 'public/nodelink';
const TILE = 0.05; // 격자 크기(도). 클라이언트 src/lib/nodelinkTiles.ts는 index.json에서 읽는다
const Q = 1e5; // 좌표 정밀도 1e-5도(약 1m)

console.time('노드');
const { count: nodeCount, names: nodeName } = readNodeNames(SRC);
console.timeEnd('노드');
console.log(`노드 ${nodeCount.toLocaleString()} (이름 있음 ${nodeName.size.toLocaleString()})`);

console.time('링크');
/** 타일 키 → { s: 링크 JSON 문자열[], n: 노드 이름 } */
const tiles = new Map();
const { total, skipped } = eachLink(SRC, (ll, g, i, nRec) => {
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
  const a = g('F_NODE'), b = g('T_NODE');
  for (const id of [a, b]) { const nm = nodeName.get(id); if (nm) t.n[id] = nm; }
  t.s.push(JSON.stringify([g('LINK_ID'), a, b, g('ROAD_NAME'), g('ROAD_RANK'), Number(g('LANES')) || 0,
    Number(g('MAX_SPD')) || 0, Math.round(Number(g('LENGTH')) || 0), c]));
  if (i % 200000 === 0) console.log(`  ${i.toLocaleString()} / ${nRec.toLocaleString()}`);
});
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
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ date: DATE, tile: TILE, q: Q, links: total - skipped, nodes: nodeCount, tiles: index }));
console.timeEnd('저장');
console.log(`타일 ${tiles.size.toLocaleString()}개 · 링크 ${(total - skipped).toLocaleString()} · ${(bytes / 1e6).toFixed(0)}MB → ${OUT}`);
