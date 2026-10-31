/**
 * 백엔드(RoadPush_BE, FastAPI) 연결 지점.
 * 응답 형식은 마스터 문서 4.4 '공통 분석 응답 형식'(+ 화면용 필드)을 따른다. 백엔드 docs/API.md 참고.
 * VITE_API_BASE_URL이 비어 있으면 프론트는 예시 데이터를 쓴다.
 */
import { devFlag } from '../lib/dev';
import type { Action, Condition, HistoryEntry, ObservationBase, Pass, Review, Source } from '../types';

type ApiPass = 'passable' | 'narrowed' | 'blocked' | 'undetermined';

export interface AnalysisResponse {
  observation_id: string;
  analysis_id: string | null;
  site_id: string;
  /** 구간 대표 위치 (같은 구간 관측은 같은 좌표 → 화면에서 한 지점으로 묶인다) */
  location: { latitude: number; longitude: number } | null;
  /** 사진 촬영 좌표 (없으면 null) */
  capture_location?: { latitude: number; longitude: number } | null;
  captured_at: string;
  /** 서버 접수 시각 (응답에 아직 없을 수 있다) */
  created_at?: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  passability: ApiPass | null;
  risk_score: number | null;
  uncertainty_reason: string | null;
  /** thumbnail: 목록·카드용 작은 사진 (백엔드가 아직 주지 않으면 원본을 쓴다) */
  images: { original: string; thumbnail?: string | null; surface_overlay?: string | null; obstacle_overlay?: string | null };
  review_status: 'pending' | 'confirmed' | 'corrected';
  human_passability: ApiPass | null;
  /** 사람이 고친 원인 (백엔드 추가 예정. 그 전에는 없음) */
  human_causes?: string[] | null;
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
  /** initial: 첫 분석 · reanalysis: 재분석 요청 */
  analysis_trigger?: string | null;
  action: { action_id: string | null; state: string; label: string; dept: string | null };
  /** id·edited_at은 메모 수정 API가 생기면 백엔드가 내려준다 (그 전에는 없음) */
  history: { t: string; txt: string; ai: boolean; by: string | null; id?: string | null; edited_at?: string | null }[];
}

// 끝에 '/'를 붙여 적어도 '/api/v1//observations'가 되지 않게 뗀다
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || undefined;
/** 관제 화면이 백엔드를 쓰는지 (개발 중 ?api=sample 이면 주소가 있어도 예시 데이터) */
export const USE_API = !!API_BASE && devFlag('api') !== 'sample';
/** 처리·검수·메모를 남긴 사람. 로그인이 아직 없어 한 이름으로 남긴다 (담당 부서와 헷갈리지 않게 부서 이름은 쓰지 않는다) */
export const ACTOR = '관제 담당자';

/** 응답 코드를 함께 담은 오류 (409 같은 '지금은 할 수 없음'을 연결 실패와 구분한다) */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new ApiError(`${path} 요청 실패 (${res.status})`, res.status);
  return res.json();
}

export const fetchObservations = async () => {
  // 개발 중 연결 실패·느린 응답 화면 확인용
  if (devFlag('api') === 'fail') throw new ApiError('/observations 요청 실패 (개발용 ?api=fail)', 0);
  if (devFlag('api') === 'slow') await new Promise((r) => setTimeout(r, 4000));
  return call<AnalysisResponse[]>('/observations');
};

/** 화면의 처리 상태 이름 → 백엔드 코드 */
export const ACTION_CODE: Record<Action, string> = {
  '미처리': 'none', '현장점검 요청': 'inspection_requested', '조치 중': 'in_progress', '조치 완료': 'done',
};

export const setActions = (ids: string[], action: Action, dept: string | null, note?: string) =>
  call<AnalysisResponse[]>('/observations/bulk-action', {
    method: 'POST',
    body: JSON.stringify({ observation_ids: ids, state: ACTION_CODE[action], dept, content: note, actor: ACTOR }),
  });

