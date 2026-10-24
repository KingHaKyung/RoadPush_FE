// 브이월드 데이터 API(LT_L_MOCTLINK, 표준노드링크)에서 한 타일의 도로 링크를 받아
// public/nodelink/t/*.json과 같은 형식으로 바꾼다. Vercel 함수(api/roads.ts)와 개발 서버(vite.config.ts)가 함께 쓴다.

export const ROAD_TILE = 0.025;
const Q = 100000;
const PAGE = 1000;

// 도시고속을 고속보다, 국가지원지방도를 지방도보다 먼저 본다
const RANKS: [RegExp, string][] = [
  [/도시고속/, '102'], [/고속/, '101'], [/국도/, '103'], [/특별|광역/, '104'],
  [/국가지원/, '105'], [/지방도/, '106'], [/시|군|구/, '107'],
];
const rankOf = (h: string) => RANKS.find(([re]) => re.test(h))?.[1] ?? '108';

interface Feature {
  geometry: { type: string; coordinates: number[][][] | number[][] };
  properties: { link_id: string; road_name?: string; max_spd?: string; rd_rank_h?: string };
}

function meters(pts: number[][]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    m += Math.hypot((x2 - x1) * k, y2 - y1) * 111320;
  }
  return Math.round(m);
}

/** t = "{위도 칸}_{경도 칸}" (ROAD_TILE도 단위). 링크는 첫 점이 들어 있는 타일에만 넣는다 */
export async function roadTile(t: string, key: string, domain: string): Promise<string> {
  const m = /^(\d{3,4})_(\d{4})$/.exec(t);
  if (!m) throw new RangeError('타일 번호가 올바르지 않습니다');
  const ty = +m[1], tx = +m[2];
  const s = ty * ROAD_TILE, w = tx * ROAD_TILE, n = s + ROAD_TILE, e = w + ROAD_TILE;
  if (s < 33 || n > 39.5 || w < 124 || e > 132) throw new RangeError('국내 범위가 아닙니다');

  const page = async (p: number): Promise<{ pages: number; feats: Feature[] }> => {
    const q = new URLSearchParams({
      service: 'data', version: '2.0', request: 'GetFeature', format: 'json', data: 'LT_L_MOCTLINK',
      size: String(PAGE), page: String(p), geomFilter: `BOX(${w},${s},${e},${n})`,
      geometry: 'true', attribute: 'true', crs: 'EPSG:4326', domain, key,
    });
    const r = await fetch(`https://api.vworld.kr/req/data?${q}`, { headers: { Referer: `${domain}/` } });
    const res = (await r.json())?.response;
    if (res?.status === 'NOT_FOUND') return { pages: 0, feats: [] };
    if (res?.status !== 'OK') throw new Error(`브이월드 도로 데이터 오류: ${res?.error?.text ?? r.status}`);
    return { pages: +res.page.total, feats: res.result.featureCollection.features };
  };

  const first = await page(1);
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.pages - 1) }, (_, i) => page(i + 2)));
  const y0 = Math.round(ty * ROAD_TILE * Q), x0 = Math.round(tx * ROAD_TILE * Q);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const f of [first, ...rest].flatMap((r) => r.feats)) {
    const g = f.geometry;
    const pts = (g.type === 'MultiLineString' ? (g.coordinates as number[][][]).flat() : g.coordinates as number[][]);
    const id = f.properties.link_id;
    if (!pts.length || seen.has(id)) continue;
    const [lng, lat] = pts[0];
    if (lat < s || lat >= n || lng < w || lng >= e) continue;
    seen.add(id);
    let y = y0, x = x0;
    const c: number[] = [];
    for (const [px, py] of pts) {
      const Y = Math.round(py * Q), X = Math.round(px * Q);
      c.push(Y - y, X - x); y = Y; x = X;
    }
    const p = f.properties;
    out.push([id, '', '', p.road_name || '-', rankOf(p.rd_rank_h ?? ''), 0, +(p.max_spd ?? 0) || 0, meters(pts), c]);
  }
  return JSON.stringify({ s: out, n: {} });
}
