import { NODES, SEGMENTS } from '../data/nodelink';
import type { DateRange, Filters, Observation, Pass, Pin, Segment, SortKey } from '../types';
import { COND_LABEL, DEMO_NOW, PASS_KEYS, SRC_LABEL } from './constants';
import { distToLine } from './geo';

/** 예시 지역 구간 + 지도에서 불러온 전국 타일 구간 */
export const segById = new Map(SEGMENTS.map((s) => [s.id, s]));
const tileNodeNames = new Map<string, string>();
export const nodeName = (id: string) => NODES[id]?.[2] ?? tileNodeNames.get(id) ?? (tileNodeNames.size ? '중간 지점' : '구역 밖 노드');

/** 타일 구간을 등록하고, 예시 지역 데이터에 이미 있는 링크는 빼고 돌려준다 */
export function registerSegments(segs: Segment[], names: Record<string, string>): Segment[] {
  for (const [id, nm] of Object.entries(names)) tileNodeNames.set(id, nm);
  const fresh: Segment[] = [];
  for (const s of segs) {
    if (segById.has(s.id)) continue;
    segById.set(s.id, s);
    fresh.push(s);
  }
  return fresh;
}

/** 관측 위치 이름: 도로명 + 알아보기 쉬운 노드 이름 */
export function segPlace(segId: string): string {
  const sg = segById.get(segId);
  if (!sg) return '알 수 없는 구간';
  const names = [NODES[sg.a]?.[2], NODES[sg.b]?.[2]].filter((n): n is string => !!n && n !== '중간 지점' && n !== '속성변화점');
  const good = names.find((n) => !/[0-9]/.test(n)) ?? names[0];
  return good ? `${sg.road} · ${good} 부근` : sg.road;
}

export const effPass = (o: Observation): Pass => o.human ?? o.pass;

/** 직접 고르는 기간의 최대 길이: 3개월 (분기 보고까지. 길수록 지도·추세가 무거워진다) */
export const RANGE_MAX_DAYS = 92;
const DAY_MS = 864e5;
/** Date → 'YYYY-MM-DD' (화면 시간대) */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 'YYYY-MM-DD' → 그날 0시 (화면 시간대) */
export const dayStart = (s: string) => new Date(`${s}T00:00:00`).getTime();
export const addDays = (s: string, n: number) => ymd(new Date(dayStart(s) + n * DAY_MS + 12 * 36e5));
/** 기간 선택을 처음 열 때: 최근 30일 */
export const defaultRange = (now = DEMO_NOW): DateRange => ({ from: addDays(ymd(now), -29), to: ymd(now) });
/** 기간의 [시작, 끝) 시각. range의 끝은 마지막 날 다음 0시 */
export function periodBounds(f: Pick<Filters, 'period' | 'range'>, now = DEMO_NOW): [number, number] {
  if (f.period === 'today') { const s = dayStart(ymd(now)); return [s, s + DAY_MS]; }
  if (f.period === '3d') return [now.getTime() - 72 * 36e5, now.getTime() + 1];
  return [dayStart(f.range.from), dayStart(f.range.to) + DAY_MS];
}
/**
 * 기간·추세에 쓰는 시각: 서버가 받은 시각 (없으면 촬영 시각).
 * 시민이 며칠 전 사진을 앨범에서 올려도 '최근 3일'·'어제 대비'에 들어오게 한다 (화면에 보이는 시각은 촬영 시각 그대로)
 */
export const obsTime = (o: Pick<Observation, 't' | 'received'>) => new Date(o.received ?? o.t).getTime();

export function inPeriod(o: Observation, f: Pick<Filters, 'period' | 'range'>, now = DEMO_NOW): boolean {
  const [a, b] = periodBounds(f, now);
  const t = obsTime(o);
  return t >= a && t < b;
}

