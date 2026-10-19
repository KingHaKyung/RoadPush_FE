// 전국 표준노드링크 타일 (scripts/build-nodelink-tiles.mjs가 public/nodelink/에 만든 것)
// 지도에 보이는 격자만 받아 segById에 등록한다.
import type { Segment } from '../types';
import { registerSegments } from './segments';

const BASE = `${import.meta.env.BASE_URL}nodelink/`;

interface Index { date: string; tile: number; q: number; links: number; nodes: number; tiles: Record<string, number> }
type RawLink = [string, string, string, string, string, number, number, number, number[]];

let indexP: Promise<Index | null> | null = null;
/** 타일 목록. 타일을 만들지 않았으면 null */
export function loadIndex(): Promise<Index | null> {
  indexP ??= fetch(`${BASE}index.json`)
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
    .catch(() => null);
  return indexP;
}

const tileP = new Map<string, Promise<Segment[]>>();

function loadTile(key: string, ix: Index): Promise<Segment[]> {
  let p = tileP.get(key);
  if (p) return p;
  p = fetch(`${BASE}t/${key}.json`).then((r) => {
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

/** 위경도 범위에 걸치는 타일의 링크 (타일 키별) */
export async function loadTilesIn(b: { south: number; west: number; north: number; east: number }) {
  const ix = await loadIndex();
  if (!ix) return [];
  const keys: string[] = [];
  // 링크는 중간점이 속한 타일에 들어 있으므로 한 칸씩 여유를 둔다
  for (let ty = Math.floor(b.south / ix.tile) - 1; ty <= Math.floor(b.north / ix.tile) + 1; ty++)
    for (let tx = Math.floor(b.west / ix.tile) - 1; tx <= Math.floor(b.east / ix.tile) + 1; tx++)
      if (ix.tiles[`${ty}_${tx}`]) keys.push(`${ty}_${tx}`);
  return Promise.all(keys.map(async (key) => ({ key, segs: await loadTile(key, ix) })));
}
