import type { Action, Pass, Period, SortKey, Source } from '../types';

/** 판정 이름과 글자색(KRDS -60 텍스트 토큰). 지도 핀 색은 PIN_COLOR */
export const PASS: Record<Pass, { label: string; color: string }> = {
  blocked: { label: '단절', color: 'var(--blocked)' },
  narrowed: { label: '좁아짐', color: 'var(--narrow)' },
  passable: { label: '통과 가능', color: 'var(--pass)' },
  hold: { label: '판단 유보', color: 'var(--hold)' },
};
export const PASS_KEYS = Object.keys(PASS) as Pass[];
/**
 * 지도 핀·묶음 색: KRDS element 토큰 (krds_tokens.css, light).
 * 단절 element-danger(danger-50) · 좁아짐 element-warning(warning-30) · 통과 가능 element-success(success-50) · 판단 유보 gray-50
 * ink는 그 위 글자색 (warning-30은 밝아서 gray-90)
 */
export const PIN_COLOR: Record<Pass, { fill: string; ink: string }> = {
  blocked: { fill: '#DE3412', ink: '#FFFFFF' },
  narrowed: { fill: '#FFB114', ink: '#1E2124' },
  passable: { fill: '#228738', ink: '#FFFFFF' },
  hold: { fill: '#6D7882', ink: '#FFFFFF' },
};
/** 지표 카드·목록 강조색 (KRDS 시스템 색, 흰 바탕에서 큰 숫자·선으로 읽히는 톤) */
export const ACCENT = {
  danger: 'var(--krds-color-light-danger-50)',
  warning: 'var(--krds-color-light-warning-50)',
  success: 'var(--krds-color-light-success-50)',
  info: 'var(--krds-color-light-information-50)',
  primary: 'var(--krds-color-light-primary-50)',
  gray: 'var(--krds-color-light-gray-60)',
} as const;
export const ACTIONS: Action[] = ['미처리', '현장점검 요청', '조치 중', '조치 완료'];
export const DEPTS = ['미배정', '주차관리과', '도로관리과', '건설관리과', '교통행정과'];
export const PERIOD_LABEL: Record<Period, string> = { today: '오늘', '3d': '최근 3일', all: '전체 기간' };
export const SORT_LABEL: Record<SortKey, string> = { time: '날짜순', area: '행정구역 이름순', risk: '위험도순' };
export const SRC_LABEL: Record<Source, string> = { cctv: 'CCTV', car: '단속차량' };
export const RANK: Record<string, string> = {
  '101': '고속국도', '102': '도시고속도로', '103': '일반국도', '104': '특별·광역시도',
  '105': '국가지원지방도', '106': '지방도', '107': '시·군·구도', '108': '기타',
};
/** 연속수치지형도 도로중심선 코드 (데이터 설명서 v5.1.1) */
export const CL_KIND: Record<string, string> = {
  RDD000: '도로', RDD001: '고속국도', RDD002: '일반국도', RDD003: '지방도', RDD004: '특별시도',
  RDD005: '광역시도', RDD006: '시도', RDD007: '군도', RDD008: '면리간도로', RDD009: '소로',
};
export const CL_PAVE: Record<string, string> = {
  RDQ001: '아스팔트', RDQ002: '아스팔트콘크리트', RDQ003: '콘크리트', RDQ004: '블록', RDQ005: '비포장', RDQ006: '포장',
};
export const COND_LABEL = { night: '야간', rain: '우천', occluded: '가림', mixed: '보도 구분' } as const;
/** 예시 데이터 기준 시각 */
export const DEMO_NOW = new Date('2026-10-18T14:40:00+09:00');