/** 사람 판정. comment는 오탐 사유 등 (백엔드 history에 '판정 수정 → … · 사유'로 남는다) */
export const review = (id: string, human: Pass | null, comment?: string) =>
  call<AnalysisResponse>(`/observations/${id}/reviews`, {
    method: 'POST',
    body: JSON.stringify(human
      ? { status: 'corrected', human_passability: human === 'hold' ? 'undetermined' : human, comment, reviewer: ACTOR }
      : { status: 'confirmed', comment, reviewer: ACTOR }),
  });
/** 판정 취소 → 미검수 (검수가 없으면 409) */
export const cancelReview = (id: string) =>
  call<AnalysisResponse>(`/observations/${id}/reviews/cancel`, { method: 'POST', body: JSON.stringify({ reviewer: ACTOR }) });

export const reanalyze = (id: string) => call<AnalysisResponse>(`/observations/${id}/reanalyze`, { method: 'POST', body: '{}' });
/** 재분석 요청 취소 (시작 전일 때만. 이미 분석 중이면 409) */
export const cancelReanalyze = (id: string) =>
  call<AnalysisResponse>(`/observations/${id}/reanalyze/cancel`, { method: 'POST', body: '{}' });

/** 메모 (처리 상태·검수는 바꾸지 않고 history에 '메모: …'로 남는다) */
export const addNote = (id: string, content: string) =>
  call<unknown>(`/observations/${id}/notes`, { method: 'POST', body: JSON.stringify({ content, author: ACTOR }) });

/** 메모 고치기 (지우기는 없다). 백엔드 메모 수정 API가 생기면 동작한다 */
export const editNote = (id: string, noteId: string, content: string) =>
  call<unknown>(`/observations/${id}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify({ content }) });

const toPass = (p: ApiPass | null): Pass => (p === null || p === 'undetermined' ? 'hold' : p);
const COND: Condition[] = ['night', 'rain', 'occluded', 'mixed', 'boundary_review', 'boundary_failed', 'surface_uncertain', 'occupancy_unverified', 'low_coverage'];
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
    // 접수 시각: created_at이 없으면 AI가 처음 남긴 이력(분석 완료) 시각으로 대신한다
    received: a.created_at ?? a.history.find((h) => h.ai)?.t ?? undefined,
    pass: toPass(a.passability),
    risk: a.risk_score,
    occ: a.occupancy,
    causes: a.causes,
    reason: a.uncertainty_reason
      ?? (waiting ? 'AI 분석 대기 중' : a.processing_status === 'failed' ? `분석 실패: ${a.failure_reason ?? ''}` : undefined),
    cond: COND.includes(a.uncertainty_code as Condition) ? (a.uncertainty_code as Condition) : undefined,
    action: a.action.label as Action,
    dept: a.action.dept ?? '미배정',
    // 재분석 대기는 판단 유보의 '재분석 요청'에 남기고, 첫 분석 대기만 따로 뺀다
    analyzing: waiting && a.analysis_trigger !== 'reanalysis',
    img: { original: a.images.original, thumb: a.images.thumbnail ?? undefined, overlay: a.images.obstacle_overlay ?? a.images.surface_overlay ?? undefined },
  };
  return {
    base,
    linkId: a.link_id,
    human: a.human_passability ? toPass(a.human_passability) : null,
    humanCauses: a.human_causes ?? null,
    review: REVIEW[a.review_status],
    reanalyze: waiting,
    // 메모는 memo로 따로 (화면에서 같은 때 남긴 처리 상태와 한 항목으로 묶고, 메모만 고칠 수 있게)
    hist: a.history.map((h): HistoryEntry => {
      const memo = h.txt.startsWith('메모: ') ? h.txt.slice('메모: '.length) : undefined;
      return {
        t: h.t, txt: memo != null ? '' : h.txt, ai: h.ai || undefined, by: h.by ?? undefined,
        ...(memo != null ? { memo } : {}), ...(h.id ? { id: h.id } : {}), ...(h.edited_at ? { editedAt: h.edited_at } : {}),
      };
    }),
  };
}
