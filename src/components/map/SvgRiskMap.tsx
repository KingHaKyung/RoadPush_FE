import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { AREA_NAME, LANDMARKS, MAP_BOUNDS, MAP_H, MAP_W, NODES, SEGMENTS } from '../../data/nodelink';
import { PASS, PIN_COLOR } from '../../lib/constants';
import { midOf, segById } from '../../lib/segments';
import type { Pass, Pin } from '../../types';
import { ROAD_CLICK, SHOW_LANDMARKS } from '../../lib/features';
import type { RiskMapProps } from './types';
import { useEffect } from 'react';

const ROAD_W: Record<string, number> = { '103': 7, '104': 5, '105': 4.5, '106': 4.5, '107': 3.2, '108': 2.6 };
const pts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ');

/** 위경도 → 약도 좌표 */
const toXY = (lat: number, lng: number): [number, number] => [
  ((lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * MAP_W,
  ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * MAP_H,
];
const RISK_ORDER: Record<Pass, number> = { passable: 0, hold: 1, narrowed: 2, blocked: 3 };

/** 관측 핀 (약도에는 묶음 없이 핀만). 아이콘 없이 색으로만 구분 */
function PinMark({ p, k, on, onPick }: { p: Pin; k: number; on: boolean; onPick: () => void }) {
  const [x, y] = toXY(p.lat, p.lng), s = k * (on ? 1.3 : 1);
  return (
    <g className="svg-pin" transform={`translate(${x} ${y - 17 * s})`} role="button" tabIndex={0} aria-label={`${p.obs.place} ${PASS[p.pass].label}`}
      onClick={onPick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}>
      <title>{`${p.obs.place} · ${PASS[p.pass].label}`}</title>
      <path d={`M0 ${17 * s}C0 ${17 * s} ${-11 * s} ${4 * s} ${-11 * s} ${-2 * s}a${11 * s} ${11 * s} 0 0 1 ${22 * s} 0c0 ${6 * s}-${11 * s} ${19 * s}-${11 * s} ${19 * s}z`}
        style={{ fill: PIN_COLOR[p.pass].fill, stroke: on ? 'var(--accent)' : 'var(--surface)', strokeWidth: (on ? 2.5 : 1.6) * k }} />
      {p.n > 1 && <text y={-2 * s} textAnchor="middle" dominantBaseline="central" style={{ fill: PIN_COLOR[p.pass].ink, fontSize: 12 * s, fontWeight: 700 }}>{p.n}</text>}
    </g>
  );
}

/** 지도 API 키가 없을 때 쓰는 표준노드링크 약도 */
export function SvgRiskMap({ pins, selectedPin, onPickPin, selected, onSelect, focusKey }: RiskMapProps) {
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
    const w = MAP_W / 3.2, h = MAP_H / 3.2;
    const pin = pins.find((p) => p.key === selectedPin);
    if (pin) { const [x, y] = toXY(pin.lat, pin.lng); setVb({ x: x - w / 2, y: y - h / 2, w, h }); return; }
    if (!selected) { setVb({ x: 0, y: 0, w: MAP_W, h: MAP_H }); return; }
    const sg = segById.get(selected); if (!sg) return;
    const xs = sg.pts.map((p) => p[0]), ys = sg.pts.map((p) => p[1]);
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

  return (
    <>
      <svg ref={svgRef} className="map" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`${AREA_NAME} 관측 지점 지도`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <rect x={-2000} y={-2000} width={MAP_W + 4000} height={MAP_H + 4000} style={{ fill: 'var(--block)' }} />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {SEGMENTS.map((sg) => <polyline key={'e' + sg.id} points={pts(sg.pts)} stroke="var(--road-edge)" strokeWidth={(ROAD_W[sg.rank] ?? 3) + 2.4} />)}
          {SEGMENTS.map((sg) => <polyline key={'r' + sg.id} points={pts(sg.pts)} stroke="var(--road)" strokeWidth={ROAD_W[sg.rank] ?? 3} />)}
        </g>
        {ROAD_CLICK && SEGMENTS.map((sg) => (
          <g key={sg.id} className="seg-g" onClick={() => pick(sg.id)}>
            {!selectedPin && selected === sg.id && <polyline points={pts(sg.pts)} fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth={18 * k} strokeLinecap="round" strokeLinejoin="round" />}
            <polyline className="hit" points={pts(sg.pts)} fill="none" stroke="transparent" strokeWidth={14 * k} strokeLinecap="round" />
          </g>
        ))}
        {k < 0.75 && Object.entries(NODES).map(([id, n]) => <circle key={id} className="node" cx={n[0]} cy={n[1]} r={2.6 * k + 0.6} style={{ strokeWidth: 1.2 * k }} />)}
        {labels.map((l) => (
          <text key={l.n} className="slabel" x={l.x} y={l.y - 6 * k} textAnchor="middle" transform={`rotate(${l.a} ${l.x} ${l.y})`} style={{ fontSize: 12 * k, strokeWidth: 4 * k }}>{l.n}</text>
        ))}
        {(SHOW_LANDMARKS ? LANDMARKS : []).map(([nm, lab]) => {
          const e = Object.values(NODES).find((n) => n[2] === nm); if (!e) return null;
          return <g key={nm}><circle className="station" cx={e[0]} cy={e[1]} r={6 * k} style={{ strokeWidth: 2.5 * k }} />
            <text className="slabel" x={e[0] + 9 * k} y={e[1] + 14 * k} style={{ fontSize: 12.5 * k, strokeWidth: 4 * k, fontWeight: 700 }}>{lab}</text></g>;
        })}
        {[...pins].sort((x, y) => Number(x.key === selectedPin) - Number(y.key === selectedPin) || RISK_ORDER[x.pass] - RISK_ORDER[y.pass] || y.lat - x.lat)
          .map((p) => <PinMark key={p.key} p={p} k={Math.max(k, 0.45)} on={p.key === selectedPin} onPick={() => { if (!moved.current) onPickPin(p); }} />)}
      </svg>
      <div className="zoom">
        <button type="button" aria-label="확대" onClick={() => zoom(1 / 1.4)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoom(1.4)}>−</button>
      </div>
    </>
  );
}
