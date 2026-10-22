import { useCallback, useMemo, useState } from 'react';
import { SEG_OF } from '../data/nodelink';
import { SAMPLE_OBSERVATIONS } from '../data/observations';
import type { HistoryEntry, Observation, ObservationPatch, Persistence } from '../types';
import { CAUSE_LABEL, DEMO_NOW, PASS, routesOf } from './constants';
import { addMinutes, fmtTime } from './format';
import { nearestSeg, pinKey, segPlace } from './segments';

/** dept: 부서를 하나만 두던 때 저장한 값 (읽기만 한다) */
type Saved = Record<string, ObservationPatch & { log?: HistoryEntry[]; dept?: string }>;
// v2: 처리 상태가 '미처리·현장점검 요청·조치 중·조치 완료'에서 '미전달·전달됨·해소 확인·재발·오탐 종결'로 바뀜
const KEY = 'roadpush-web-v2';
const DAY = 864e5;

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 불가 환경 */ }
}

/** 위험 판정이고 원인이 있는 관측 = 처리 대상 감지 */
const isDetection = (o: Observation) => (o.human ?? o.pass) !== 'passable' && (o.human ?? o.pass) !== 'hold' && o.causes.length > 0;
const sameCause = (a: Observation, b: Observation) => a.causes.some((c) => b.causes.includes(c));

/**
 * 같은 지점(같은 좌표 = 같은 카메라)의 관측 이력으로 지속성·해소·재발을 계산한다.
 * - 지속성: 최근 7일 같은 원인 감지 횟수. 중간에 사라진 관측이 끼어 있으면 '상습', 아니면 '지속', 한 번이면 '일시'
 * - 해소 확인: 전달된 감지 뒤 같은 지점의 다음 관측에서 원인이 사라짐
 * - 재발: 같은 원인이 사라졌다가 다시 감지됨 (아직 전달 전일 때)
 * 사람이 처리 상태를 직접 바꿨으면 그 값을 따른다.
 */
function derive(list: Observation[], saved: Saved): Observation[] {
  const bySite = new Map<string, Observation[]>();
  for (const o of list) {
    const k = pinKey(o);
    (bySite.get(k) ?? bySite.set(k, []).get(k)!).push(o);
  }
  for (const os of bySite.values()) os.sort((a, b) => a.t.localeCompare(b.t));

  return list.map((o) => {
    if (!isDetection(o)) return o;
    const os = bySite.get(pinKey(o))!;
    const i = os.indexOf(o);
    const t = new Date(o.t).getTime();

    // 지속성: 이 관측부터 거꾸로 7일
    const past = os.slice(0, i + 1).filter((p) => t - new Date(p.t).getTime() <= 7 * DAY);
    const hits = past.filter((p) => isDetection(p) && sameCause(p, o));
    const first = hits[0];
    const gap = first ? past.some((p) => p.t > first.t && p.t < o.t && !(isDetection(p) && sameCause(p, o))) : false;
    const persist: Persistence = {
      kind: hits.length <= 1 ? '일시' : gap ? '상습' : '지속',
      n: hits.length,
      days: first ? Math.max(1, Math.ceil((t - new Date(first.t).getTime()) / DAY) + 1) : 1,
    };

    let { action } = o;
    const hist = [...o.hist];
    if (!saved[o.id]?.action) {
      const next = os[i + 1];
      if ((action === '전달됨' || action === '미전달') && next && !isDetection(next) && (next.human ?? next.pass) === 'passable') {
        // 다음 관측에서 사라졌으면 해소 확인 (업무 종결과 별개로 현장이 실제로 바뀐 것을 확인)
        if (action === '전달됨') {
          action = '해소 확인';
          hist.push({ t: next.t, ai: true, txt: `다음 관측(${fmtTime(next.t)})에서 해소 확인` });
        }
      } else if (action === '미전달' && persist.kind === '상습') {
        action = '재발';
        hist.push({ t: addMinutes(o.t, 2, DEMO_NOW), ai: true, txt: `재발 감지: 같은 원인이 사라졌다가 다시 나타남 (최근 7일 ${persist.n}회)` });
      }
    }
    return { ...o, action, persist, hist };
  });
}

/**
 * 관측 목록과 사람 판단·처리 기록.
 * 지금은 브라우저에 저장하고, 백엔드가 붙으면 update()에서 API를 호출하면 된다.
 */
export function useObservations() {
  const [saved, setSaved] = useState<Saved>(load);

  const observations = useMemo<Observation[]>(() => {
    const base = SAMPLE_OBSERVATIONS.map((o) => {
      const s = saved[o.id] ?? {};
      const routes = o.pass === 'passable' || o.pass === 'hold' ? [] : routesOf(o.causes);
      // 담당 부서: 원인마다 하나. 사람이 이관했으면 그 값, 아니면 처리 유형의 기본 부서
      const kept = s.depts ?? (s.dept && s.dept !== '미배정' ? [s.dept] : []);
      const depts = routes.length ? routes.map((r, i) => kept[i] ?? r.dept) : kept;
      const hist: HistoryEntry[] = [{
        t: addMinutes(o.t, 1, DEMO_NOW), ai: true,
        txt: o.pass === 'hold' ? 'AI 분석 완료 · 판단 유보' : `AI 분석 완료 · ${PASS[o.pass].label} (위험도 ${o.risk})`,
      }];
      for (const r of routes) hist.push({ t: addMinutes(o.t, 2, DEMO_NOW), ai: true, txt: `원인 '${CAUSE_LABEL[r.cause]}' → ${r.dept} 자동 배정` });
      if (o.action === '전달됨' || o.action === '해소 확인') hist.push({ t: addMinutes(o.t, 30, DEMO_NOW), txt: `처리 요청서 전달 (${depts.join(', ')})`, by: '교통행정과' });
      // 예시 데이터는 배정해 둔 링크, 실제 관측은 좌표에서 가장 가까운 링크
      const seg = SEG_OF[o.id] ?? nearestSeg(o.lat, o.lng);
      return {
        human: null, review: '미검수', reanalyze: false,
        ...o, ...s, depts, routes, persist: null, seg, place: segPlace(seg),
        hist: [...hist, ...(s.log ?? [])],
      } as Observation;
    });
    return derive(base, saved);
  }, [saved]);

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

  return { observations, update };
}
