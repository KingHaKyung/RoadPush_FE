import { useEffect, useRef, useState } from 'react';
import { ACTIONS, DEPTS, PASS, PASS_KEYS, PERIOD_LABEL, routeName, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { compareObs, effPass, inPeriod, matchesFilters, matchesQuery } from '../lib/segments';
import { dayDelta, trend } from '../lib/stats';
import type { Action, Filters, Observation, ObservationPatch, Pass, Route, SortKey } from '../types';
import { KpiCard } from './Dashboard';
import { PeriodToggle } from './PeriodToggle';
import { PassDot } from './Pill';
import { RouteBadge, TrendBadge, trendOf } from './RouteBadge';

interface Props {
  obs: Observation[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  onOpen: (id: string) => void;
  onUpdate: (ids: string | string[], patch: ObservationPatch, log?: string) => void;
  toast: (m: string) => void;
}

const PER_PAGE = 10;
/** 정렬 기준별 기본 방향 (compareObs 순서): 촬영 시각·위험도는 큰 값부터, 행정구역은 가나다순 */
const DEFAULT_DESC: Record<SortKey, boolean> = { time: true, risk: true, area: false };
/** 페이지 번호: 지금 페이지 앞뒤로 2개씩, 최대 5개 */
const pageNums = (cur: number, pages: number) => {
  const from = Math.max(1, Math.min(cur - 2, pages - 4));
  return Array.from({ length: Math.min(5, pages) }, (_, i) => from + i);
};

/** 처리 유형: 첫 유형 배지 + 나머지 유형 수 (같은 유형은 하나로). 전체는 마우스를 올리면 */
function RouteSummary({ routes }: { routes: Route[] }) {
  const types = [...new Map(routes.map((r) => [r.type, r])).values()];
  const all = types.map((r) => `${routeName(r.type)} (${routes.filter((x) => x.type === r.type).map((x) => x.cause).join(', ')})`).join('\n');
  return (
    <span className="route-sum" title={all}>
      <RouteBadge route={types[0]} />
      {types.length > 1 && <span className="route-more" aria-label={`외 ${types.length - 1}개`}>+{types.length - 1}</span>}
    </span>
  );
}

/** 처리 대상이 아닌 관측(통과 가능·원인 없음)은 상태 대신 '해당 없음' */
const statusText = (o: Observation) => (!o.routes.length && o.action === '미처리' ? (effPass(o) === 'hold' ? '검수 필요' : '해당 없음') : o.action);

export function ListView({ obs, filters: f, setFilters, onOpen, onUpdate, toast }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDept, setBulkDept] = useState('');
  const [bulkAct, setBulkAct] = useState('');
  /** 휴대폰에서 기간·판정·처리 상태·부서·정렬을 펼쳤는지. 기본(최근 3일·전체·날짜순)과 다른 조건 수를 버튼에 보여 준다 */
  const [moreOpen, setMoreOpen] = useState(false);
  const nCond = [f.period !== '3d', f.pass.size === 1, f.act.size === 1, !!f.dept, f.sort !== 'time'].filter(Boolean).length;
  /** 정렬 방향을 기본(최신·위험 높은 순, 행정구역은 가나다순)에서 뒤집었는지 */
  const [flip, setFlip] = useState(false);
  const sorted = obs.filter((o) => matchesFilters(o, f)).sort(compareObs(f.sort));
  // 값이 없는 관측(위험도 산출 불가·행정구역 미상)은 방향과 상관없이 맨 뒤
  const empty = (o: Observation) => (f.sort === 'risk' ? o.risk == null : f.sort === 'area' ? !o.area : false);
  const valued = sorted.filter((o) => !empty(o));
  const rows = [...(flip ? valued.reverse() : valued), ...sorted.filter(empty)];
  // 10건씩 나눠 보여 준다. 조건이 바뀌면 1페이지로
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [f, flip]);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const tableRef = useRef<HTMLDivElement>(null);
  const goPage = (p: number) => {
    setPage(p);
    // 표가 화면 위로 지나갔으면 표 머리로 올린다 (휴대폰에서 카드 목록 아래 페이지 번호를 눌렀을 때)
    if ((tableRef.current?.getBoundingClientRect().top ?? 0) < 0) tableRef.current?.scrollIntoView({ block: 'start' });
  };

  // 지표 카드: 기간·수집 경로·검색어까지만 걸린 관측 기준 (판정·처리 상태는 카드로 고른다)
  const base = obs.filter((o) => inPeriod(o, f.period) && f.src.has(o.src) && matchesQuery(o, f.q));
  const allPass = f.pass.size === PASS_KEYS.length, allAct = f.act.size === ACTIONS.length;
  const only = <T,>(set: Set<T>, v: T) => set.size === 1 && set.has(v);
  const KPIS: { label: string; pred: (o: Observation) => boolean; tone: 'risk' | 'good' | 'neutral'; active: boolean; apply: Partial<Filters> }[] = [
    { label: '전체 관측', pred: () => true, tone: 'neutral', active: allPass && allAct, apply: { pass: new Set(PASS_KEYS), act: new Set(ACTIONS) } },
    { label: '단절', pred: (o) => effPass(o) === 'blocked', tone: 'risk', active: only(f.pass, 'blocked') && allAct, apply: { pass: new Set<Pass>(['blocked']), act: new Set(ACTIONS) } },
    { label: '미처리', pred: (o) => o.routes.length > 0 && o.action === '미처리', tone: 'risk', active: allPass && only(f.act, '미처리'), apply: { pass: new Set(PASS_KEYS), act: new Set<Action>(['미처리']) } },
    { label: '조치 완료', pred: (o) => o.action === '조치 완료', tone: 'good', active: allPass && only(f.act, '조치 완료'), apply: { pass: new Set(PASS_KEYS), act: new Set<Action>(['조치 완료']) } },
  ];
  /** 표 머리 정렬: 다른 칸을 누르면 그 칸의 기본 방향으로, 같은 칸을 다시 누르면 방향을 뒤집는다 */
  const sortTh = (k: SortKey, label: string) => {
    const on = f.sort === k;
    const desc = on ? DEFAULT_DESC[k] !== flip : DEFAULT_DESC[k];
    return (
      <th scope="col" aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className={`th-sort${on ? ' on' : ''}`}
          onClick={() => { if (on) setFlip((v) => !v); else { setFlip(false); setFilters({ ...f, sort: k }); } }}>
          {label}<span aria-hidden="true">{on ? (desc ? '▼' : '▲') : '↕'}</span>
        </button>
      </th>
    );
  };
  const allOn = shown.length > 0 && shown.every((o) => picked.has(o.id));
  const togglePick = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });

  const copy = () => {
    const tsv = ['촬영 시각\t수집 경로\t행정구역\t위치\t주소\tAI 판정\t위험도\t원인\t처리 유형\t지속성\t현장 확인\t담당 부서\t처리 상태\t관측 ID',
      ...rows.map((o) => [fmtTime(o.t), `${SRC_LABEL[o.src]} ${o.dev}`, o.area ?? '', o.place, o.addr ?? '', PASS[effPass(o)].label, o.risk ?? '', o.causes.join(', '),
        o.routes.map((r) => routeName(r.type)).join(', '), o.persist ? `${o.persist.kind} ${o.persist.n}회` : '', o.site ?? '', o.dept, statusText(o), o.id].join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => toast(`${rows.length}건을 복사했습니다. 엑셀에 붙여넣으세요`), () => toast('복사하지 못했습니다'));
  };
  const applyBulk = () => {
    if (!bulkDept && !bulkAct) { toast('바꿀 항목을 고르세요'); return; }
    const ids = [...picked];
    if (bulkDept) onUpdate(ids, { dept: bulkDept }, `담당 부서: ${bulkDept} (일괄)`);
    if (bulkAct) onUpdate(ids, { action: bulkAct as Action }, `처리 상태: ${bulkAct} (일괄)`);
    toast(`${ids.length}건에 적용했습니다`);
    setPicked(new Set()); setBulkDept(''); setBulkAct('');
  };

  return (
    <section id="v-list" className="page">
      {/* 화면 제목은 위험 지도처럼 숨긴다 (위 탭이 화면 이름을 보여 준다). 화면 전환 시 포커스가 여기로 */}
      <h1 className="vh" tabIndex={-1}>관측 목록 · {PERIOD_LABEL[f.period]} {rows.length}건</h1>
      <div className="kpis" aria-label="관측 현황 (누르면 표를 거릅니다)">
        {KPIS.map((k, i) => {
          const pred = (o: Observation) => matchesQuery(o, f.q) && k.pred(o);
          return <KpiCard key={k.label} hero={i === 0} label={k.label} unit="건" value={base.filter(k.pred).length} tone={k.tone}
            delta={dayDelta(obs, f, pred)} values={trend(obs, f, pred)} active={k.active} onClick={() => setFilters(k.active ? { ...f, pass: new Set(PASS_KEYS), act: new Set(ACTIONS) } : { ...f, ...k.apply })} />;
        })}
      </div>
      <div className="toolbar">
        {/* 휴대폰에서만 보이는 버튼: 나머지 조건을 접어 둔다 (조건 → 검색 순) */}
        <button type="button" className={`krds-btn small ${nCond ? 'secondary' : 'tertiary'} tb-toggle`} aria-expanded={moreOpen} aria-controls="tb-more" onClick={() => setMoreOpen((v) => !v)}>
          조건{nCond > 0 && ` ${nCond}`}
        </button>
        <label className="vh" htmlFor="q">검색</label>
        <input className="krds-input small tb-q" id="q" type="search" placeholder="위치·행정구역·장비·관측 ID" value={f.q} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
        <div id="tb-more" className={`tb-more${moreOpen ? ' open' : ''}`}>
        <PeriodToggle value={f.period} onChange={(period) => setFilters({ ...f, period })} />
        <label className="vh" htmlFor="fp">판정</label>
        <select className="krds-form-select small" id="fp" value={f.pass.size === 1 ? [...f.pass][0] : ''} onChange={(e) => setFilters({ ...f, pass: new Set(e.target.value ? [e.target.value as Pass] : PASS_KEYS) })}>
          <option value="">판정 전체</option>{PASS_KEYS.map((p) => <option key={p} value={p}>{PASS[p].label}</option>)}
        </select>
        <label className="vh" htmlFor="fa">처리 상태</label>
        <select className="krds-form-select small" id="fa" value={f.act.size === 1 ? [...f.act][0] : ''} onChange={(e) => setFilters({ ...f, act: new Set(e.target.value ? [e.target.value as Action] : ACTIONS) })}>
          <option value="">처리 상태 전체</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <label className="vh" htmlFor="fd">담당 부서</label>
        <select className="krds-form-select small" id="fd" value={f.dept} onChange={(e) => setFilters({ ...f, dept: e.target.value })}>
          <option value="">담당 부서 전체</option>{DEPTS.filter((d) => d !== '미배정').map((d) => <option key={d}>{d}</option>)}
        </select>
        <label className="vh" htmlFor="fs">정렬</label>
        {/* 정렬은 데스크톱에선 표 머리로, 휴대폰(카드라 표 머리가 없음)에선 이 선택 상자로 */}
        <select className="krds-form-select-sort small tb-sort-m" id="fs" value={f.sort} onChange={(e) => { setFlip(false); setFilters({ ...f, sort: e.target.value as SortKey }); }}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
        </select>
        </div>
        <span className="grow" />
        <button type="button" className="krds-btn small tertiary tb-copy" onClick={copy}>표 복사(엑셀용)</button>
      </div>
      {picked.size > 0 && (
        <div className="bulk">
          <span><b>{picked.size}건</b> 선택</span>
          <select className="krds-form-select small" aria-label="담당 부서" value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}><option value="">담당 부서 이관 안 함</option>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="krds-form-select small" aria-label="처리 상태" value={bulkAct} onChange={(e) => setBulkAct(e.target.value)}><option value="">처리 상태 유지</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
          <button type="button" className="krds-btn small primary" onClick={applyBulk}>일괄 적용</button>
          <button type="button" className="krds-btn small tertiary" onClick={() => setPicked(new Set())}>선택 해제</button>
        </div>
      )}
      {/* KRDS 표: krds-table-wrap > table.tbl.col.data */}
      <div className="krds-table-wrap list-table" ref={tableRef}>
        <table className="tbl col data">
          <caption>관측 목록</caption>
          {/* 칸 너비를 고정해 정렬·페이지를 바꿔도 표가 흔들리지 않게 (위치 칸이 남는 폭을 쓴다) */}
          <colgroup>
            <col className="w-cb" /><col className="w-time" /><col className="w-src" /><col className="w-area" /><col />
            <col className="w-pass" /><col className="w-risk" /><col className="w-route" /><col className="w-persist" />
            <col className="w-dept" /><col className="w-act" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="cb"><div className="krds-form-check"><input type="checkbox" id="pick-all" checked={allOn} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} /><label htmlFor="pick-all"><span className="vh">이 페이지 모두 선택</span></label></div></th>
              {sortTh('time', '촬영 시각')}
              <th scope="col">수집 경로</th>{sortTh('area', '행정구역')}<th scope="col">위치</th><th scope="col">AI 판정</th>
              {sortTh('risk', '위험도')}<th scope="col">처리 유형</th>
              <th scope="col" title="같은 지점의 최근 관측으로 본 흐름: 해소됨 · 상습(다시 나타남) · 지속(계속 그대로) · 확인 대기(요청 후 다음 관측 대기)">현장 추이</th>
              <th scope="col">담당 부서</th><th scope="col">처리 상태</th>
            </tr>
          </thead>
          <tbody>
            {shown.length ? shown.map((o) => {
              return (
                <tr key={o.id} className={picked.has(o.id) ? 'on' : ''} onClick={() => onOpen(o.id)}>
                  <td className="cb" onClick={(e) => e.stopPropagation()}><div className="krds-form-check"><input type="checkbox" id={`pick-${o.id}`} checked={picked.has(o.id)} onChange={(e) => togglePick(o.id, e.target.checked)} /><label htmlFor={`pick-${o.id}`}><span className="vh">{o.place} 선택</span></label></div></td>
                  <td className="c-time">{fmtTime(o.t)}</td>
                  <td className="c-src">{SRC_LABEL[o.src]}</td>
                  <td className="c-area">{o.area ?? <span className="small">—</span>}</td>
                  {/* 행 전체 클릭(마우스)과 별도로, 키보드로도 열 수 있게 위치를 버튼으로 */}
                  <td className="c-place"><button type="button" className="row-open" title={o.place} onClick={(e) => { e.stopPropagation(); onOpen(o.id); }}>{o.place}</button></td>
                  <td className="c-pass"><PassDot pass={effPass(o)} /></td>
                  <td className={`num c-risk${(o.risk ?? 0) >= 80 ? ' hi' : ''}`}>{o.risk ?? <span className="small">—</span>}</td>
                  <td className="c-route">{o.routes.length ? <RouteSummary routes={o.routes} /> : <span className="small">—</span>}</td>
                  <td className={`c-persist${trendOf(o) ? '' : ' empty'}`}><TrendBadge o={o} /></td>
                  <td className="c-dept">{o.dept === '미배정' ? <span className="small">미배정</span> : o.dept}</td>
                  <td className="c-act" onClick={(e) => e.stopPropagation()}>
                    {!o.routes.length && o.action === '미처리' ? <span className="small">{statusText(o)}</span> : <select className="krds-form-select small status" data-v={o.action} aria-label={`${o.place} 처리 상태`} value={o.action}
                      onChange={(e) => { onUpdate(o.id, { action: e.target.value as Action }, `처리 상태: ${e.target.value}`); toast('처리 상태를 바꿨습니다'); }}>
                      {ACTIONS.map((a) => <option key={a}>{a}</option>)}
                    </select>}
                  </td>
                </tr>
              );
            }) : <tr className="empty-row"><td colSpan={11} className="small" style={{ textAlign: 'center', padding: 32 }}>조건에 맞는 관측이 없습니다.<br />검색어나 조건을 바꿔 보세요.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span>전체 {rows.length}건</span>
        {pages > 1 && (
          <nav className="pg-nav" aria-label="페이지">
            <button type="button" className="pg" disabled={cur === 1} onClick={() => goPage(cur - 1)} aria-label="이전 페이지">‹</button>
            {pageNums(cur, pages).map((p) => (
              <button key={p} type="button" className="pg" aria-current={p === cur ? 'page' : undefined} onClick={() => goPage(p)}>{p}</button>
            ))}
            <button type="button" className="pg" disabled={cur === pages} onClick={() => goPage(cur + 1)} aria-label="다음 페이지">›</button>
          </nav>
        )}
        <span>{cur} / {pages} 페이지</span>
      </div>
    </section>
  );
}
