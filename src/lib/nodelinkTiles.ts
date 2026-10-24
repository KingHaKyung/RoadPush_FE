// 전국 표준노드링크 타일. 지도에 보이는 격자만 받아 segById에 등록한다.
// - public/nodelink/ (scripts/build-nodelink-tiles.mjs로 만든 파일)가 있으면 그것을 쓴다
// - 없으면(배포 환경) /api/roads가 브이월드 데이터 API에서 받아 같은 형식으로 준다
import type { Segment } from '../types';
import { registerSegments } from './segments';

const BASE = `${import.meta.env.BASE_URL}nodelink/`;

interface Index { date: string; tile: number; q: number; links: number; nodes: number; tiles: Record<string, number> | null }
type RawLink = [string, string, string, string, string, number, number, number, number[]];

/** api/_roads.ts의 ROAD_TILE과 같아야 한다 */
const API_INDEX: Index = { date: '', tile: 0.025, q: 100000, links: 0, nodes: 0, tiles: null };

let indexP: Promise<Index> | null = null;
export function loadIndex(): Promise<Index> {
  indexP ??= fetch(`${BASE}index.json`)
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : API_INDEX))
    .catch(() => API_INDEX);
  return indexP;
}

const tileP = new Map<string, Promise<Segment[]>>();

function loadTile(key: string, ix: Index): Promise<Segment[]> {
  let p = tileP.get(key);
  if (p) return p;
  p = fetch(ix.tiles ? `${BASE}t/${key}.json` : `${import.meta.env.BASE_URL}api/roads?t=${key}`).then((r) => {
    if (!r.ok) throw new Error(`도로 타일 ${key}을 불러오지 못했습니다 (${r.status})`);
    return r.json();
  }).then(({ s, n }: { s: RawLink[]; n: Record<string, string> }) => {
    const [ty, tx] = key.split('_').map(Number);
    const segs = s.map(([id, a, b, road, rank, lanes, spd, len, c]): Segment => {
      let y = Math.round(ty * ix.tile * ix.q), x = Math.round(tx * ix.tile * ix.q);
      const ll: [number, number][] = [];
      for (let i = 0; i < c.length; i += 2) { y += c[i]; x += c[i + 1]; ll.push([y / ix.q, x / ix.q]); }
      return { id, links: [id], a, b, road: !road || road === '-' ? '이름 없는 도로' : road, rank, lanes, spd, len, pts: [], ll };
    });
    return registerSegments(segs, n);
  });
  p.catch(() => tileP.delete(key));
  tileP.set(key, p);
  return p;
}

const inKorea = (ty: number, tx: number, t: number) => ty * t >= 33 && (ty + 1) * t <= 39.5 && tx * t >= 124 && (tx + 1) * t <= 132;

/** 위경도 범위에 걸치는 타일의 링크 (타일 키별) */
export async function loadTilesIn(b: { south: number; west: number; north: number; east: number }) {
  const ix = await loadIndex();
  const keys: string[] = [];
  // 링크는 중간점(파일) 또는 첫 점(API)이 속한 타일에 들어 있으므로 한 칸씩 여유를 둔다
  for (let ty = Math.floor(b.south / ix.tile) - 1; ty <= Math.floor(b.north / ix.tile) + 1; ty++)
    for (let tx = Math.floor(b.west / ix.tile) - 1; tx <= Math.floor(b.east / ix.tile) + 1; tx++)
      if (ix.tiles ? ix.tiles[`${ty}_${tx}`] : inKorea(ty, tx, ix.tile)) keys.push(`${ty}_${tx}`);
  return Promise.all(keys.map(async (key) => ({ key, segs: await loadTile(key, ix) })));
}
