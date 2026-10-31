import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTOR, addNote, ApiError, editNote, cancelReanalyze, cancelReview, fetchObservations, reanalyze, review, setActions, toObservation, USE_API, type AnalysisResponse } from '../api/client';
import { SEG_OF } from '../data/nodelink';
import { SAMPLE_OBSERVATIONS } from '../data/observations';
import type { HistoryEntry, Observation, ObservationPatch, Persistence, SiteCheck } from '../types';
import { DEMO_NOW, PASS, routesOf } from './constants';
import { addMinutes } from './format';
import { nearestSeg, pinKey, segById, segPlace } from './segments';
import { smooth } from './smooth';

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
function derive(input: Raw[]): Observation[] {
  // 사람이 고친 원인이 있으면 그걸 원인으로 (AI 원인은 aiCauses에 남겨 AI 결과와 비교할 수 있게)
  const list = input.map((o) => (o.humanCauses ? { ...o, aiCauses: o.causes, causes: o.humanCauses } : o));
  const bySite = new Map<string, Raw[]>();
  for (const o of list) {
    const k = pinKey(o);
    (bySite.get(k) ?? bySite.set(k, []).get(k)!).push(o);
  }
  for (const os of bySite.values()) os.sort((a, b) => a.t.localeCompare(b.t));

  return list.map((o) => {
    // 처리 경로는 사람 판정이 있으면 그 판정으로 (판단 유보를 사람이 단절로 고치면 처리 대상이 된다)
    const ep = o.human ?? o.pass;
    const routes = ep === 'passable' || ep === 'hold' ? [] : routesOf(o.causes);
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
    smooth(() => setSaved((prev) => {
      const next = { ...prev };
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const { memoEdit, ...rest } = patch;
        const cur = { ...(next[id] ?? {}), ...rest };
        // 메모 고치기: 지우지 않고 바꾸고, 고친 시각만 남긴다
        if (memoEdit) {
          cur.log = (cur.log ?? []).map((e) => (e.id === memoEdit.id ? { ...e, memo: memoEdit.text, editedAt: DEMO_NOW.toISOString() } : e));
        }
        if (logTxt) {
          // '… · 메모: 내용'이면 메모를 따로 둬서 나중에 메모만 고칠 수 있게
          const parts = logTxt.split(' · ');
          const m = parts.find((p) => p.startsWith('메모: '));
          cur.log = [...(cur.log ?? []), {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: DEMO_NOW.toISOString(), by: ACTOR,
            txt: parts.filter((p) => p !== m).join(' · '), ...(m ? { memo: m.slice('메모: '.length) } : {}),
          }];
        }
        next[id] = cur;
      }
      save(next);
      return next;
    }));
    return null as string | null; // 백엔드 모드와 같은 형태 (안내 없음)
  }, []);

  return { observations, update, error: null as string | null, loaded: true, retry: () => {} };
}

const POLL_MS = 5000;

/** 주소 → '노량진동 205-46 부근' (행정구역의 동부터, 괄호 속 행정동은 뺀다) */
function addrPlace(area?: string, addr?: string): string | undefined {
  if (!addr) return undefined;
  const dong = area?.split(' ').pop();
  const from = dong ? addr.indexOf(dong) : -1;
  return `${(from >= 0 ? addr.slice(from) : addr).replace(/\s*\(.*\)\s*$/, '')} 부근`;
}

/**
 * 사람이 고친 원인 (공유 서버 모드). 백엔드가 원인 수정(human_causes)을 받기 전까지 이 브라우저에만 저장한다.
 * 백엔드가 값을 주기 시작하면 백엔드 값을 먼저 쓴다
 */
