export type Pass = 'blocked' | 'narrowed' | 'passable' | 'hold';
export type Action = '미처리' | '현장점검 요청' | '조치 중' | '조치 완료';
export type Source = 'cctv' | 'car';
export type Condition = 'night' | 'rain' | 'occluded' | 'mixed';
export type Review = '미검수' | '확인' | '수정';
export type Period = 'today' | '3d' | 'all';
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

/** 사람이 바꾼 값 (AI 결과와 따로 저장) */
export type ObservationPatch = Partial<Pick<Observation, 'action' | 'dept' | 'human' | 'review' | 'reanalyze'>>;

export interface Filters {
  period: Period;
  src: Set<Source>;
  pass: Set<Pass>;
  act: Set<Action>;
  q: string;
  sort: 'time' | 'risk';
}
