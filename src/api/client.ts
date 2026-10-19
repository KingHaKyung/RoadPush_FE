/**
 * 백엔드(RoadPush_Backend, FastAPI) 연결 지점.
 * 응답 형식은 마스터 문서 4.4 '공통 분석 응답 형식'을 따른다.
 * VITE_API_BASE_URL이 비어 있으면 프론트는 예시 데이터를 쓴다.
 */
export interface AnalysisResponse {
  observation_id: string;
  analysis_id: string;
  site_id: string;
  location: { latitude: number; longitude: number };
  captured_at: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  passability: 'passable' | 'narrowed' | 'blocked' | 'undetermined' | null;
  risk_score: number | null;
  uncertainty_reason: string | null;
  images: { original: string; surface_overlay?: string; obstacle_overlay?: string };
  review_status: 'pending' | 'confirmed' | 'corrected';
  human_passability: 'passable' | 'narrowed' | 'blocked' | null;
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export async function fetchObservations(): Promise<AnalysisResponse[]> {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다');
  const res = await fetch(`${API_BASE}/observations`);
  if (!res.ok) throw new Error(`관측 목록을 불러오지 못했습니다 (${res.status})`);
  return res.json();
}
