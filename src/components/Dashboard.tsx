// 대시보드 공용 조각: 섹션 제목, 추세 곡선, 지표 카드, 행정구역 막대
import type { ReactNode } from 'react';
import { PASS, PIN_COLOR } from '../lib/constants';
import type { Pass, Pin } from '../types';

/** '주제 | 보조 설명' 제목. 가운데 세로 막대는 KRDS 기본(primary) 색 */
export function SectionTitle({ title, sub, as: Tag = 'h2' }: { title: ReactNode; sub?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <Tag className="sec-title">
      {title}
      {sub != null && <span className="sec-sub">{sub}</span>}
    </Tag>
  );
}

/** 부드러운 추세 곡선 (Catmull-Rom → 베지어). 읽기용 값은 label로 */
export function Sparkline({ values, label, w = 120, h = 40 }: { values: number[]; label: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values), pad = 3;
  const p = values.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1), h - pad - (v / max) * (h - pad * 2)]);
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i], b = p[i], c = p[i + 1], e = p[i + 2] ?? c;
    d += `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  const [lx, ly] = p[p.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="spark-area" d={`${d}L${lx.toFixed(1)} ${h}L${p[0][0].toFixed(1)} ${h}Z`} />
      <path className="spark-line" d={d} vectorEffect="non-scaling-stroke" />
      <circle className="spark-dot" cx={lx} cy={ly} r="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * 지표 카드: 큰 숫자 · 이름 · 어제 대비 화살표 · 추세 곡선.
 * hero: 포인트 색으로 채운 대표 카드. tone: risk(늘면 빨강) · good(늘면 초록) · neutral. onClick이 있으면 눌러서 거르는 버튼
 */
export function KpiCard({ label, value, unit, delta, values, note, tone = 'risk', hero, onClick, active }: {
  label: string; value: number | string; unit?: string; delta?: { now: number; prev: number }; values?: number[];
  note?: string; tone?: 'risk' | 'good' | 'neutral'; hero?: boolean; onClick?: () => void; active?: boolean;
}) {
  const d = delta ? delta.now - delta.prev : 0;
  const mood = !delta || d === 0 || tone === 'neutral' ? 'flat' : (d > 0) === (tone === 'risk') ? 'bad' : 'good';
  const body = (
    <>
      <p className="kpi-v"><b>{value}</b>{unit && <span>{unit}</span>}</p>
      <h3>{label}</h3>
      {delta ? (
        <p className={`kpi-d ${mood}`}>{d > 0 ? '↑' : d < 0 ? '↓' : '–'} {Math.abs(d)}건 <span>어제 대비</span></p>
      ) : note && <p className="kpi-d flat">{note}</p>}
      {values && values.some((v) => v > 0) && <div className="kpi-spark"><Sparkline values={values} label={`${label} 추세: ${values.join(', ')}건`} /></div>}
    </>
  );
  const cls = `kpi${hero ? ' hero' : ''}${active ? ' on' : ''}`;
  return onClick
    ? <button type="button" className={`${cls} kpi-btn`} aria-pressed={!!active} onClick={onClick}>{body}</button>
    : <article className={cls}>{body}</article>;
}

const ORDER: Pass[] = ['blocked', 'narrowed', 'hold', 'passable'];

/** 행정구역별 지점 수 (판정별로 쌓은 막대). 누르면 그 행정구역으로 검색 */
export function AreaBars({ sites, onPick, active }: { sites: Pin[]; onPick: (area: string) => void; active: string }) {
  const by = new Map<string, Record<Pass, number>>();
  for (const s of sites) {
    const a = s.obs.area ?? '행정구역 미상';
    const r = by.get(a) ?? by.set(a, { blocked: 0, narrowed: 0, passable: 0, hold: 0 }).get(a)!;
    r[s.pass]++;
  }
  const rows = [...by.entries()].map(([a, r]) => ({ a, r, n: ORDER.reduce((t, p) => t + r[p], 0) }))
    .sort((x, y) => y.n - x.n || x.a.localeCompare(y.a, 'ko')).slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ol className="area-bars">
      {rows.map(({ a, r, n }) => (
        <li key={a}>
          <button type="button" className={active === a ? 'on' : undefined} aria-pressed={active === a} onClick={() => onPick(active === a ? '' : a)}>
            <span className="ab-name">{a.split(' ').pop()}</span>
            <span className="ab-bar" style={{ width: `${(n / max) * 100}%` }}>
              {ORDER.map((p) => r[p] > 0 && <i key={p} style={{ flex: r[p], background: PIN_COLOR[p].fill }} />)}
            </span>
            <span className="ab-n">{n}</span>
            {/* 판정별 개수: 마우스·키보드 선택 시 말풍선, 화면 낭독기에는 숨김 글 */}
            <span className="ab-tip" aria-hidden="true">{ORDER.filter((p) => r[p]).map((p) => `${PASS[p].label} ${r[p]}`).join(' · ')}</span>
            <span className="vh">{ORDER.filter((p) => r[p]).map((p) => `${PASS[p].label} ${r[p]}곳`).join(', ')}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
