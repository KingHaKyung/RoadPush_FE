import type { Action, Pass, Source } from '../types';

export const PASS: Record<Pass, { label: string; color: string }> = {
  blocked: { label: '단절', color: 'var(--blocked)' },
  narrowed: { label: '좁아짐', color: 'var(--narrow)' },
  passable: { label: '통과 가능', color: 'var(--pass)' },
  hold: { label: '판단 유보', color: 'var(--hold)' },
};
export const PASS_KEYS = Object.keys(PASS) as Pass[];
export const ACTIONS: Action[] = ['미처리', '현장점검 요청', '조치 중', '조치 완료'];
export const DEPTS = ['미배정', '주차관리과', '도로관리과', '건설관리과', '교통행정과'];
export const SRC_LABEL: Record<Source, string> = { cctv: 'CCTV', car: '단속차량' };
export const RANK: Record<string, string> = {
  '101': '고속국도', '102': '도시고속도로', '103': '일반국도', '104': '특별·광역시도',
  '105': '국가지원지방도', '106': '지방도', '107': '시·군·구도', '108': '기타',
};
export const COND_LABEL = { night: '야간', rain: '우천', occluded: '가림', mixed: '보도 구분' } as const;
/** 예시 데이터 기준 시각 */
export const DEMO_NOW = new Date('2026-10-18T14:40:00+09:00');
