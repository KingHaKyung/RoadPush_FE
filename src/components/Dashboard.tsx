// 대시보드 공용 조각: 섹션 제목, 현황 줄, 행정구역 막대
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

/** 현황 줄의 한 칸: 이름 + 숫자. tone 색은 값이 0보다 클 때만. onClick이 있으면 눌러서 거르는 버튼 */
export function Stat({ label, value, unit, tone, note, onClick, active }: {
  label: string; value: number | string; unit?: string; tone?: 'danger' | 'warning'; note?: string; onClick?: () => void; active?: boolean;
}) {
  const hot = tone && typeof value === 'number' && value > 0;
  const body = (
    <>
      <span className="stat-l">{label}</span>
      <span className={`stat-v${hot ? ` ${tone}` : ''}`}>{value}{unit && <small>{unit}</small>}</span>
      {note && <span className="stat-n">{note}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={`stat${active ? ' on' : ''}`} aria-pressed={!!active} onClick={onClick}>{body}</button>
    : <div className="stat">{body}</div>;
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
