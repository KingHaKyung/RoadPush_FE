export type Pass = 'blocked' | 'narrowed' | 'passable' | 'hold';
/** 처리 상태 (백엔드 action.label과 같다) */
export type Action = '미처리' | '현장점검 요청' | '조치 중' | '조치 완료';
/** 처리 유형: 누가·어떻게 처리하나 (A 운영사 수거 · B 점유자 계도 · C 단속 · D 허가 확인 · E 수거 · F 정비 계획) */
/** X: 미분류 (모델이 종류를 구분 못 한 '장애물'. 담당 부서를 사람이 지정) */
export type RouteType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'X';
/** 처리 경로 (화면에서만 계산해 보여 주는 안내. 백엔드에 저장하지 않는다) */
export interface Route {
  /** 이 경로를 만든 원인 */
  cause: string;
  type: RouteType;
  /** 기본 담당 부서 */
  dept: string;
  /** 담당자에게 보여 줄 처리 안내 */
  guide: string;
  /** 외부 신고 경로 (있을 때만) */
  link?: { label: string; url: string };
}
/** 현장 확인 결과 (처리 상태와 별개. 업무 종결과 현장 개선을 따로 본다) */
export type SiteCheck = '해소 확인' | '재발' | '새 관측 대기';
/** 같은 지점의 감지 이력으로 계산한 지속성 */
export interface Persistence {
  /** 일시: 한 번만 감지 · 지속: 연속 관측에서 계속 감지 · 상습: 사라졌다 다시 나타나기를 반복 */
  kind: '일시' | '지속' | '상습';
  /** 최근 7일 같은 원인 감지 횟수 (이 관측 포함) */
  n: number;
  /** 첫 감지부터 이 관측까지 일수 */
  days: number;
}
export type Source = 'cctv' | 'car' | 'upload';
/** 판단 유보 사유 (백엔드 uncertainty_code) */
export type Condition = 'night' | 'rain' | 'occluded' | 'mixed'
  | 'boundary_review' | 'boundary_failed' | 'surface_uncertain' | 'occupancy_unverified' | 'low_coverage';
export type Review = '미검수' | '확인' | '수정';
/** range: 직접 고른 기간 (Filters.range, 최대 RANGE_MAX_DAYS일) */
export type Period = 'today' | '3d' | 'range';
/** 날짜 'YYYY-MM-DD' (화면 시간대 기준, 양 끝 포함) */
export interface DateRange { from: string; to: string }
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
  /** 서버가 받은 시각 (백엔드 created_at). 시민이 며칠 전 사진을 올리면 촬영 시각(t)보다 한참 뒤다 */
  received?: string;
  pass: Pass;
  risk: number | null;
  occ: number | null;
  causes: string[];
  reason?: string;
  cond?: Condition;
  action: Action;
  dept: string;
  /** 첫 AI 분석이 아직 안 끝남 (판정이 없어 판단 유보·지도에서 빼고 목록에만 '분석 중'으로) */
  analyzing?: boolean;
  /** 백엔드 연결 시: 원본 사진·분석 결과 이미지 주소 */
  img?: { original: string; thumb?: string; overlay?: string };
}

/** 화면에서 쓰는 관측: AI 결과 + 사람 판단·처리 기록 */
export interface Observation extends ObservationBase {
  seg: string;
  place: string;
  /**
   * 아래 셋은 화면에서만 계산하는 값 (백엔드에 저장하지 않음)
   * routes: 원인마다 처리 경로 (원인이 둘이고 기본 부서가 다르면 두 부서 모두 안내). 위험이 아니거나 원인이 없으면 빈 배열
   */
  routes: Route[];
  /** 현장 확인: 다음 관측에서 원인이 사라졌는지(해소), 사라졌다 다시 나타났는지(재발) */
  site: SiteCheck | null;
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
export type ObservationPatch = Partial<Pick<Observation, 'action' | 'dept' | 'human' | 'review' | 'reanalyze'>>;

export interface Filters {
  period: Period;
  /** period가 range일 때 보는 기간 */
  range: DateRange;
  src: Set<Source>;
  pass: Set<Pass>;
  act: Set<Action>;
  q: string;
  sort: SortKey;
  /** 담당 부서 필터 ('' = 전체). 부서별로 자기 건만 보는 용도 */
  dept: string;
}
