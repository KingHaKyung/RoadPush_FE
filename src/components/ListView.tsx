import { useState } from 'react';
import { ACCENT, ACTIONS, DEPTS, PASS, PASS_KEYS, PERIOD_LABEL, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { compareObs, effPass, inPeriod, matchesFilters, matchesQuery } from '../lib/segments';
import { dayDelta, spanLabel, trend } from '../lib/stats';
import type { Action, Filters, Observation, ObservationPatch, Pass, SortKey } from '../types';
import { KpiCard, SectionTitle } from './Dashboard';
import { PeriodToggle } from './PeriodToggle';
import { Pill } from './Pill';

interface Props {
  obs: Observation[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  onOpen: (id: string) => void;
  onUpdate: (ids: string | string[], patch: ObservationPatch, log?: string) => void;
  toast: (m: string) => void;
}

export function ListView({ obs, filters: f, setFilters, onOpen, onUpdate, toast }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDept, setBulkDept] = useState('');
  const [bulkAct, setBulkAct] = useState('');
  const rows = obs.filter((o) => matchesFilters(o, f)).sort(compareObs(f.sort));

  // 지표 카드: 기간·수집 경로·검색어까지만 걸린 관측 기준 (판정·처리 상태는 카드로 고른다)
  const base = obs.filter((o) => inPeriod(o, f.period) && f.src.has(o.src) && matchesQuery(o, f.q));
  const allPass = f.pass.size === PASS_KEYS.length, allAct = f.act.size === ACTIONS.length;
  const only = <T,>(set: Set<T>, v: T) => set.size === 1 && set.has(v);
  const KPIS: { label: string; pred: (o: Observation) => boolean; tone: 'risk' | 'good' | 'neutral'; active: boolean; apply: Partial<Filters>; accent: string }[] = [
    { label: '전체 관측', pred: () => true, tone: 'neutral', active: allPass && allAct, apply: { pass: new Set(PASS_KEYS), act: new Set(ACTIONS) }, accent: ACCENT.primary },
    { label: '단절', pred: (o) => effPass(o) === 'blocked', tone: 'risk', active: only(f.pass, 'blocked') && allAct, apply: { pass: new Set<Pass>(['blocked']), act: new Set(ACTIONS) }, accent: ACCENT.danger },
    { label: '미처리', pred: (o) => o.action === '미처리', tone: 'risk', active: allPass && only(f.act, '미처리'), apply: { pass: new Set(PASS_KEYS), act: new Set<Action>(['미처리']) }, accent: ACCENT.warning },
    { label: '조치 완료', pred: (o) => o.action === '조치 완료', tone: 'good', active: allPass && only(f.act, '조치 완료'), apply: { pass: new Set(PASS_KEYS), act: new Set<Action>(['조치 완료']) }, accent: ACCENT.success },
  ];
  const sortBtn = (k: SortKey, label: string) => (
    <button type="button" aria-pressed={f.sort === k} onClick={() => setFilters({ ...f, sort: k })}>{label}{f.sort === k ? ' ▾' : ''}</button>
  );
  const allOn = rows.length > 0 && rows.every((o) => picked.has(o.id));
  const togglePick = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
  const last = (o: Observation) => [...o.hist].sort((a, b) => b.t.localeCompare(a.t))[0];

  const copy = () => {
    const tsv = ['촬영 시각\t수집 경로\t행정구역\t링크\t위치\tAI 판정\t위험도\t담당 부서\t처리 상태\t관측 ID',
      ...rows.map((o) => [fmtTime(o.t), `${SRC_LABEL[o.src]} ${o.dev}`, o.area ?? '', o.seg, o.place, PASS[effPass(o)].label, o.risk ?? '', o.dept, o.action, o.id].join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => toast(`${rows.length}건을 복사했습니다. 엑셀에 붙여넣으세요`), () => toast('복사하지 못했습니다'));
  };
  const applyBulk = () => {
    if (!bulkDept && !bulkAct) { toast('바꿀 항목을 고르세요'); return; }
    const ids = [...picked];
    if (bulkDept) onUpdate(ids, { dept: bulkDept }, `${bulkDept} 배정 (일괄)`);
    if (bulkAct) onUpdate(ids, { action: bulkAct as Action }, `처리 상태: ${bulkAct} (일괄)`);
    toast(`${ids.length}건에 적용했습니다`);
    setPicked(new Set()); setBulkDept(''); setBulkAct('');
  };

  return (
    <section id="v-list" className="page">
      <SectionTitle as="h1" size="page" title="관측 목록" sub={`${PERIOD_LABEL[f.period]} · ${rows.length}건`} />
      <div className="kpis" aria-label="관측 현황 (누르면 표를 거릅니다)">
        {KPIS.map((k) => {
          const pred = (o: Observation) => matchesQuery(o, f.q) && k.pred(o);
          return <KpiCard key={k.label} label={k.label} unit="건" value={base.filter(k.pred).length} tone={k.tone} accent={k.accent}
            delta={dayDelta(obs, f, pred)} values={trend(obs, f, pred)} spanLabel={spanLabel(f)}
            active={k.active} onClick={() => setFilters({ ...f, ...k.apply })} />;
        })}
      </div>
      <div className="toolbar">
        <label className="vh" htmlFor="q">검색</label>
        <input className="krds-input small" id="q" type="search" placeholder="위치·행정구역·장비·관측 ID" value={f.q} style={{ width: 240 }} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
        <PeriodToggle value={f.period} onChange={(period) => setFilters({ ...f, period })} />
        <label className="vh" htmlFor="fp">판정</label>
        <select className="krds-form-select small" id="fp" value={f.pass.size === 1 ? [...f.pass][0] : ''} onChange={(e) => setFilters({ ...f, pass: new Set(e.target.value ? [e.target.value as Pass] : PASS_KEYS) })}>
          <option value="">판정 전체</option>{PASS_KEYS.map((p) => <option key={p} value={p}>{PASS[p].label}</option>)}
        </select>
        <label className="vh" htmlFor="fa">처리 상태</label>
        <select className="krds-form-select small" id="fa" value={f.act.size === 1 ? [...f.act][0] : ''} onChange={(e) => setFilters({ ...f, act: new Set(e.target.value ? [e.target.value as Action] : ACTIONS) })}>
          <option value="">처리 상태 전체</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <label className="vh" htmlFor="fs">정렬</label>
        <select className="krds-form-select-sort small" id="fs" value={f.sort} onChange={(e) => setFilters({ ...f, sort: e.target.value as SortKey })}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
        </select>
        <span className="grow" />
        <button type="button" className="krds-btn small tertiary" onClick={copy}>표 복사(엑셀용)</button>
      </div>
      {picked.size > 0 && (
        <div className="bulk">
          <span><b>{picked.size}건</b> 선택</span>
          <select className="krds-form-select small" aria-label="담당 부서" value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}><option value="">담당 부서 유지</option>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="krds-form-select small" aria-label="처리 상태" value={bulkAct} onChange={(e) => setBulkAct(e.target.value)}><option value="">처리 상태 유지</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
          <button type="button" className="krds-btn small primary" onClick={applyBulk}>일괄 적용</button>
          <button type="button" className="krds-btn small tertiary" onClick={() => setPicked(new Set())}>선택 해제</button>
        </div>
      )}
      {/* KRDS 표: krds-table-wrap > table.tbl.col.data */}
      <div className="krds-table-wrap list-table">
        <table className="tbl col data">
          <caption>관측 목록</caption>
          <thead>
            <tr>
              <th scope="col" className="cb"><div className="krds-form-check"><input type="checkbox" id="pick-all" checked={allOn} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((o) => o.id)) : new Set())} /><label htmlFor="pick-all"><span className="vh">모두 선택</span></label></div></th>
              <th scope="col">{sortBtn('time', '촬영 시각')}</th>
              <th scope="col">수집 경로</th><th scope="col">{sortBtn('area', '행정구역')}</th><th scope="col">링크</th><th scope="col">위치</th><th scope="col">AI 판정</th>
              <th scope="col">{sortBtn('risk', '위험도')}</th>
              <th scope="col">담당 부서</th><th scope="col">처리 상태</th><th scope="col">최근 처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((o) => {
              const l = last(o);
              return (
                <tr key={o.id} className={picked.has(o.id) ? 'on' : ''} onClick={() => onOpen(o.id)}>
                  <td className="cb" onClick={(e) => e.stopPropagation()}><div className="krds-form-check"><input type="checkbox" id={`pick-${o.id}`} checked={picked.has(o.id)} onChange={(e) => togglePick(o.id, e.target.checked)} /><label htmlFor={`pick-${o.id}`}><span className="vh">{o.place} 선택</span></label></div></td>
                  <td>{fmtTime(o.t)}</td>
                  <td>{SRC_LABEL[o.src]} <span className="small">{o.dev}</span></td>
                  <td>{o.area ?? <span className="small">—</span>}</td>
                  <td className="small">{o.seg}</td>
                  {/* 행 전체 클릭(마우스)과 별도로, 키보드로도 열 수 있게 위치를 버튼으로 */}
                  <td><button type="button" className="row-open" onClick={(e) => { e.stopPropagation(); onOpen(o.id); }}>{o.place}</button></td>
                  <td><Pill pass={effPass(o)} /></td>
                  <td className="num">{o.risk ?? <span className="small">—</span>}</td>
                  <td>{o.dept === '미배정' ? <span className="small">미배정</span> : o.dept}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="krds-form-select small status" data-v={o.action} aria-label={`${o.place} 처리 상태`} value={o.action}
                      onChange={(e) => { onUpdate(o.id, { action: e.target.value as Action }, `처리 상태: ${e.target.value}`); toast('처리 상태를 바꿨습니다'); }}>
                      {ACTIONS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="small last" title={l.txt}>{fmtTime(l.t)} {l.txt}</td>
                </tr>
              );
            }) : <tr><td colSpan={11} className="small" style={{ textAlign: 'center', padding: 32 }}>조건에 맞는 관측이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager"><span>전체 {rows.length}건</span><span>1 / 1 페이지</span></div>
    </section>
  );
}
