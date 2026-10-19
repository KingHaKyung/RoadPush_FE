import { NODES, SEGMENTS } from '../data/nodelink';
import type { Filters, Observation, Pass, Period, Segment } from '../types';
import { DEMO_NOW } from './constants';

/** 신촌 예시 구간 + 지도에서 불러온 전국 타일 구간 */
export const segById = new Map(SEGMENTS.map((s) => [s.id, s]));
const tileNodeNames = new Map<string, string>();
export const nodeName = (id: string) => NODES[id]?.[2] ?? tileNodeNames.get(id) ?? (tileNodeNames.size ? '중간 지점' : '구역 밖 노드');

/** 타일 구간을 등록하고, 신촌 예시 데이터에 이미 있는 링크는 빼고 돌려준다 */
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
  const names = [NODES[sg.a]?.[2], NODES[sg.b]?.[2]].filter((n): n is string => !!n && n !== '중간 지점');
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

export const matchesFilters = (o: Observation, f: Filters) =>
  inPeriod(o, f.period) && f.src.has(o.src) && f.pass.has(effPass(o)) && f.act.has(o.action) &&
  (!f.q || (o.place + o.id).includes(f.q.trim()));

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
