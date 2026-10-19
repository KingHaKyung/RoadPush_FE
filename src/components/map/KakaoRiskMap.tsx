import { useEffect, useRef, useState } from 'react';
import { SEGMENTS } from '../../data/nodelink';
import { loadIndex, loadTilesIn } from '../../lib/nodelinkTiles';
import { segById } from '../../lib/segments';
import type { Pass, Segment } from '../../types';
import type { RiskMapProps } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { kakao?: any } }

// 카카오 지도 위에서 잘 보이는 KRDS 시스템 색
const HEX: Record<Pass, string> = { blocked: '#DE3412', narrowed: '#C78500', passable: '#228738', hold: '#58616A' };
const LINE_GRAY = '#8A949E';
/** 이 축척 이하에서 전국 도로망을 그린다. 한 단계 위(ALL_LEVEL+1)는 지방도 이상만 */
const ALL_LEVEL = 4;
const MAJOR_RANK = '106';
/** 메모리에 남겨 둘 타일 수 */
const KEEP_TILES = 40;
const STATIC_IDS = new Set(SEGMENTS.map((s) => s.id));

let loader: Promise<any> | null = null;
function loadKakao(key: string): Promise<any> {
  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => { loader = null; reject(new Error('카카오맵 스크립트를 불러오지 못했습니다')); };
    document.head.appendChild(s);
  });
  return loader;
}

/** 배경 링크. line은 처음 화면에 들어올 때 만든다 */
type BgLine = { sg: Segment; bb: [number, number, number, number]; line: any };
const bbox = (sg: Segment): BgLine['bb'] => {
  const la = sg.ll.map((p) => p[0]), ln = sg.ll.map((p) => p[1]);
  return [Math.min(...la), Math.min(...ln), Math.max(...la), Math.max(...ln)];
};

/** VITE_KAKAO_MAP_KEY가 있으면 쓰는 실제 지도 */
export function KakaoRiskMap({ apiKey, statusOf, selected, onSelect, focusKey, onError }: RiskMapProps & { apiKey: string; onError: (msg: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const lines = useRef<any[]>([]);
  const bg = useRef(new Map<string, BgLine[]>());
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadKakao(apiKey).then((kakao) => {
      if (!alive || !el.current) return;
      map.current = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(37.5585, 126.9405), level: ALL_LEVEL });
      map.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      setReady(true);
    }).catch((e: Error) => onError(e.message));
    return () => { alive = false; };
  }, [apiKey, onError]);

  // 전국 도로망: 화면에 걸친 타일만 불러와 그린다
  useEffect(() => {
    const kakao = window.kakao; if (!ready || !kakao) return;
    const m = map.current;
    let seq = 0;
    const tiles = bg.current;

    const refresh = async () => {
      const my = ++seq;
      const level = m.getLevel();
      if (level > ALL_LEVEL + 1) {
        tiles.forEach((ls) => ls.forEach((l) => l.line?.setMap(null)));
        setNote((await loadIndex()) ? '지도를 더 확대하면 전국 표준노드링크 도로가 보입니다' : null);
        return;
      }
      const b = m.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
      setNote('도로 구간을 불러오는 중…');
      let got: { key: string; segs: Segment[] }[];
      try {
        got = await loadTilesIn({ south: sw.getLat(), west: sw.getLng(), north: ne.getLat(), east: ne.getLng() });
      } catch (e) {
        if (my === seq) setNote((e as Error).message);
        return;
      }
      if (my !== seq) return;
      const want = new Set(got.map((g) => g.key));
      for (const { key, segs } of got) {
        if (tiles.has(key)) continue;
        tiles.set(key, segs.filter((sg) => !STATIC_IDS.has(sg.id)).map((sg) => ({ sg, bb: bbox(sg), line: null })));
      }
      // 화면(+여백) 안에 걸치는 링크만 지도에 올린다
      const pad = (ne.getLat() - sw.getLat()) * 0.25;
      const [s0, w0, n0, e0] = [sw.getLat() - pad, sw.getLng() - pad, ne.getLat() + pad, ne.getLng() + pad];
      for (const [key, ls] of tiles) {
        const on = want.has(key);
        for (const l of ls) {
          const vis = on && (level <= ALL_LEVEL || l.sg.rank <= MAJOR_RANK) && l.bb[0] <= n0 && l.bb[2] >= s0 && l.bb[1] <= e0 && l.bb[3] >= w0;
          if (vis && !l.line) {
            l.line = new kakao.maps.Polyline({
              path: l.sg.ll.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng)),
              strokeWeight: 3, strokeColor: LINE_GRAY, strokeOpacity: 0.45, zIndex: 1,
            });
            const id = l.sg.id;
            kakao.maps.event.addListener(l.line, 'click', () => pick.current(id));
          }
          if (l.line && l.line.getMap() !== (vis ? m : null)) l.line.setMap(vis ? m : null);
        }
      }
      // 오래된 타일 정리 (구간 정보는 segById에 남는다)
      for (const key of [...tiles.keys()]) {
        if (tiles.size <= KEEP_TILES) break;
        if (!want.has(key)) tiles.delete(key);
      }
      setNote(level > ALL_LEVEL ? '지방도 이상만 표시 중 · 더 확대하면 모든 도로가 보입니다' : null);
    };

    kakao.maps.event.addListener(m, 'idle', refresh);
    refresh();
    return () => {
      seq++;
      kakao.maps.event.removeListener(m, 'idle', refresh);
      tiles.forEach((ls) => ls.forEach((l) => l.line?.setMap(null)));
      tiles.clear();
    };
  }, [ready]);

  // 관측 구간·선택 강조 다시 그리기
  useEffect(() => {
    const kakao = window.kakao; if (!ready || !kakao) return;
    lines.current.forEach((l) => l.setMap(null));
    lines.current = [];
    const path = (sg: Segment) => sg.ll.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng));
    const sel = selected ? segById.get(selected) : undefined;
    if (sel) lines.current.push(new kakao.maps.Polyline({ map: map.current, path: path(sel), strokeWeight: 14, strokeColor: '#256EF4', strokeOpacity: 0.35, zIndex: 3 }));
    for (const sg of SEGMENTS) {
      const st = statusOf(sg.id), shown = !!st?.shown;
      const line = new kakao.maps.Polyline({
        map: map.current, path: path(sg), zIndex: shown ? 4 : 2,
        strokeWeight: shown ? (st!.pass === 'passable' ? 5 : 7) : 3,
        strokeColor: shown ? HEX[st!.pass] : LINE_GRAY,
        strokeOpacity: shown ? 0.95 : 0.45,
        strokeStyle: shown && st!.pass === 'hold' ? 'shortdash' : 'solid',
      });
      kakao.maps.event.addListener(line, 'click', () => onSelect(sg.id));
      lines.current.push(line);
    }
  }, [ready, statusOf, selected, onSelect]);

  // 선택 구간으로 이동
  useEffect(() => {
    const kakao = window.kakao; if (!ready || !kakao || !selected) return;
    const sg = segById.get(selected); if (!sg) return;
    const b = new kakao.maps.LatLngBounds();
    sg.ll.forEach(([lat, lng]) => b.extend(new kakao.maps.LatLng(lat, lng)));
    map.current.setBounds(b, 120, 120, 120, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  return (
    <>
      <div ref={el} className="kakao-map" aria-label="카카오 지도 위 위험 구간" />
      {note && <div className="map-note" role="status">{note}</div>}
    </>
  );
}
