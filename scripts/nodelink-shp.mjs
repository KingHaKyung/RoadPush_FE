// 국토교통부 표준노드링크 SHP/DBF 읽기 (build-nodelink-tiles.mjs, build-demo-area.mjs 공용)
import fs from 'node:fs';
import path from 'node:path';

export const DATE = '2026-10-14';

// ITRF2000 중부원점 TM(GRS80, 원점 38N 127E, 가산 200000/600000, 축척 1) → 위경도
const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
const lat0 = (38 * Math.PI) / 180, lon0 = (127 * Math.PI) / 180, FE = 200000, FN = 600000;
const m1 = 1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256;
const meridian = (p) => a * (m1 * p - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
  + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
const M0 = meridian(lat0);
const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
export function toLatLng(x, y) {
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
export function openDbf(file) {
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

/** 노드 이름 (이름 있는 노드만) */
export function readNodeNames(src) {
  const dbf = openDbf(path.join(src, 'MOCT_NODE.dbf'));
  const names = new Map();
  for (let i = 0; i < dbf.n; i++) {
    const nm = dbf.get(i, 'NODE_NAME');
    if (nm) names.set(dbf.get(i, 'NODE_ID'), nm);
  }
  return { count: dbf.n, names };
}

/** 노드 위치: NODE_ID → [위도, 경도] */
export function readNodePositions(src) {
  const dbf = openDbf(path.join(src, 'MOCT_NODE.dbf'));
  const shp = fs.readFileSync(path.join(src, 'MOCT_NODE.shp'));
  const shx = fs.readFileSync(path.join(src, 'MOCT_NODE.shx'));
  const pos = new Map();
  for (let i = 0; i < dbf.n; i++) {
    const off = shx.readUInt32BE(100 + i * 8) * 2 + 8;
    if (shp.readInt32LE(off) !== 1) continue;
    pos.set(dbf.get(i, 'NODE_ID'), toLatLng(shp.readDoubleLE(off + 4), shp.readDoubleLE(off + 12)));
  }
  return pos;
}

/**
 * 링크를 하나씩 넘겨준다. ll은 [위도, 경도][], get(필드명)으로 속성을 읽는다.
 * 반환값은 전체 레코드 수와 건너뛴(선이 아닌) 레코드 수.
 */
export function eachLink(src, fn) {
  const dbf = openDbf(path.join(src, 'MOCT_LINK.dbf'));
  const shp = fs.readFileSync(path.join(src, 'MOCT_LINK.shp'));
  const shx = fs.readFileSync(path.join(src, 'MOCT_LINK.shx'));
  const nRec = (shx.length - 100) / 8;
  if (nRec !== dbf.n) throw new Error(`SHP(${nRec})와 DBF(${dbf.n}) 레코드 수가 다릅니다`);
  let skipped = 0;
  for (let i = 0; i < nRec; i++) {
    const off = shx.readUInt32BE(100 + i * 8) * 2 + 8; // 레코드 헤더(8바이트) 다음
    const type = shp.readInt32LE(off);
    if (type !== 3 && type !== 13 && type !== 23) { skipped++; continue; }
    const nParts = shp.readInt32LE(off + 36), nPts = shp.readInt32LE(off + 40);
    const ptOff = off + 44 + nParts * 4;
    const ll = [];
    for (let k = 0; k < nPts; k++) ll.push(toLatLng(shp.readDoubleLE(ptOff + k * 16), shp.readDoubleLE(ptOff + k * 16 + 8)));
    fn(ll, (name) => dbf.get(i, name), i, nRec);
  }
  return { total: nRec, skipped };
}
