import { API_BASE } from '../api/client';
import type { Action, Condition, Pass, Period, Route, RouteType, SortKey, Source } from '../types';

/** 판정 이름과 글자색(app.css 판정 토큰). 지도 핀 색은 PIN_COLOR */
export const PASS: Record<Pass, { label: string; color: string }> = {
  blocked: { label: '단절', color: 'var(--blocked)' },
  narrowed: { label: '좁아짐', color: 'var(--narrow)' },
  passable: { label: '통과 가능', color: 'var(--pass)' },
  hold: { label: '판단 유보', color: 'var(--hold)' },
};
export const PASS_KEYS = Object.keys(PASS) as Pass[];
/**
 * 지도 핀·묶음·막대 색. 인디고 포인트 색과 채도를 맞춘 판정 색 (app.css --c-* 와 같은 값).
 * ink는 그 위 글자색 (앰버는 밝아서 어두운 글자)
 */
export const PIN_COLOR: Record<Pass, { fill: string; ink: string }> = {
  blocked: { fill: '#E25563', ink: '#FFFFFF' },
  narrowed: { fill: '#F2A93B', ink: '#2A2214' },
  passable: { fill: '#2BA884', ink: '#FFFFFF' },
  hold: { fill: '#8B8FA8', ink: '#FFFFFF' },
};
export const ACTIONS: Action[] = ['미처리', '현장점검 요청', '조치 중', '조치 완료'];
/** 아직 끝나지 않은 상태 (우선 점검 목록에 남는다) */
export const OPEN_ACTIONS: Action[] = ['미처리', '현장점검 요청', '조치 중'];
export const DEPTS = ['미배정', '주차관리과', '도로관리과', '건설관리과', '교통행정과', '광고물관리과', '청소행정과', '경찰(182)'];

/** 처리 유형 이름 */
export const ROUTE_LABEL: Record<RouteType, string> = {
  A: '운영사 수거', B: '점유자 계도', C: '단속', D: '허가 확인', E: '수거', F: '정비 계획', X: '미분류',
};
/** 처리 유형 표시 이름 ('C 단속'). 미분류는 글자 없이 '미분류' */
export const routeName = (t: RouteType) => (t === 'X' ? ROUTE_LABEL.X : `${t} ${ROUTE_LABEL[t]}`);
/** 담당 부서가 정해지지 않은 처리 경로의 부서 값 */
export const NO_DEPT = '미배정';
const SAFETY_REPORT = { label: '안전신문고', url: 'https://www.safetyreport.go.kr' };
/**
 * 원인 → 처리 경로 (화면 안내용, 백엔드에 저장하지 않음). 탐지 클래스가 바뀌면 여기만 고치면 된다.
 * 부서 이름은 예시 지자체 기준이다.
 */
export const ROUTES: Record<string, Route> = {
  차량: { cause: '차량', type: 'C', dept: '주차관리과', guide: '보도 위 주정차 단속 대상입니다. 통로를 완전히 막았으면 우선 처리하세요.', link: SAFETY_REPORT },
  이륜차: { cause: '이륜차', type: 'C', dept: '경찰(182)', guide: '이륜차 보도 주차는 경찰 신고 대상입니다.', link: SAFETY_REPORT },
  PM: { cause: 'PM', type: 'A', dept: '교통행정과', guide: '공유 PM은 운영사에 수거를 요청하고, 미수거 시 견인합니다.' },
  자전거: { cause: '자전거', type: 'A', dept: '교통행정과', guide: '공유 자전거는 운영사 수거 요청, 개인 자전거 방치는 청소행정과로 넘기세요.' },
  적치물: { cause: '적치물', type: 'B', dept: '도로관리과', guide: '상가 적치물은 계도 대상입니다. 상습이면 감지 이력을 근거로 첨부하세요.' },
  입간판: { cause: '입간판', type: 'B', dept: '광고물관리과', guide: '보도 위 입간판·배너는 광고물 정비 대상입니다.' },
  공사시설: { cause: '공사시설', type: 'D', dept: '건설관리과', guide: '도로 점용 허가를 조회해 보행 통로 확보 조건을 확인하세요. 공사가 끝났으면 방치 자재입니다.' },
  쓰레기: { cause: '쓰레기', type: 'E', dept: '청소행정과', guide: '수거일이 지났는데 남아 있으면 수거를 요청하세요.' },
  // 길을 막았지만 모델 팀 4개 클래스에 없는 물체(쓰레기봉투·볼라드 등). 백엔드가 원인을 '장애물'로 보낸다
  장애물: { cause: '장애물', type: 'X', dept: '미배정', guide: '종류를 구분하지 못한 장애물입니다. 사진을 보고 담당 부서를 직접 지정하세요.' },
};
/** 원인마다 처리 경로 (같은 원인은 한 번만, 모르는 원인은 뺀다) */
export const routesOf = (causes: string[]): Route[] => [...new Set(causes)].flatMap((c) => (ROUTES[c] ? [ROUTES[c]] : []));
export const PERIOD_LABEL: Record<Period, string> = { today: '오늘', '3d': '최근 3일', all: '전체 기간' };
export const SORT_LABEL: Record<SortKey, string> = { time: '날짜순', area: '행정구역 이름순', risk: '위험도순' };
export const SRC_LABEL: Record<Source, string> = { cctv: 'CCTV', car: '단속차량', upload: '직접 업로드' };
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
export const COND_LABEL: Record<Condition, string> = {
  night: '야간', rain: '우천', occluded: '가림', mixed: '보도 구분',
  boundary_review: '경계 검토', boundary_failed: '경계 못 찾음', surface_uncertain: '걸을 면 불확실',
  occupancy_unverified: '장애물 범위 불확실', low_coverage: '측정 부족',
};
/** 기준 시각: 예시 데이터면 고정 시각, 백엔드에 연결하면 현재 시각 */
export const DEMO_NOW = API_BASE ? new Date() : new Date('2026-10-18T14:40:00+09:00');
