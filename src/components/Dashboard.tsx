// 대시보드 공용 조각: 섹션 제목, 스파크라인, 지표 카드, 행정구역 막대
import type { ReactNode } from 'react';
import { PASS, PIN_COLOR } from '../lib/constants';
import type { Pass, Pin } from '../types';

/** '주제 | 보조 설명' 제목. 가운데 세로 막대는 KRDS 기본(primary) 색 */
export function SectionTitle({ title, sub, as: Tag = 'h2', size }: { title: ReactNode; sub?: ReactNode; as?: 'h1' | 'h2' | 'h3'; size?: 'page' }) {
  return (
    <Tag className={`sec-title${size === 'page' ? ' page-title' : ''}`} tabIndex={Tag === 'h1' ? -1 : undefined}>
      {title}
      {sub != null && <><i className="sec-bar" aria-hidden="true" /><span className="sec-sub">{sub}</span></>}
    </Tag>
  );
}

/** 작은 추세 그래프 (선 + 옅은 면). 읽기용 값은 label로 */
export function Sparkline({ values, label, w = 132, h = 44 }: { values: number[]; label: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values), pad = 3;
  const xy = values.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1), h - pad - (v / max) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const area = `${line}L${xy[xy.length - 1][0].toFixed(1)} ${h - pad}L${pad} ${h - pad}Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <path className="spark-area" d={area} />
      <path className="spark-line" d={line} />
      <circle className="spark-dot" cx={lx} cy={ly} r="3" />
    </svg>
  );
}

/**
 * 지표 카드: 이름 · 큰 숫자 · 증감 칩 · 추세.
 * tone: risk(늘면 빨강) · good(늘면 초록, 예: 조치 완료) · neutral(항상 회색). onClick이 있으면 눌러서 거르는 버튼
 */
export function KpiCard({ label, value, unit, delta, values, spanLabel, note, tone = 'risk', onClick, active, accent }: {
  label: string; value: number | string; unit?: string; delta?: { now: number; prev: number }; values?: number[]; spanLabel?: string;
  note?: ReactNode; tone?: 'risk' | 'good' | 'neutral'; onClick?: () => void; active?: boolean;
  /** 카드 위 선 · 큰 숫자 · 추세선 색 (의미에 맞는 KRDS 색) */
  accent?: string;
}) {
  const style = accent ? { ['--kpi-c' as string]: accent } : undefined;
  let chip: [string, string] | null = null;
  if (delta) {
    const d = delta.now - delta.prev;
    const txt = d > 0 ? `어제보다 +${d}건` : d < 0 ? `어제보다 −${-d}건` : '어제와 같음';
    const up = tone === 'risk' ? 'bg-light-danger' : tone === 'good' ? 'bg-light-success' : 'bg-light-gray';
    const down = tone === 'risk' ? 'bg-light-success' : tone === 'good' ? 'bg-light-danger' : 'bg-light-gray';
    chip = [d > 0 ? up : d < 0 ? down : 'bg-light-gray', txt];
  }
  const body = (
    <>
      <h3>{label}</h3>
      <p className="kpi-v"><b>{value}</b>{unit && <span>{unit}</span>}</p>
      {chip ? <span className={`krds-badge ${chip[0]} kpi-d`}>{chip[1]}</span> : note && <span className="kpi-note">{note}</span>}
      {values && (
        <div className="kpi-spark">
          <Sparkline values={values} label={`${label} ${spanLabel ?? ''} 관측 추세: ${values.join(', ')}건`} />
          {spanLabel && <span className="small">{spanLabel}</span>}
        </div>
      )}
    </>
  );
  return onClick
    ? <button type="button" className={`kpi kpi-btn${active ? ' on' : ''}`} style={style} aria-pressed={!!active} onClick={onClick}>{body}</button>
    : <article className="kpi" style={style}>{body}</article>;
}

/** 단순 개수 막대 목록. 누르면 그 항목으로 거르고, 다시 누르면 해제 */
export function CountBars<K extends string>({ rows, active, onPick }: { rows: { key: K; label: string; n: number }[]; active: K | ''; onPick: (k: K | '') => void }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ol className="area-bars count-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" className={active === r.key ? 'on' : undefined} aria-pressed={active === r.key} onClick={() => onPick(active === r.key ? '' : r.key)}>
            <span className="ab-name">{r.label}</span>
            <span className="ab-bar"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
            <span className="ab-n">{r.n}</span>
          </button>
        </li>
      ))}
    </ol>
  );
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
