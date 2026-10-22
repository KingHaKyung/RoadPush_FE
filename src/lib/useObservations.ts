import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, fetchObservations, reanalyze, review, setActions, toObservation, type AnalysisResponse } from '../api/client';
import { SEG_OF } from '../data/nodelink';
import { SAMPLE_OBSERVATIONS } from '../data/observations';
import type { HistoryEntry, Observation, ObservationPatch, Persistence, SiteCheck } from '../types';
import { DEMO_NOW, PASS, routesOf } from './constants';
import { addMinutes } from './format';
import { nearestSeg, pinKey, segById, segPlace } from './segments';

type Saved = Record<string, ObservationPatch & { log?: HistoryEntry[] }>;
// v3: 처리 상태를 백엔드와 같은 '미처리·현장점검 요청·조치 중·조치 완료'로 되돌림 (v2는 '미전달·전달됨…')
const KEY = 'roadpush-web-v3';
const DAY = 864e5;

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 불가 환경 */ }
}

/** 화면에서만 계산하는 값을 붙이기 전의 관측 */
type Raw = Omit<Observation, 'routes' | 'persist' | 'site'>;

/** 위험 판정이고 원인이 있는 관측 = 처리 대상 감지 */
const isDetection = (o: Raw) => (o.human ?? o.pass) !== 'passable' && (o.human ?? o.pass) !== 'hold' && o.causes.length > 0;
const sameCause = (a: Raw, b: Raw) => a.causes.some((c) => b.causes.includes(c));

/**
 * 화면에서만 계산해 보여 주는 값 (백엔드에 저장하지 않음). 같은 지점(같은 좌표 = 같은 카메라)의 관측 이력으로 계산한다.
 * - 처리 경로: 원인마다 처리 유형·기본 부서·안내
 * - 지속성: 최근 7일 같은 원인 감지 횟수. 중간에 사라진 관측이 끼어 있으면 '상습', 아니면 '지속', 한 번이면 '일시'
 * - 현장 확인: 처리를 넘긴 뒤 다음 관측에서 원인이 사라졌으면 '해소 확인', 다음 관측이 아직 없으면 '새 관측 대기',
 *   사라졌다가 다시 나타났으면 '재발'. 처리 상태(업무 종결)와 따로 본다
 */
function derive(list: Raw[]): Observation[] {
  const bySite = new Map<string, Raw[]>();
  for (const o of list) {
    const k = pinKey(o);
    (bySite.get(k) ?? bySite.set(k, []).get(k)!).push(o);
  }
  for (const os of bySite.values()) os.sort((a, b) => a.t.localeCompare(b.t));

  return list.map((o) => {
    const routes = o.pass === 'passable' || o.pass === 'hold' ? [] : routesOf(o.causes);
    if (!isDetection(o)) return { ...o, routes, persist: null, site: null };
    const os = bySite.get(pinKey(o))!;
    const i = os.indexOf(o);
    const t = new Date(o.t).getTime();

    const past = os.slice(0, i + 1).filter((p) => t - new Date(p.t).getTime() <= 7 * DAY);
    const hits = past.filter((p) => isDetection(p) && sameCause(p, o));
    const first = hits[0];
    const gap = first ? past.some((p) => p.t > first.t && p.t < o.t && !(isDetection(p) && sameCause(p, o))) : false;
    const persist: Persistence = {
      kind: hits.length <= 1 ? '일시' : gap ? '상습' : '지속',
      n: hits.length,
      days: first ? Math.max(1, Math.ceil((t - new Date(first.t).getTime()) / DAY) + 1) : 1,
    };

    let site: SiteCheck | null = null;
    const next = os[i + 1];
    if (o.action !== '미처리' && !next) site = '새 관측 대기';
    else if (o.action !== '미처리' && !isDetection(next) && (next.human ?? next.pass) === 'passable') site = '해소 확인';
    else if (persist.kind === '상습') site = '재발';
    return { ...o, routes, persist, site };
  });
}

