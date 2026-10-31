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

/** 좌표 → '서울특별시 동작구 본동' (프론트 서버의 /api/address가 브이월드에 묻는다). 실패하면 null */
export async function dongName(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(`/api/address?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
    if (!r.ok) return null;
    return ((await r.json()) as { area: string } | null)?.area ?? null;
  } catch { return null; }
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

/**
 * 서버 연결을 미리 열어 둔다. 공유 서버(Tailscale Funnel)는 새 연결마다 보안 연결(TLS)에 3초 넘게 걸려서,
 * 화면을 열 때·사진을 고를 때 미리 맺어 두면 '제보하기'를 눌렀을 때 그만큼 빨리 올라간다. 실패해도 상관없다
 */
export function warmUp() {
  fetch(`${API_BASE}/health`, { cache: 'no-store' }).catch(() => {});
}

/** onProgress: 올린 비율(0~1). fetch는 올리는 진행률을 알려 주지 않아 XMLHttpRequest로 보낸다 */
export function submitReport(r: ReportIn, onProgress?: (ratio: number) => void) {
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
  return new Promise<{ observation_id: string }>((ok, fail) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${API_BASE}/observations`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let body: { observation_id?: string; detail?: unknown } | null = null;
      try { body = JSON.parse(x.responseText); } catch { /* 본문 없음 */ }
      if (x.status >= 200 && x.status < 300 && body?.observation_id) ok({ observation_id: body.observation_id });
      else fail(new Error(typeof body?.detail === 'string' ? body.detail : `제보 서버 오류 (${x.status})`));
    };
    // 응답 없이 끊기면 fetch처럼 TypeError로 (화면에서 연결 문제 안내를 띄운다)
    x.onerror = () => fail(new TypeError('network'));
    x.send(fd);
  });
}

/** 제보자가 남긴 설명: 관측 메모로 붙인다 (관제 화면 처리 이력에 보인다) */
export function addReportNote(id: string, content: string) {
  return send<unknown>(`/observations/${id}/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, author: '시민 제보' }),
  });
}
