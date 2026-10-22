import type { Action, Cause, Pass, Period, Route, RouteType, SortKey, Source } from '../types';

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
export const ACTIONS: Action[] = ['미전달', '전달됨', '해소 확인', '재발', '오탐 종결'];
/** 아직 끝나지 않은 상태 (우선 점검 목록에 남는다) */
export const OPEN_ACTIONS: Action[] = ['미전달', '전달됨', '재발'];
export const DEPTS = ['미배정', '주차관리과', '도로관리과', '건설관리과', '교통행정과', '광고물관리과', '청소행정과', '경찰(182)'];

/** 처리 유형 이름 */
export const ROUTE_LABEL: Record<RouteType, string> = {
  A: '운영사 수거', B: '점유자 계도', C: '단속', D: '허가 확인', E: '수거', F: '정비 계획',
};
const SAFETY_REPORT = { label: '안전신문고', url: 'https://www.safetyreport.go.kr' };
/** 탐지 클래스 이름과 포함하는 것 (모델 학습 클래스 2026-10-22 확정안) */
export const CAUSE_LABEL: Record<Cause, string> = {
  vehicle: '차량', construction: '공사시설', debris: '적치물', micromobility: '자전거·킥보드',
};
export const CAUSE_HINT: Record<Cause, string> = {
  vehicle: '승용차·트럭·버스·오토바이', construction: '바리케이드', debris: '입간판·리어카·의자·탁자', micromobility: '자전거·킥보드',
};
/**
 * 원인(탐지 클래스) → 처리 경로. 클래스가 바뀌면 여기만 고치면 된다.
 * 부서 이름은 예시 지자체 기준이며, 담당자가 화면에서 이관할 수 있다.
 * 모델이 구분하지 못하는 것(오토바이·입간판·개인 자전거)은 기본 부서로 보내고 안내 문구로 이관을 권한다.
 */
export const ROUTES: Record<Cause, Route> = {
  vehicle: { cause: 'vehicle', type: 'C', dept: '주차관리과', guide: '보도 위 주정차 단속 대상입니다. 오토바이면 경찰(182) 신고 대상이니 이관하세요.', link: SAFETY_REPORT },
  micromobility: { cause: 'micromobility', type: 'A', dept: '교통행정과', guide: '공유 킥보드·자전거는 운영사에 수거를 요청하고, 미수거 시 견인합니다. 개인 자전거 방치면 청소행정과로 이관하세요.' },
  debris: { cause: 'debris', type: 'B', dept: '도로관리과', guide: '상가 적치물·리어카·의자는 계도 대상입니다. 입간판·배너면 광고물관리과로 이관하세요. 상습이면 감지 이력을 근거로 첨부하세요.' },
  construction: { cause: 'construction', type: 'D', dept: '건설관리과', guide: '도로 점용 허가를 조회해 보행 통로 확보 조건을 확인하세요. 공사가 끝났으면 방치 자재입니다.' },
};
/** 원인마다 처리 경로 (같은 원인은 한 번만) */
export const routesOf = (causes: Cause[]): Route[] => [...new Set(causes)].map((c) => ROUTES[c]);
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
