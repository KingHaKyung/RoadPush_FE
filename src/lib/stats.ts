// 위험 지도 현황 줄 집계
import type { Pin } from '../types';

export type KpiKey = 'blocked' | 'narrowed' | 'open' | 'hold';

/** 현황에 들어가는 지점인지: 단절·좁아짐·판단 유보는 판정, 미처리 위험은 위험 판정 + 미처리 */
export const siteCounts = (k: KpiKey, s: Pin) =>
  k === 'open' ? s.pass !== 'passable' && s.obs.action === '미처리' : s.pass === k;
