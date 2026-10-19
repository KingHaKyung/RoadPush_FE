import { useState } from 'react';
import { ACTIONS, DEPTS, PASS, PASS_KEYS, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { effPass, matchesFilters } from '../lib/segments';
import type { Action, Filters, Observation, ObservationPatch, Pass } from '../types';
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
  const rows = obs.filter((o) => matchesFilters(o, f))
    .sort(f.sort === 'risk' ? (a, b) => (b.risk ?? -1) - (a.risk ?? -1) : (a, b) => b.t.localeCompare(a.t));
  const allOn = rows.length > 0 && rows.every((o) => picked.has(o.id));
  const togglePick = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
  const last = (o: Observation) => [...o.hist].sort((a, b) => b.t.localeCompare(a.t))[0];

  const copy = () => {
    const tsv = ['촬영 시각\t수집 경로\t링크\t위치\tAI 판정\t위험도\t담당 부서\t처리 상태\t관측 ID',
      ...rows.map((o) => [fmtTime(o.t), `${SRC_LABEL[o.src]} ${o.dev}`, o.seg, o.place, PASS[effPass(o)].label, o.risk ?? '', o.dept, o.action, o.id].join('\t'))].join('\n');
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
      <h1>관측 목록</h1>
      <div className="toolbar">
        <label className="vh" htmlFor="q">검색</label>
        <input className="inp" id="q" type="search" placeholder="위치·관측 ID" value={f.q} style={{ width: 200 }} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
        <PeriodToggle value={f.period} onChange={(period) => setFilters({ ...f, period })} />
        <label className="vh" htmlFor="fp">판정</label>
        <select className="sel" id="fp" value={f.pass.size === 1 ? [...f.pass][0] : ''} onChange={(e) => setFilters({ ...f, pass: new Set(e.target.value ? [e.target.value as Pass] : PASS_KEYS) })}>
          <option value="">판정 전체</option>{PASS_KEYS.map((p) => <option key={p} value={p}>{PASS[p].label}</option>)}
        </select>
        <label className="vh" htmlFor="fa">처리 상태</label>
        <select className="sel" id="fa" value={f.act.size === 1 ? [...f.act][0] : ''} onChange={(e) => setFilters({ ...f, act: new Set(e.target.value ? [e.target.value as Action] : ACTIONS) })}>
          <option value="">처리 상태 전체</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="grow" />
        <button type="button" className="btn" onClick={copy}>표 복사(엑셀용)</button>
      </div>
      {picked.size > 0 && (
        <div className="bulk">
          <span><b>{picked.size}건</b> 선택</span>
          <select className="sel" aria-label="담당 부서" value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}><option value="">담당 부서 유지</option>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="sel" aria-label="처리 상태" value={bulkAct} onChange={(e) => setBulkAct(e.target.value)}><option value="">처리 상태 유지</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
          <button type="button" className="btn primary" onClick={applyBulk}>일괄 적용</button>
          <button type="button" className="btn" onClick={() => setPicked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tablebox">
        <table>
          <caption>관측 목록</caption>
          <thead>
            <tr>
              <th className="cb"><input type="checkbox" aria-label="모두 선택" checked={allOn} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((o) => o.id)) : new Set())} /></th>
              <th><button type="button" onClick={() => setFilters({ ...f, sort: 'time' })}>촬영 시각{f.sort === 'time' ? ' ▾' : ''}</button></th>
              <th>수집 경로</th><th>링크</th><th>위치</th><th>AI 판정</th>
              <th><button type="button" onClick={() => setFilters({ ...f, sort: 'risk' })}>위험도{f.sort === 'risk' ? ' ▾' : ''}</button></th>
              <th>담당 부서</th><th>처리 상태</th><th>최근 처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((o) => {
              const l = last(o);
              return (
                <tr key={o.id} className={picked.has(o.id) ? 'on' : ''} onClick={() => onOpen(o.id)}>
                  <td className="cb" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${o.place} 선택`} checked={picked.has(o.id)} onChange={(e) => togglePick(o.id, e.target.checked)} /></td>
                  <td>{fmtTime(o.t)}</td>
                  <td>{SRC_LABEL[o.src]} <span className="small">{o.dev}</span></td>
                  <td className="small">{o.seg}</td>
                  <td>{o.place}</td>
                  <td><Pill pass={effPass(o)} /></td>
                  <td className="num">{o.risk ?? <span className="small">—</span>}</td>
                  <td>{o.dept === '미배정' ? <span className="small">미배정</span> : o.dept}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="status" data-v={o.action} aria-label={`${o.place} 처리 상태`} value={o.action}
                      onChange={(e) => { onUpdate(o.id, { action: e.target.value as Action }, `처리 상태: ${e.target.value}`); toast('처리 상태를 바꿨습니다'); }}>
                      {ACTIONS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="small last" title={l.txt}>{fmtTime(l.t)} {l.txt}</td>
                </tr>
              );
            }) : <tr><td colSpan={10} className="small" style={{ textAlign: 'center', padding: 32 }}>조건에 맞는 관측이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager"><span>전체 {rows.length}건</span><span>1 / 1 페이지</span></div>
    </section>
  );
}
