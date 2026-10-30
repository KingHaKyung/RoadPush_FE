// 지표 카드용 집계: 추세(구간별 관측 수)와 어제 대비 증감
import type { Filters, Observation, Pin } from '../types';
import { DEMO_NOW } from './constants';
import { effPass, obsTime, periodBounds } from './segments';

export type KpiKey = 'blocked' | 'narrowed' | 'open' | 'hold';
type Pred = (o: Observation) => boolean;

/** 위험 지도 지표: 단절·좁아짐·판단 유보는 판정, 미처리 위험은 위험 판정 + 미처리. 분석 중(판정 없음)은 뺀다 */
export const kpiPred = (k: KpiKey): Pred =>
  k === 'open' ? (o) => !o.analyzing && effPass(o) !== 'passable' && o.action === '미처리' : (o) => !o.analyzing && effPass(o) === k;

/** 지표에 들어가는 지점인지 (카드의 큰 숫자) */
export const siteCounts = (k: KpiKey, s: Pin) =>
  k === 'open' ? s.pass !== 'passable' && s.obs.action === '미처리' : s.pass === k;

const H = 36e5;
/** 기간을 n칸으로 나눠 칸마다 관측 수 (오늘 24시간, 최근 3일 72시간, 고른 기간은 지금까지). 수집 경로 필터 반영 */
export function trend(obs: Observation[], f: Filters, pred: Pred, n = 12, now = DEMO_NOW): number[] {
  const [start, until] = periodBounds(f, now);
  // 오늘·고른 기간은 아직 오지 않은 시간을 빼고 지금까지만
  const end = Math.min(until, now.getTime());
  const span = Math.max(H, end - start);
  const size = span / n, out = new Array<number>(n).fill(0);
  for (const o of obs) {
    if (!f.src.has(o.src) || !pred(o)) continue;
    const i = Math.floor((obsTime(o) - start) / size);
    if (i >= 0 && i < n) out[i]++;
  }
  return out;
}

/** 최근 24시간과 그 전 24시간의 관측 수 */
export function dayDelta(obs: Observation[], f: Filters, pred: Pred, now = DEMO_NOW): { now: number; prev: number } {
  const end = now.getTime();
  let a = 0, b = 0;
  for (const o of obs) {
    if (!f.src.has(o.src) || !pred(o)) continue;
    const age = end - obsTime(o);
    if (age >= 0 && age < 24 * H) a++;
    else if (age >= 24 * H && age < 48 * H) b++;
  }
  return { now: a, prev: b };
}

/** 기간 이름 + 추세 칸 크기 */
export const spanLabel = (f: Filters) => (f.period === 'today' ? '오늘 · 2시간 단위' : f.period === '3d' ? '최근 3일 · 6시간 단위' : `${f.range.from} ~ ${f.range.to}`);