/** 예시 데이터: 브라우저에 사람 판단·처리 기록을 저장한다 */
function useSampleObservations() {
  const [saved, setSaved] = useState<Saved>(load);

  const observations = useMemo<Observation[]>(() => derive(
    SAMPLE_OBSERVATIONS.map((o) => {
      const s = saved[o.id] ?? {};
      const hist: HistoryEntry[] = [{
        t: addMinutes(o.t, 1, DEMO_NOW), ai: true,
        txt: o.pass === 'hold' ? 'AI 분석 완료 · 판단 유보' : `AI 분석 완료 · ${PASS[o.pass].label} (위험도 ${o.risk})`,
      }];
      if (o.dept !== '미배정') hist.push({ t: addMinutes(o.t, 3, DEMO_NOW), txt: `${o.dept} 배정` });
      if (o.action !== '미처리' && o.pass !== 'passable') hist.push({ t: addMinutes(o.t, 5, DEMO_NOW), txt: `처리 상태: ${o.action}` });
      // 예시 데이터는 배정해 둔 링크, 실제 관측은 좌표에서 가장 가까운 링크
      const seg = SEG_OF[o.id] ?? nearestSeg(o.lat, o.lng);
      return {
        human: null, review: '미검수', reanalyze: false,
        ...o, ...s, seg, place: segPlace(seg),
        hist: [...hist, ...(s.log ?? [])],
      } as Raw;
    })), [saved]);

  const update = useCallback((ids: string | string[], patch: ObservationPatch, logTxt?: string) => {
    setSaved((prev) => {
      const next = { ...prev };
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const cur = { ...(next[id] ?? {}), ...patch };
        if (logTxt) cur.log = [...(cur.log ?? []), { t: DEMO_NOW.toISOString(), txt: logTxt, by: '교통행정과' }];
        next[id] = cur;
      }
      save(next);
      return next;
    });
  }, []);

  return { observations, update, error: null as string | null };
}

const POLL_MS = 5000;

/** 백엔드 연결: 관측을 API로 읽고, 처리 상태·사람 판정·재분석을 API로 보낸다 */
function useApiObservations() {
  const [rows, setRows] = useState<AnalysisResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const refresh = useCallback(async () => {
    try { setRows(await fetchObservations()); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  // 처음 한 번 + 분석 대기 중인 관측이 결과로 바뀌도록 주기적으로 다시 읽는다
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);

  const observations = useMemo<Observation[]>(() => derive(
    rows
      .filter((a) => a.location) // 좌표가 없는 관측은 위치 확인 전까지 화면에서 뺀다
      .map((a) => {
        const { base, linkId, ...rest } = toObservation(a);
        const seg = linkId && segById.has(linkId) ? linkId : nearestSeg(base.lat, base.lng);
        return { ...base, ...rest, seg, place: segPlace(seg) } as Raw;
      })), [rows]);

  const update = useCallback(async (ids: string | string[], patch: ObservationPatch, logTxt?: string) => {
    const list = Array.isArray(ids) ? ids : [ids];
    try {
      if (patch.action !== undefined || patch.dept !== undefined) {
        // 처리 상태와 부서는 함께 저장된다. 한쪽만 바꾸면 다른 쪽은 현재 값을 유지
        const cur = rowsRef.current.find((a) => a.observation_id === list[0]);
        const action = patch.action ?? (cur?.action.label as ObservationPatch['action']) ?? '미처리';
        const dept = patch.dept ?? cur?.action.dept ?? null;
        await setActions(list, action!, dept === '미배정' ? null : dept, logTxt);
      }
      if (patch.review !== undefined && patch.review !== '미검수') {
        for (const id of list) await review(id, patch.human ?? null);
      }
      if (patch.reanalyze === true) {
        for (const id of list) await reanalyze(id);
      }
      // 사람 판정 취소·재분석 취소·메모·오탐 사유는 아직 백엔드에 저장하지 않는다 (백엔드 docs/FRONTEND_INTEGRATION.md 참고)
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
  }, [refresh]);

  return { observations, update, error };
}

/** 관측 목록과 사람 판단·처리 기록. VITE_API_BASE_URL이 있으면 백엔드, 없으면 예시 데이터 */
export const useObservations = API_BASE ? useApiObservations : useSampleObservations;
