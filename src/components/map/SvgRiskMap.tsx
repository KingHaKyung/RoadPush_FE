import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { AREA_NAME, LANDMARKS, MAP_H, MAP_W, NODES, SEGMENTS } from '../../data/nodelink';
import { PASS } from '../../lib/constants';
import { midOf, segById } from '../../lib/segments';
import type { Pass } from '../../types';
import type { RiskMapProps } from './types';
import { useEffect } from 'react';

const ROAD_W: Record<string, number> = { '103': 7, '104': 5, '105': 4.5, '106': 4.5, '107': 3.2, '108': 2.6 };
const pts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ');

function MidShape({ p, x, y, k }: { p: Pass; x: number; y: number; k: number }) {
  if (p === 'passable') return null;
  const r = 7 * k, st = { fill: PASS[p].color, stroke: 'var(--surface)', strokeWidth: 2 * k };
  if (p === 'blocked') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={2 * k} style={st} />;
  if (p === 'narrowed') return <polygon points={`${x},${y - r * 1.3} ${x + r * 1.3},${y + r} ${x - r * 1.3},${y + r}`} style={st} />;
  return <rect x={x - r * 0.85} y={y - r * 0.85} width={r * 1.7} height={r * 1.7} transform={`rotate(45 ${x} ${y})`} style={st} />;
}

/** 지도 API 키가 없을 때 쓰는 표준노드링크 약도 */
export function SvgRiskMap({ statusOf, selected, onSelect, focusKey }: RiskMapProps) {
  const [vb, setVb] = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; sc: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const k = vb.w / MAP_W;

  const labels = useMemo(() => {
    const by: Record<string, { tot: number; best: ReturnType<typeof midOf> | null }> = {};
    for (const sg of SEGMENTS) {
      if (sg.road === '이름 없는 도로') continue;
      const m = midOf(sg.pts);
      const e = (by[sg.road] ??= { tot: 0, best: null });
      e.tot += m.tot;
      if (!e.best || m.tot > e.best.tot) e.best = m;
    }
    return Object.entries(by).filter(([, v]) => v.tot > 120 && v.best).map(([n, v]) => {
      let a = v.best!.ang; if (a > 90) a -= 180; if (a < -90) a += 180;
      return { n, x: v.best!.x, y: v.best!.y, a };
    });
  }, []);

  useEffect(() => {
    if (!selected) { setVb({ x: 0, y: 0, w: MAP_W, h: MAP_H }); return; }
    const sg = segById.get(selected); if (!sg) return;
    const xs = sg.pts.map((p) => p[0]), ys = sg.pts.map((p) => p[1]);
    const w = MAP_W / 3.2, h = MAP_H / 3.2;
    setVb({ x: (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - h / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const toSvg = (cx: number, cy: number) => {
    const b = svgRef.current!.getBoundingClientRect();
    const sc = Math.max(vb.w / b.width, vb.h / b.height);
    return { x: vb.x + (cx - b.left) * sc - (b.width * sc - vb.w) / 2, y: vb.y + (cy - b.top) * sc - (b.height * sc - vb.h) / 2, sc };
  };
  const zoom = (f: number, cx?: number, cy?: number) => setVb((v) => {
    const nw = Math.min(MAP_W * 1.2, Math.max(MAP_W / 8, v.w * f)), r = nw / v.w;
    const x = cx ?? v.x + v.w / 2, y = cy ?? v.y + v.h / 2;
    return { x: x - (x - v.x) * r, y: y - (y - v.y) * r, w: nw, h: v.h * r };
  });
  const onWheel = (e: WheelEvent<SVGSVGElement>) => { const p = toSvg(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, p.x, p.y); };
  const onDown = (e: PointerEvent<SVGSVGElement>) => { drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, sc: toSvg(e.clientX, e.clientY).sc, moved: false }; moved.current = false; };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; moved.current = true; }
    if (d.moved) setVb((v) => ({ ...v, x: d.vx - dx * d.sc, y: d.vy - dy * d.sc }));
  };
  const onUp = () => { drag.current = null; setTimeout(() => (moved.current = false), 0); };
  const pick = (id: string) => { if (!moved.current) onSelect(id); };

  const base = SEGMENTS.map((sg) => ({ sg, st: statusOf(sg.id) }));
  return (
    <>
      <svg ref={svgRef} className="map" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`${AREA_NAME} 표준노드링크 위험 구간 지도`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <rect x={-2000} y={-2000} width={MAP_W + 4000} height={MAP_H + 4000} style={{ fill: 'var(--block)' }} />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {SEGMENTS.map((sg) => <polyline key={'e' + sg.id} points={pts(sg.pts)} stroke="var(--road-edge)" strokeWidth={(ROAD_W[sg.rank] ?? 3) + 2.4} />)}
          {SEGMENTS.map((sg) => <polyline key={'r' + sg.id} points={pts(sg.pts)} stroke="var(--road)" strokeWidth={ROAD_W[sg.rank] ?? 3} />)}
        </g>
        {[...base].sort((a, b) => Number(!!a.st?.shown || a.sg.id === selected) - Number(!!b.st?.shown || b.sg.id === selected)).map(({ sg, st }) => {
          const shown = !!st?.shown, on = selected === sg.id, m = shown ? midOf(sg.pts) : null;
          return (
            <g key={sg.id} className="seg-g" tabIndex={shown ? 0 : -1} role="button" aria-label={`${sg.road} ${st ? PASS[st.pass].label : '관측 없음'}`}
              onClick={() => pick(sg.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(sg.id))}>
              {on && <polyline points={pts(sg.pts)} fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth={18 * k} strokeLinecap="round" strokeLinejoin="round" />}
              {shown && st && <>
                <polyline points={pts(sg.pts)} fill="none" stroke={PASS[st.pass].color} strokeWidth={(st.pass === 'passable' ? 4 : 6) * Math.max(k, 0.6) + 2}
                  strokeLinecap="round" strokeLinejoin="round" strokeDasharray={st.pass === 'hold' ? `${8 * k} ${5 * k}` : undefined} />
                <MidShape p={st.pass} x={m!.x} y={m!.y} k={Math.max(k, 0.55)} />
              </>}
              <polyline className="hit" points={pts(sg.pts)} fill="none" stroke="transparent" strokeWidth={14 * k} strokeLinecap="round" />
            </g>
          );
        })}
        {k < 0.75 && Object.entries(NODES).map(([id, n]) => <circle key={id} className="node" cx={n[0]} cy={n[1]} r={2.6 * k + 0.6} style={{ strokeWidth: 1.2 * k }} />)}
        {labels.map((l) => (
          <text key={l.n} className="slabel" x={l.x} y={l.y - 6 * k} textAnchor="middle" transform={`rotate(${l.a} ${l.x} ${l.y})`} style={{ fontSize: 12 * k, strokeWidth: 4 * k }}>{l.n}</text>
        ))}
        {LANDMARKS.map(([nm, lab]) => {
          const e = Object.values(NODES).find((n) => n[2] === nm); if (!e) return null;
          return <g key={nm}><circle className="station" cx={e[0]} cy={e[1]} r={6 * k} style={{ strokeWidth: 2.5 * k }} />
            <text className="slabel" x={e[0] + 9 * k} y={e[1] + 14 * k} style={{ fontSize: 12.5 * k, strokeWidth: 4 * k, fontWeight: 700 }}>{lab}</text></g>;
        })}
      </svg>
      <div className="zoom">
        <button type="button" aria-label="확대" onClick={() => zoom(1 / 1.4)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoom(1.4)}>−</button>
      </div>
    </>
  );
}
