// 시민 제보 → 백엔드: 사진 검사(EXIF 촬영 시각·위치), 근처 지점 후보, 관측 등록
import { API_BASE } from '../api/client';

export interface SiteCandidates {
  sites: { site: { id: string; name: string }; distance_m: number }[];
  nearby_links: { link_id: string; road: string | null; distance_m: number }[];
}
export interface InspectResult { captured_at: string | null; lat: number | null; lng: number | null; candidates: SiteCandidates | null }

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, init);
  if (!r.ok) {
    let msg = `제보 서버 오류 (${r.status})`;
    try { const j = await r.json(); if (typeof j?.detail === 'string') msg = j.detail; } catch { /* 본문 없음 */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/** 등록 전: 사진의 촬영 시각·GPS와 주변 지점 후보 */
export function inspectPhoto(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return send<InspectResult>('/observations/inspect', { method: 'POST', body: fd });
}

export function siteCandidates(lat: number, lng: number) {
  return send<SiteCandidates>(`/sites/candidates?lat=${lat}&lng=${lng}`, { method: 'GET' });
}

export type Source = 'exif' | 'device' | 'manual';
export interface ReportIn {
  file: File;
  capturedAt: string; // ISO 8601, 시간대 포함
  capturedAtSource: Source;
  lat: number; lng: number; locationSource: Source;
  /** 근처 기존 지점이 있으면 그 지점, 없으면 새 지점 이름 */
  siteId?: string; newSiteName?: string;
}

export function submitReport(r: ReportIn) {
  const fd = new FormData();
  fd.append('file', r.file);
  fd.append('captured_at', r.capturedAt);
  fd.append('captured_at_source', r.capturedAtSource);
  fd.append('lat', String(r.lat));
  fd.append('lng', String(r.lng));
  fd.append('location_source', r.locationSource);
  if (r.siteId) fd.append('site_id', r.siteId);
  else fd.append('new_site_name', r.newSiteName ?? '시민 제보 지점');
  fd.append('source', 'upload');
  fd.append('device', '시민 제보');
  return send<{ observation_id: string }>('/observations', { method: 'POST', body: fd });
}

/** 제보자가 남긴 설명: 관측 메모로 붙인다 (관제 화면 처리 이력에 보인다) */
export function addReportNote(id: string, content: string) {
  return send<unknown>(`/observations/${id}/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, author: '시민 제보' }),
  });
}
