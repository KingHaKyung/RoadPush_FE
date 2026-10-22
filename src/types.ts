export type Pass = 'blocked' | 'narrowed' | 'passable' | 'hold';
/**
 * 처리 상태. RoadPush는 발견·전달·해소 확인만 맡고, 계도·단속 같은 처리 과정은 기존 행정 시스템에서 진행한다.
 * 미전달: 아직 담당 부서로 넘기지 않음 · 전달됨: 처리 요청서를 넘김 · 해소 확인: 다음 관측에서 사라짐
 * 재발: 해소된 뒤 같은 원인이 다시 감지됨 · 오탐 종결: 담당자가 AI 오류로 정리
 */
export type Action = '미전달' | '전달됨' | '해소 확인' | '재발' | '오탐 종결';
/** 처리 유형: 누가·어떻게 처리하나 (A 운영사 수거 · B 점유자 계도 · C 단속 · D 허가 확인 · E 수거 · F 정비 계획) */
export type RouteType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
/**
 * 탐지 클래스 (2026-10-22 확정안). 처리 경로가 같고 생김새가 비슷한 것끼리 합쳤다.
 * vehicle 승용차·트럭·버스·오토바이 · construction 바리케이드 · debris 입간판·리어카·의자·탁자 · micromobility 자전거·킥보드
 */
export type Cause = 'vehicle' | 'construction' | 'debris' | 'micromobility';
export interface Route {
  /** 이 경로를 만든 원인 */
  cause: Cause;
  type: RouteType;
  /** 기본 담당 부서 */
  dept: string;
  /** 담당자에게 보여 줄 처리 안내 */
  guide: string;
  /** 외부 신고 경로 (있을 때만) */
  link?: { label: string; url: string };
}
/** 같은 지점의 감지 이력으로 계산한 지속성 */
export interface Persistence {
  /** 일시: 한 번만 감지 · 지속: 연속 관측에서 계속 감지 · 상습: 사라졌다 다시 나타나기를 반복 */
  kind: '일시' | '지속' | '상습';
  /** 최근 7일 같은 원인 감지 횟수 (이 관측 포함) */
  n: number;
  /** 첫 감지부터 이 관측까지 일수 */
  days: number;
}
export type Source = 'cctv' | 'car';
export type Condition = 'night' | 'rain' | 'occluded' | 'mixed';
export type Review = '미검수' | '확인' | '수정';
export type Period = 'today' | '3d' | 'all';
/** 정렬: 날짜(최신순) · 행정구역 이름(가나다순) · 위험도(높은 순) */
export type SortKey = 'time' | 'area' | 'risk';
export type Tab = 'map' | 'list' | 'hold';

/** 노드: [svgX, svgY, 이름, 위도, 경도] */
export type NodeMap = Record<string, [number, number, string, number, number]>;

/** 표준노드링크의 링크 1개 = 지도 구간 1개 */
export interface Segment {
  id: string;
  links: string[];
  a: string;
  b: string;
  road: string;
  rank: string;
  lanes: number;
  spd: number;
  len: number;
  pts: [number, number][];
  ll: [number, number][];
  /** 연속수치지형도 도로폭(m). 표준노드링크 링크는 가까운 도로중심선에서 가져온다 */
  width?: number;
  /** 연속수치지형도 도로중심선일 때만 (표준노드링크 링크가 아님) */
  cl?: { ufid: string; name: string; kind: string; lanes: number; width: number; pave: string; oneway: string; divider: string };
}

export interface HistoryEntry {
  t: string;
  txt: string;
  ai?: boolean;
  by?: string;
}

/** 수집·분석된 관측 (원본 AI 결과) */
export interface ObservationBase {
  id: string;
  src: Source;
  dev: string;
  /** 촬영 위치 (백엔드 location). 같은 CCTV는 같은 좌표 */
  lat: number;
  lng: number;
  /** 행정구역(시군구 + 법정동). 정렬·검색 기준 */
  area?: string;
  /** 지번 주소 (행정동) */
  addr?: string;
  t: string;
  pass: Pass;
  risk: number | null;
  occ: number | null;
  causes: Cause[];
  reason?: string;
  cond?: Condition;
  action: Action;
}

/** 화면에서 쓰는 관측: AI 결과 + 사람 판단·처리 기록 */
export interface Observation extends ObservationBase {
  seg: string;
  place: string;
  /** 원인마다 정한 처리 경로. 위험이 아니거나 원인이 없으면 빈 배열 */
  routes: Route[];
  /**
   * 담당 부서. routes와 같은 순서로 원인마다 하나씩 (원인이 둘이고 부서가 다르면 두 부서 모두에 연락).
   * 처리 경로가 없으면 사람이 지정한 부서만 (없으면 빈 배열 = 미배정)
   */
  depts: string[];
  /** 같은 지점의 감지 이력. 원인이 없으면 null */
  persist: Persistence | null;
  human: Pass | null;
  review: Review;
  reanalyze: boolean;
  hist: HistoryEntry[];
}

/** 지도 핀 하나 = 같은 좌표에서 나온 관측 묶음(CCTV는 카메라 한 대, 단속차량은 관측 한 건) */
export interface Pin {
  /** 좌표로 만든 키 */
  key: string;
  lat: number;
  lng: number;
  /** 필터를 통과한 가장 최근 관측 */
  obs: Observation;
  pass: Pass;
  /** 이 지점의 관측 수 */
  n: number;
}

/** 사람이 바꾼 값 (AI 결과와 따로 저장) */
export type ObservationPatch = Partial<Pick<Observation, 'action' | 'depts' | 'human' | 'review' | 'reanalyze'>>;

export interface Filters {
  period: Period;
  src: Set<Source>;
  pass: Set<Pass>;
  act: Set<Action>;
  q: string;
  sort: SortKey;
  /** 담당 부서 필터 ('' = 전체). 부서별로 자기 건만 보는 용도 */
  dept: string;
}
