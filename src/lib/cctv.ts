// 교통 CCTV 위치 (전국)
// - ITS 국가교통정보센터: 개발 서버 /api/its/cctvs (고속도로·국도. 영상 주소는 열 때 /api/its/stream으로 받는다. 키는 서버에만)
// - 도시교통정보센터(UTIC): scripts/build-cctv.mjs가 만든 public/cctv/utic.json (키 없음)
// 두 곳에 같은 카메라가 있으면 ITS를 쓴다 (등록 IP 제한 없이 재생되므로)
// 고속도로·국도(CCTV_HIGHWAY)를 끄면 ITS는 부르지 않고 UTIC 일반도로만 쓴다
import { CCTV_HIGHWAY } from './features';
import { lineMeters } from './geo';

export type CctvRoad = '고속도로' | '국도' | '일반도로';
export const CCTV_ROADS: CctvRoad[] = ['고속도로', '국도', '일반도로'];

export interface Cctv {
  id: string; name: string; center: string; lat: number; lng: number;
  road: CctvRoad; src: 'its' | 'utic';
  /** ITS에서 영상 주소를 다시 찾을 때 쓰는 값 */
  its?: { type: 'ex' | 'its'; name: string };
}

/** 이 거리(m) 안이거나 이름(공백 무시)이 같은 UTIC 카메라는 ITS와 같은 카메라로 본다 */
const SAME_M = 120;
/** 가까운 카메라를 빨리 찾기 위한 격자 크기(도, 약 300m) */
const CELL = 0.003;

const json = (url: string) => fetch(url)
  .then((r) => (r.headers.get('content-type')?.includes('json') ? r.json() : { cctvs: [] }))
  .then((j: { cctvs?: Cctv[] }) => j.cctvs ?? [])
  .catch(() => [] as Cctv[]);

const bare = (s: string) => s.replace(/\s+/g, '');
const uticRoad = (center: string): CctvRoad => (center.includes('고속도로') ? '고속도로' : center.includes('국도') ? '국도' : '일반도로');
const cell = (lat: number, lng: number) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;

let p: Promise<Cctv[]> | null = null;
/** 못 받은 곳은 빈 배열로 */
export function loadCctvs(): Promise<Cctv[]> {
  if (p) return p;
  const utic = json(`${import.meta.env.BASE_URL}cctv/utic.json`).then((l) => l.map((c) => ({ ...c, road: uticRoad(c.center), src: 'utic' as const })));
  if (!CCTV_HIGHWAY) return (p = utic.then((l) => l.filter((c) => c.road === '일반도로')));
  p = Promise.all([json('/api/its/cctvs'), utic]).then(([its, utic]) => {
    const names = new Set(its.map((x) => bare(`[${x.center}]${x.name}`)));
    const grid = new Map<string, Cctv[]>();
    for (const x of its) { const k = cell(x.lat, x.lng); grid.set(k, [...(grid.get(k) ?? []), x]); }
    const near = (c: Cctv) => {
      const [a, b] = cell(c.lat, c.lng).split(',').map(Number);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        if ((grid.get(`${a + i},${b + j}`) ?? []).some((x) => lineMeters([[x.lat, x.lng], [c.lat, c.lng]]) < SAME_M)) return true;
      return false;
    };
    const rest = utic.filter((c) => !names.has(bare(c.name)) && !near(c));
    return [...its, ...rest];
  });
  return p;
}

/** ITS 카메라의 지금 HLS 영상 주소 (주소는 시간이 지나면 바뀌어 열 때마다 받는다) */
export async function itsStreamUrl(c: Cctv): Promise<string | null> {
  if (!c.its) return null;
  const q = new URLSearchParams({ type: c.its.type, name: c.its.name, lat: String(c.lat), lng: String(c.lng) });
  try {
    const j = await (await fetch(`/api/its/stream?${q}`)).json();
    return typeof j?.hls === 'string' ? j.hls : null;
  } catch { return null; }
}

/** UTIC 영상 재생 페이지 (개발 서버·백엔드가 UTIC 재생 주소로 보내 준다) */
export const cctvPlayerUrl = (id: string) => `/api/utic/player?cctvid=${encodeURIComponent(id)}`;
