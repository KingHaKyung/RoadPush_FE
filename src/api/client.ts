/**
 * 백엔드(RoadPush_BE, FastAPI) 연결 지점.
 * 응답 형식은 마스터 문서 4.4 '공통 분석 응답 형식'(+ 화면용 필드)을 따른다. 백엔드 docs/API.md 참고.
 * VITE_API_BASE_URL이 비어 있으면 프론트는 예시 데이터를 쓴다.
 */
import type { Action, Condition, HistoryEntry, ObservationBase, Pass, Review, Source } from '../types';

type ApiPass = 'passable' | 'narrowed' | 'blocked' | 'undetermined';

export interface AnalysisResponse {
  observation_id: string;
  analysis_id: string | null;
  site_id: string;
  location: { latitude: number; longitude: number } | null;
  captured_at: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  passability: ApiPass | null;
  risk_score: number | null;
  uncertainty_reason: string | null;
  images: { original: string; surface_overlay?: string | null; obstacle_overlay?: string | null };
  review_status: 'pending' | 'confirmed' | 'corrected';
  human_passability: ApiPass | null;
  // 화면용 추가 필드
  site_name: string;
  link_id: string | null;
  source: string;
  device: string | null;
  area: string | null;
  addr: string | null;
  occupancy: number | null;
  causes: string[];
  uncertainty_code: string | null;
  failure_reason: string | null;
  action: { action_id: string | null; state: string; label: string; dept: string | null };
  history: { t: string; txt: string; ai: boolean; by: string | null }[];
}

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || undefined;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
  return res.json();
}

export const fetchObservations = () => call<AnalysisResponse[]>('/observations');

/** 화면의 처리 상태 이름 → 백엔드 코드 */
export const ACTION_CODE: Record<Action, string> = {
  '미처리': 'none', '현장점검 요청': 'inspection_requested', '조치 중': 'in_progress', '조치 완료': 'done',
};

export const setActions = (ids: string[], action: Action, dept: string | null, note?: string) =>
  call<AnalysisResponse[]>('/observations/bulk-action', {
    method: 'POST',
    body: JSON.stringify({ observation_ids: ids, state: ACTION_CODE[action], dept, content: note, actor: '교통행정과' }),
  });

export const review = (id: string, human: Pass | null) =>
  call<AnalysisResponse>(`/observations/${id}/reviews`, {
    method: 'POST',
    body: JSON.stringify(human
      ? { status: 'corrected', human_passability: human === 'hold' ? 'undetermined' : human, reviewer: '교통행정과' }
      : { status: 'confirmed', reviewer: '교통행정과' }),
  });

export const reanalyze = (id: string) => call<AnalysisResponse>(`/observations/${id}/reanalyze`, { method: 'POST', body: '{}' });

const toPass = (p: ApiPass | null): Pass => (p === null || p === 'undetermined' ? 'hold' : p);
const COND: Condition[] = ['night', 'rain', 'occluded', 'mixed'];
const REVIEW: Record<AnalysisResponse['review_status'], Review> = { pending: '미검수', confirmed: '확인', corrected: '수정' };

/** 백엔드 응답 → 화면 관측 (구간·이름은 useObservations에서 붙인다) */
export function toObservation(a: AnalysisResponse) {
  const waiting = a.processing_status === 'pending' || a.processing_status === 'processing';
  const base: ObservationBase = {
    id: a.observation_id,
    src: (['cctv', 'car', 'upload'].includes(a.source) ? a.source : 'upload') as Source,
    dev: a.device ?? '',
    lat: a.location?.latitude ?? NaN,
    lng: a.location?.longitude ?? NaN,
    area: a.area ?? undefined,
    addr: a.addr ?? undefined,
    t: a.captured_at,
    pass: toPass(a.passability),
    risk: a.risk_score,
    occ: a.occupancy,
    causes: a.causes,
    reason: a.uncertainty_reason
      ?? (waiting ? 'AI 분석 대기 중' : a.processing_status === 'failed' ? `분석 실패: ${a.failure_reason ?? ''}` : undefined),
    cond: COND.includes(a.uncertainty_code as Condition) ? (a.uncertainty_code as Condition) : undefined,
    action: a.action.label as Action,
    dept: a.action.dept ?? '미배정',
    img: { original: a.images.original, overlay: a.images.obstacle_overlay ?? a.images.surface_overlay ?? undefined },
  };
  return {
    base,
    linkId: a.link_id,
    human: a.human_passability ? toPass(a.human_passability) : null,
    review: REVIEW[a.review_status],
    reanalyze: waiting,
    hist: a.history.map((h): HistoryEntry => ({ t: h.t, txt: h.txt, ai: h.ai || undefined, by: h.by ?? undefined })),
  };
}