/** 검색어: 띄어쓰기로 나눈 낱말이 모두 위치·행정구역·주소·장비·관측 ID·유보 사유 중 어딘가에 있으면 통과 */
export function matchesQuery(o: Observation, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [o.place, o.area, o.addr, SRC_LABEL[o.src], o.dev, o.id, o.reason, o.cond && COND_LABEL[o.cond], ...o.causes, o.dept].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** 분석 중인 관측은 판정이 없어서 판정 전체를 볼 때만 */
const passOk = (o: Observation, f: Filters) => (o.analyzing ? f.pass.size === PASS_KEYS.length : f.pass.has(effPass(o)));

export const matchesFilters = (o: Observation, f: Filters) =>
  inPeriod(o, f) && f.src.has(o.src) && passOk(o, f) && f.act.has(o.action) && (!f.dept || o.dept === f.dept) && matchesQuery(o, f.q);

/** 정렬 비교: 날짜는 최신순, 행정구역은 가나다순, 위험도는 높은 순(점수 없음은 뒤). 같으면 최신순 */
export function compareObs(sort: SortKey) {
  const byTime = (a: Observation, b: Observation) => b.t.localeCompare(a.t);
  if (sort === 'area') return (a: Observation, b: Observation) => (a.area ?? '').localeCompare(b.area ?? '', 'ko') || byTime(a, b);
  if (sort === 'risk') return (a: Observation, b: Observation) => (b.risk ?? -1) - (a.risk ?? -1) || byTime(a, b);
  return byTime;
}

/** 구간의 최신 촬영 관측 (기간·수집 경로 필터 반영) */
export function segLatest(sg: Segment, obs: Observation[], f: Filters): Observation | null {
  let best: Observation | null = null;
  for (const o of obs) {
    if (o.analyzing || o.seg !== sg.id || !inPeriod(o, f) || !f.src.has(o.src)) continue;
    if (!best || o.t > best.t) best = o;
  }
  return best;
}

export function segShown(sg: Segment, obs: Observation[], f: Filters): boolean {
  const o = segLatest(sg, obs, f);
  return !!o && f.pass.has(effPass(o)) && f.act.has(o.action);
}

/** 폴리라인 길이 기준 중간점과 방향 */
export function midOf(pts: [number, number][]) {
  const parts: { a: [number, number]; b: [number, number]; l: number }[] = [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    parts.push({ a, b, l });
    tot += l;
  }
  let h = tot / 2;
  for (const { a, b, l } of parts) {
    if (h <= l) {
      const t = l ? h / l : 0;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, tot };
    }
    h -= l;
  }
  return { x: pts[0][0], y: pts[0][1], ang: 0, tot };
}

/** 좌표에서 가장 가까운 예시 지역 링크 (백엔드 관측처럼 좌표만 있을 때) */
export function nearestSeg(lat: number, lng: number): string {
  let best = SEGMENTS[0].id, bd = Infinity;
  for (const sg of SEGMENTS) { const d = distToLine([lat, lng], sg.ll); if (d < bd) { bd = d; best = sg.id; } }
  return best;
}

export const pinKey = (o: Pick<Observation, 'lat' | 'lng'>) => `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;

/** 같은 좌표 관측을 묶어 지도 핀으로 (기간·수집 경로 필터 후 최신 관측, 판정·처리 상태·검색어로 표시 여부). 분석 중인 관측은 판정이 없어 뺀다 */
export function pinsOf(obs: Observation[], f: Filters): Pin[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs) {
    if (o.analyzing || !inPeriod(o, f) || !f.src.has(o.src)) continue;
    const k = pinKey(o);
    (by.get(k) ?? by.set(k, []).get(k)!).push(o);
  }
  const pins: Pin[] = [];
  for (const [key, os] of by) {
    const o = os.reduce((a, b) => (b.t > a.t ? b : a));
    const pass = effPass(o);
    if (!f.pass.has(pass) || !f.act.has(o.action) || (f.dept && o.dept !== f.dept) || !matchesQuery(o, f.q)) continue;
    pins.push({ key, lat: o.lat, lng: o.lng, obs: o, pass, n: os.length });
  }
  return pins;
}

