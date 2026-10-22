import type { Observation } from '../types';
import { SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';

/** 촬영 화면 자리 표시용 그림. 백엔드가 붙으면 원본 사진·overlay 이미지로 바꾼다. */
export function FrameView({ o, overlay }: { o: Observation; overlay: boolean }) {
  // 백엔드에 연결되면 실제 사진을 보여 준다 ('분석'이면 overlay, 없으면 원본)
  if (o.img) {
    const src = overlay && o.img.overlay ? o.img.overlay : o.img.original;
    return <img src={src} alt={`${o.place} ${overlay ? '분석 결과' : '원본'} 사진`} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />;
  }
  const W = 320, H = 190, top = 88, bot = H;
  const L = (y: number) => 205 + ((150 - 205) * (y - top)) / (bot - top);
  const R = (y: number) => 248 + ((320 - 248) * (y - top)) / (bot - top);
  const occ = o.occ ?? (o.cond === 'occluded' ? 60 : 0);
  const y0 = 172, w = R(y0) - L(y0), ow = Math.max(12, (w * occ) / 100);
  const walk = `150,${bot} 320,${bot} 320,${top + 14} 248,${top} 205,${top}`;
  const kinds = o.causes.length ? o.causes : o.cond === 'occluded' ? ['차량'] : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${o.place} 촬영 화면 예시`}>
      <rect width={W} height={H} style={{ fill: 'var(--frame-sky)' }} />
      <rect x="250" y="20" width="70" height={top - 16} style={{ fill: 'var(--frame-bld)' }} />
      <rect x="0" y="40" width="80" height={top - 40} style={{ fill: 'var(--frame-bld)' }} />
      <polygon points={`0,${bot} 150,${bot} 205,${top} 140,${top} 0,${top + 30}`} style={{ fill: 'var(--frame-road)' }} />
      <polygon points={walk} style={{ fill: 'var(--frame-walk)' }} />
      <line x1="150" y1={bot} x2="205" y2={top} stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
      {kinds.map((k, i) => {
        const x = L(y0) + (i ? w - ow * 0.45 : 2), y = y0 - 6 * i;
        if (k === '차량') return <g key={i}><rect x={x} y={y - 42} width={ow} height="44" rx="8" fill="#3E4650" /><rect x={x + 8} y={y - 36} width={Math.max(4, ow - 16)} height="14" rx="3" fill="#8FA1B3" /></g>;
        if (k === '공사시설') return <g key={i}><rect x={x} y={y - 30} width={ow} height="8" fill="#E36B2C" /><rect x={x} y={y - 14} width={ow} height="8" fill="#F2F0EB" />{[0, 1, 2].map((j) => <polygon key={j} points={`${x + 8 + (j * (ow - 16)) / 2},${y} ${x + 16 + (j * (ow - 16)) / 2},${y} ${x + 12 + (j * (ow - 16)) / 2},${y - 26}`} fill="#E36B2C" />)}</g>;
        if (k === '적치물') return <g key={i}><rect x={x} y={y - 26} width={ow * 0.55} height="28" fill="#A67C52" /><rect x={x + ow * 0.35} y={y - 40} width={ow * 0.5} height="42" fill="#8C6A47" /></g>;
        return <g key={i}><line x1={x} y1={y} x2={x + Math.min(ow, 40)} y2={y - 28} stroke="#2F3A44" strokeWidth="5" strokeLinecap="round" /><circle cx={x + 4} cy={y - 2} r="7" fill="none" stroke="#2F3A44" strokeWidth="3" /></g>;
      })}
      {o.cond === 'rain' && (
        <g stroke="#fff" strokeOpacity=".45" strokeWidth="1.4">
          {Array.from({ length: 26 }, (_, i) => <line key={i} x1={(i * 37) % 320} y1={(i * 53) % 150} x2={((i * 37) % 320) - 6} y2={((i * 53) % 150) + 16} />)}
        </g>
      )}
      {o.cond === 'night' && <><rect width={W} height={H} fill="#05070A" fillOpacity=".62" /><circle cx="40" cy="30" r="14" fill="#FFE9A8" fillOpacity=".8" /></>}
      <text x={W - 8} y={H - 8} fill="#fff" fontSize="10" textAnchor="end" opacity=".85">{SRC_LABEL[o.src]} {o.dev} · {fmtTime(o.t)}</text>
      {overlay && (o.pass === 'hold' ? (
        <>
          <polygon points={walk} style={{ fill: 'var(--hold)' }} fillOpacity=".3" />
          <rect x="8" y="8" width="104" height="22" rx="3" fill="#000" fillOpacity=".6" />
          <text x="16" y="23" fill="#fff" fontSize="12">경계 확정 불가</text>
        </>
      ) : (
        <>
          <polygon points={walk} fill="#228738" fillOpacity=".38" />
          {occ > 0 && o.occ != null && (
            <>
              <rect x={L(y0)} y={y0 - 46} width={ow} height="50" fill="#DE3412" fillOpacity=".42" stroke="#fff" strokeWidth="1.5" />
              <line x1={L(y0) + ow} y1={y0 + 8} x2={R(y0)} y2={y0 + 8} stroke="#fff" strokeWidth="2" />
              <rect x="8" y="8" width="84" height="22" rx="3" fill="#000" fillOpacity=".6" />
              <text x="16" y="23" fill="#fff" fontSize="12">점유 면적 {o.occ}%</text>
            </>
          )}
        </>
      ))}
    </svg>
  );
}
