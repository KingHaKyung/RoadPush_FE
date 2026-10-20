// 예시 지역 연속수치지형도 도로중심선 (scripts/build-centerline.mjs가 만든 public/centerline/demo.json)
// 실제 도로폭으로 도로를 그리고, 표준노드링크 링크에 도로폭을 붙이며, 클릭 위치에서 가까운 링크를 찾는다.
import { SEGMENTS } from '../data/nodelink';
import type { Segment } from '../types';
import { CL_KIND } from './constants';
import { distToLine, lineMeters } from './geo';
import { registerSegments } from './segments';

type RawRoad = [string, string, string, string, number, number, string, string, string, string, number[]];

const midPoint = (ll: [number, number][]) => ll[Math.floor((ll.length - 1) / 2)].map((v, k) => (v + ll[Math.ceil((ll.length - 1) / 2)][k]) / 2) as [number, number];

/** 클릭한 곳에서 이 거리(m) 안에 표준노드링크 링크가 있으면 그 링크를 고른다 (도로 반폭에 더하는 여유) */
const PICK_SLACK = 6;

let p: Promise<Segment[]> | null = null;
/** 도로중심선을 불러와 segById에 등록하고, 표준노드링크 링크에 도로폭을 붙인다. 파일이 없으면 빈 배열 */
export function loadCenterline(): Promise<Segment[]> {
  p ??= fetch(`${import.meta.env.BASE_URL}centerline/demo.json`)
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : { roads: [] }))
    .then(({ roads, q }: { roads: RawRoad[]; q: number }) => {
      const segs = roads.map(([ufid, rdnm, name, kind, lanes, width, pave, oneway, divider, , c]): Segment => {
        let y = 0, x = 0;
        const ll: [number, number][] = [];
        for (let i = 0; i < c.length; i += 2) { y += c[i]; x += c[i + 1]; ll.push([y / q, x / q]); }
        return {
          id: `cl:${ufid}`, links: [], a: '', b: '', road: rdnm || name || CL_KIND[kind] || '도로', rank: 'cl',
          lanes, spd: 0, len: lineMeters(ll), pts: [], ll, width,
          cl: { ufid, name: rdnm || name, kind, lanes, width, pave, oneway, divider },
        };
      });
      // 표준노드링크 링크 가운데에서 가장 가까운 도로중심선의 폭을 링크 폭으로
      for (const sg of SEGMENTS) {
        const m = midPoint(sg.ll);
        let best: Segment | null = null, bd = 12;
        for (const c of segs) { const d = distToLine(m, c.ll); if (d < bd) { bd = d; best = c; } }
        if (best) sg.width = best.width;
      }
      return registerSegments(segs, {});
    })
    .catch(() => []);
  return p;
}

/** 도로중심선을 클릭했을 때: 가까운 표준노드링크 링크가 있으면 그 링크, 없으면 도로중심선 자체 */
export function resolvePick(at: [number, number], cl: Segment): string {
  let best: Segment | null = null, bd = (cl.width ?? 8) / 2 + PICK_SLACK;
  for (const sg of SEGMENTS) { const d = distToLine(at, sg.ll); if (d < bd) { bd = d; best = sg; } }
  return best?.id ?? cl.id;
}