const CAUSE_KEY = 'roadpush-human-causes';
const readCauses = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(CAUSE_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const writeCauses = (m: Record<string, string[]>) => { try { localStorage.setItem(CAUSE_KEY, JSON.stringify(m)); } catch { /* 저장 불가 환경 */ } };

/** 백엔드 연결: 관측을 API로 읽고, 처리 상태·사람 판정·재분석을 API로 보낸다 */
function useApiObservations() {
  const [rows, setRows] = useState<AnalysisResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 한 번이라도 받았는지 (받기 전에는 '불러오는 중' 또는 '연결 실패' 화면) */
  const [loaded, setLoaded] = useState(false);
  const [localCauses, setLocalCauses] = useState(readCauses);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /** 저장 중인 메모 고치기 (메모 번호 → 고친 글·시각). 그사이 주기적으로 다시 받아도 옛 메모로 돌아가지 않게 덧씌운다 */
  const pendingMemo = useRef(new Map<string, { text: string; at: string }>());
  const withPending = (rs: AnalysisResponse[]) => (pendingMemo.current.size ? rs.map((r) => ({
    ...r, history: r.history.map((h) => { const p = h.id ? pendingMemo.current.get(h.id) : undefined; return p ? { ...h, txt: `메모: ${p.text}`, edited_at: p.at } : h; }),
  })) : rs);

  /** animate: 사용자가 바꾼 직후에만 부드럽게 (5초마다 다시 읽을 때는 그냥 바꾼다) */
  const refresh = useCallback(async (animate = false) => {
    try {
      const next = withPending(await fetchObservations());
      if (animate) smooth(() => setRows(next)); else setRows(next);
      setError(null);
      setLoaded(true);
    } catch (e) { setError((e as Error).message); }
  }, []);
  /** '다시 시도': 오류를 지우고 곧바로 다시 읽는다 (그동안 '불러오는 중') */
  const retry = useCallback(() => { setError(null); refresh(); }, [refresh]);
  // 처음 한 번 + 분석 대기 중인 관측이 결과로 바뀌도록 주기적으로 다시 읽는다
  useEffect(() => { refresh(); const t = setInterval(() => refresh(), POLL_MS); return () => clearInterval(t); }, [refresh]);

  const observations = useMemo<Observation[]>(() => derive(
    rows
      .filter((a) => a.location) // 좌표가 없는 관측은 위치 확인 전까지 화면에서 뺀다
      .map((a) => {
        const { base, linkId, ...rest } = toObservation(a);
        const known = !!linkId && segById.has(linkId);
        const seg = known ? linkId : nearestSeg(base.lat, base.lng);
        // 아는 링크면 도로 이름, 아니면(예시 지역 밖) 가장 가까운 예시 도로 이름이 엉뚱하게 붙지 않게 주소로
        const humanCauses = rest.humanCauses ?? localCauses[base.id] ?? null;
        return { ...base, ...rest, humanCauses, seg, place: known ? segPlace(seg) : addrPlace(base.area, base.addr) ?? a.site_name } as Raw;
      })), [rows, localCauses]);

  /** 백엔드에 반영한다. 지금은 할 수 없는 요청(409)이면 화면에 띄울 안내를 돌려준다 */
  const update = useCallback(async (ids: string | string[], patch: ObservationPatch, logTxt?: string): Promise<string | null> => {
    const list = Array.isArray(ids) ? ids : [ids];
    let notice: string | null = null;
    try {
      // 메모: 처리 상태·검수와 별개로 저장 (상세 화면은 빈 patch + '메모: …'로 부른다)
      if (!Object.keys(patch).length && logTxt?.startsWith('메모: ')) {
        for (const id of list) await addNote(id, logTxt.slice('메모: '.length));
      }
      if (patch.action !== undefined || patch.dept !== undefined) {
        // 처리 상태와 부서는 함께 저장된다. 한쪽만 바꾸면 다른 쪽은 현재 값을 유지
        const cur = rowsRef.current.find((a) => a.observation_id === list[0]);
        const action = patch.action ?? (cur?.action.label as ObservationPatch['action']) ?? '미처리';
        const dept = patch.dept ?? cur?.action.dept ?? null;
        // 처리 상태·부서만 저장한다 (백엔드 이력이 '처리 상태: 조치 중 (청소행정과)'로 적는다).
        // 같이 쓴 메모는 메모 테이블(observation_notes)에 따로 남긴다: 메모를 한 곳에 모아야 나중에 고칠 수 있다
        await setActions(list, action!, dept === '미배정' ? null : dept);
        const memo = logTxt?.split(' · ').find((p) => p.startsWith('메모: '))?.slice('메모: '.length);
        if (memo) for (const id of list) await addNote(id, memo);
      }
      if (patch.review !== undefined && patch.review !== '미검수') {
        // 오탐 처리면 사유를 함께 보낸다
        const comment = logTxt?.startsWith('오탐 처리: ') ? logTxt.slice('오탐 처리: '.length) : undefined;
        for (const id of list) await review(id, patch.human ?? null, comment);
      }
      if (patch.review === '미검수') {
        for (const id of list) await cancelReview(id);
      }
      if (patch.reanalyze === true) {
        for (const id of list) await reanalyze(id);
      }
      if (patch.reanalyze === false) {
        for (const id of list) await cancelReanalyze(id);
      }
      if (patch.humanCauses !== undefined) {
        const next = { ...readCauses() };
        for (const id of list) { if (patch.humanCauses?.length) next[id] = patch.humanCauses; else delete next[id]; }
        writeCauses(next);
        setLocalCauses(next);
      }
      if (patch.memoEdit) {
        // 공유 서버가 느려(고치기 + 목록 다시 받기 10초 안팎) 그동안 옛 메모가 보였다. 화면에는 바로 반영하고,
        // 서버 저장이 실패하면 아래 다시 받기에서 원래 내용으로 돌아온다
        const { id: noteId, text } = patch.memoEdit;
        pendingMemo.current.set(noteId, { text, at: new Date().toISOString() });
        setRows((rs) => withPending(rs));
        try {
          for (const id of list) await editNote(id, noteId, text);
        } finally { pendingMemo.current.delete(noteId); }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notice = patch.reanalyze === false ? '이미 분석이 시작돼 재분석 요청을 취소할 수 없습니다'
          : patch.review === '미검수' ? '취소할 판정이 없습니다' : '지금은 처리할 수 없는 요청입니다';
      } else setError((e as Error).message);
    }
    await refresh(true);
    return notice;
  }, [refresh]);

  return { observations, update, error, loaded, retry };
}

/** 관측 목록과 사람 판단·처리 기록. VITE_API_BASE_URL이 있으면 백엔드, 없으면 예시 데이터 */
export const useObservations = USE_API ? useApiObservations : useSampleObservations;
