import { NODES, SEGMENTS } from '../data/nodelink';
import type { Filters, Observation, Pass, Period, Pin, Segment, SortKey } from '../types';
import { CAUSE_LABEL, COND_LABEL, DEMO_NOW, SRC_LABEL } from './constants';
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

export function inPeriod(o: Observation, period: Period, now = DEMO_NOW): boolean {
  if (period === 'all') return true;
  const t = new Date(o.t);
  if (period === 'today') return t.toDateString() === now.toDateString();
  return (now.getTime() - t.getTime()) / 36e5 <= 72;
}

/** 검색어: 띄어쓰기로 나눈 낱말이 모두 위치·행정구역·주소·장비·관측 ID·유보 사유 중 어딘가에 있으면 통과 */
export function matchesQuery(o: Observation, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [o.place, o.area, o.addr, SRC_LABEL[o.src], o.dev, o.id, o.reason, o.cond && COND_LABEL[o.cond], ...o.causes.map((c) => CAUSE_LABEL[c]), ...o.depts].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export const matchesFilters = (o: Observation, f: Filters) =>
  inPeriod(o, f.period) && f.src.has(o.src) && f.pass.has(effPass(o)) && f.act.has(o.action) && (!f.dept || o.depts.includes(f.dept)) && matchesQuery(o, f.q);

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
    if (o.seg !== sg.id || !inPeriod(o, f.period) || !f.src.has(o.src)) continue;
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

/** 같은 좌표 관측을 묶어 지도 핀으로 (기간·수집 경로 필터 후 최신 관측, 판정·처리 상태·검색어로 표시 여부) */
export function pinsOf(obs: Observation[], f: Filters): Pin[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs) {
    if (!inPeriod(o, f.period) || !f.src.has(o.src)) continue;
    const k = pinKey(o);
    (by.get(k) ?? by.set(k, []).get(k)!).push(o);
  }
  const pins: Pin[] = [];
  for (const [key, os] of by) {
    const o = os.reduce((a, b) => (b.t > a.t ? b : a));
    const pass = effPass(o);
    if (!f.pass.has(pass) || !f.act.has(o.action) || (f.dept && !o.depts.includes(f.dept)) || !matchesQuery(o, f.q)) continue;
    pins.push({ key, lat: o.lat, lng: o.lng, obs: o, pass, n: os.length });
  }
  return pins;
}

/** 담당 부서 표시 (여러 부서면 쉼표로) */
export const deptText = (o: Observation) => (o.depts.length ? o.depts.join(', ') : '미배정');
