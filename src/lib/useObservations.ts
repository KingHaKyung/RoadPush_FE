import { useCallback, useMemo, useState } from 'react';
import { SEG_OF } from '../data/nodelink';
import { SAMPLE_OBSERVATIONS } from '../data/observations';
import type { HistoryEntry, Observation, ObservationPatch } from '../types';
import { DEMO_NOW, PASS } from './constants';
import { addMinutes } from './format';
import { nearestSeg, segPlace } from './segments';

type Saved = Record<string, ObservationPatch & { log?: HistoryEntry[] }>;
const KEY = 'roadpush-web-v1';

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 불가 환경 */ }
}

/**
 * 관측 목록과 사람 판단·처리 기록.
 * 지금은 브라우저에 저장하고, 백엔드가 붙으면 update()에서 API를 호출하면 된다.
 */
export function useObservations() {
  const [saved, setSaved] = useState<Saved>(load);

  const observations = useMemo<Observation[]>(() =>
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
      } as Observation;
    }), [saved]);

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
