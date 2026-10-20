export type Pass = 'blocked' | 'narrowed' | 'passable' | 'hold';
export type Action = '미처리' | '현장점검 요청' | '조치 중' | '조치 완료';
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
  causes: string[];
  reason?: string;
  cond?: Condition;
  action: Action;
  dept: string;
}

/** 화면에서 쓰는 관측: AI 결과 + 사람 판단·처리 기록 */
export interface Observation extends ObservationBase {
  seg: string;
  place: string;
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
export type ObservationPatch = Partial<Pick<Observation, 'action' | 'dept' | 'human' | 'review' | 'reanalyze'>>;

export interface Filters {
  period: Period;
  src: Set<Source>;
  pass: Set<Pass>;
  act: Set<Action>;
  q: string;
  sort: SortKey;
}
