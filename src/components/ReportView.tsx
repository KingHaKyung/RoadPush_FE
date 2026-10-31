import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_NOW, PASS, routeName, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { addDays, dayStart, effPass, obsTime, RANGE_MAX_DAYS, ymd } from '../lib/segments';
import type { Action, DateRange, Observation } from '../types';
import { KpiCard, SectionTitle } from './Dashboard';
import { EmptyState } from './EmptyState';
import { PassDot } from './Pill';
import { trendOf } from './RouteBadge';

/**
 * 보고서: 관측 목록 위 큰 창. 고른 기간의 관측을 요약해 보고, 인쇄(PDF)·엑셀로 내려받는다.
 * 주·월·분기를 따로 집계하지 않고 모두 '날짜 범위' 하나로 계산한다 (바로가기는 범위만 채운다)
 */

type Preset = 'thisMonth' | 'lastWeek' | 'lastMonth' | 'lastQuarter' | 'custom';
const PRESETS: [Preset, string][] = [['thisMonth', '이번 달'], ['lastWeek', '지난주'], ['lastMonth', '지난달'], ['lastQuarter', '지난 분기'], ['custom', '직접 선택']];

/** 바로가기 → 날짜 범위 (주는 월~일. 몇째 주인지는 세지 않고 날짜로만 적는다) */
function presetRange(p: Exclude<Preset, 'custom'>, now = DEMO_NOW): DateRange {
  const y = now.getFullYear(), m = now.getMonth();
  const d = (yy: number, mm: number, dd: number) => ymd(new Date(yy, mm, dd));
  if (p === 'thisMonth') return { from: d(y, m, 1), to: ymd(now) };
  if (p === 'lastMonth') return { from: d(y, m - 1, 1), to: d(y, m, 0) };
  if (p === 'lastQuarter') { const q = Math.floor(m / 3) * 3; return { from: d(y, q - 3, 1), to: d(y, q, 0) }; }
  const monday = addDays(ymd(now), -((now.getDay() + 6) % 7));
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

const DAY = 864e5;
const days = (r: DateRange) => Math.round((dayStart(r.to) - dayStart(r.from)) / DAY) + 1;
const inRange = (o: Observation, r: DateRange) => { const t = obsTime(o); return t >= dayStart(r.from) && t < dayStart(r.to) + DAY; };
/** 같은 길이만큼 바로 앞 기간 (증감 비교용) */
const prevRange = (r: DateRange): DateRange => ({ from: addDays(r.from, -days(r)), to: addDays(r.from, -1) });
/** 공문서 날짜 표기: 2026. 10. 1. (끝 날짜는 같은 해면 연도를 뺀다) */
const krDate = (s: string, withYear = true) => { const [y, m, d] = s.split('-').map(Number); return `${withYear ? `${y}. ` : ''}${m}. ${d}.`; };
const krRange = (r: DateRange) => `${krDate(r.from)} ~ ${krDate(r.to, r.from.slice(0, 4) !== r.to.slice(0, 4))}`;

const isRisk = (o: Observation) => ['blocked', 'narrowed'].includes(effPass(o));
/** 화면에 보여 줄 처리 미완료 수 (엑셀에는 전부) */
const OPEN_SHOWN = 20;
const STATES: Action[] = ['미처리', '현장점검 요청', '조치 중', '조치 완료'];

/** 기간 안의 관측으로 보고서에 들어갈 숫자·표를 만든다 */
function summarize(obs: Observation[], r: DateRange) {
  const list = obs.filter((o) => !o.analyzing && inRange(o, r));
  const targets = list.filter((o) => o.routes.length > 0);
  const done = targets.filter((o) => o.action === '조치 완료').length;
  const count = <K extends string>(items: Observation[], key: (o: Observation) => K[]) => {
    const m = new Map<K, number>();
    for (const o of items) for (const k of key(o)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // 같은 지점(좌표)의 가장 최근 관측으로 상습·지속·해소를 본다
  const latest = new Map<string, Observation>();
  for (const o of list) { const k = `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`; const c = latest.get(k); if (!c || o.t > c.t) latest.set(k, o); }
  return {
    list,
    total: list.length,
    blocked: list.filter((o) => effPass(o) === 'blocked').length,
    narrowed: list.filter((o) => effPass(o) === 'narrowed').length,
    hold: list.filter((o) => effPass(o) === 'hold').length,
    targets: targets.length,
    done,
    rate: targets.length ? Math.round((done / targets.length) * 100) : null,
    areas: count(list.filter(isRisk), (o) => [o.area ?? '행정구역 미상']).slice(0, 10),
    causes: count(list.filter(isRisk), (o) => o.causes),
    repeat: [...latest.values()].filter((o) => trendOf(o)).sort((a, b) => (b.persist?.n ?? 0) - (a.persist?.n ?? 0)),
    depts: count(targets, (o) => [o.dept]).map(([dept]) => ({ dept, by: STATES.map((s) => targets.filter((o) => o.dept === dept && o.action === s).length) })),
    open: targets.filter((o) => o.action !== '조치 완료').sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1)),
  };
}

export function ReportView({ obs }: { obs: Observation[] }) {
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [range, setRange] = useState<DateRange>(() => presetRange('thisMonth'));
  const today = ymd(DEMO_NOW);
  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };
  // 직접 고를 때도 최대 3개월, 오늘까지
  const setFrom = (from: string) => from && setRange((r) => ({ from, to: days({ from, to: r.to }) > RANGE_MAX_DAYS ? [addDays(from, RANGE_MAX_DAYS - 1), today].sort()[0] : r.to < from ? from : r.to }));
  const setTo = (to: string) => to && setRange((r) => ({ from: days({ from: r.from, to }) > RANGE_MAX_DAYS ? addDays(to, -(RANGE_MAX_DAYS - 1)) : r.from > to ? to : r.from, to }));

  const cur = useMemo(() => summarize(obs, range), [obs, range]);
  const prev = useMemo(() => summarize(obs, prevRange(range)), [obs, range]);
  const title = '보행 통로 위험 관측 현황 보고';
  const span = `${krRange(range)}(${days(range)}일)`;
  const vs = `직전 ${days(range)}일 대비`;
  useEffect(() => { document.title = `${title} ${range.from}~${range.to} · RoadPush`; return () => { document.title = 'RoadPush 관제 대시보드'; }; }, [title]);

  /** 엑셀(CSV): 요약·표를 위에서부터 차례로 (빈 줄로 구분) */
  const download = () => {
    const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows: (string | number)[][] = [
      [title], [`기간: ${span}`], [`작성: ${fmtTime(new Date().toISOString())}`], [],
      ['요약', '이번 기간', `직전 ${days(range)}일`],
      ['전체 관측', cur.total, prev.total], ['단절', cur.blocked, prev.blocked], ['좁아짐', cur.narrowed, prev.narrowed], ['판단 유보', cur.hold, prev.hold],
      ['처리 대상', cur.targets, prev.targets], ['조치 완료', cur.done, prev.done], ['조치 완료율(%)', cur.rate ?? '', prev.rate ?? ''], [],
      ['행정구역별 위험 관측', '건수'], ...cur.areas, [],
      ['원인별 위험 관측', '건수'], ...cur.causes, [],
      ['부서별 조치 현황', ...STATES], ...cur.depts.map((d) => [d.dept, ...d.by]), [],
      ['반복 발생 및 해소 지점', '현장 추이', '행정구역', '최근 관측', '판정'], ...cur.repeat.map((o) => [o.place, trendOf(o)!.label, o.area ?? '', fmtTime(o.t), PASS[effPass(o)].label]), [],
      ['미조치 현황(위험도순)', '판정', '위험도', '처리 유형', '담당 부서', '처리 상태', '촬영', '관측 ID'],
      ...cur.open.map((o) => [o.place, PASS[effPass(o)].label, o.risk ?? '', [...new Set(o.routes.map((x) => routeName(x.type)))].join(', '), o.dept, o.action, fmtTime(o.t), o.id]),
    ];
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `보행통로_위험관측_현황보고_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const delta = (k: 'total' | 'blocked' | 'narrowed' | 'hold') => ({ now: cur[k], prev: prev[k] });

  /**
   * 인쇄·PDF: 보고서 부분만 따로 HTML 문서로 만들어 보이지 않는 틀(iframe)에서 인쇄한다.
   * 화면의 스타일을 그대로 옮겨 같은 모양으로 나오고, 뒤 화면·창 테두리·도구 줄은 들어가지 않는다
   */
  const reportRef = useRef<HTMLElement>(null);
  const printReport = () => {
    const src = reportRef.current; if (!src) return;
    const frame = document.createElement('iframe');
    frame.title = '보고서 인쇄';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument!, win = frame.contentWindow!;
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><base href="${location.origin}/">${styles}</head>`
      + `<body class="report-print">${src.outerHTML}</body></html>`);
    doc.close();
    // 글꼴·스타일을 다 읽은 뒤 인쇄하고, 인쇄 창을 닫으면 틀을 치운다
    const go = () => { win.focus(); win.print(); };
    win.addEventListener('afterprint', () => frame.remove());
    Promise.race([doc.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(go, 100));
  };
  return (
    <section className="report-view">
      <div className="toolbar report-bar">
        <div className="krds-check-area chip-group" role="radiogroup" aria-label="보고 기간">
          {PRESETS.map(([p, label]) => (
            <div key={p} className="krds-form-chip small">
              <input type="radio" name="rp-preset" id={`rp-${p}`} checked={preset === p} onChange={() => pick(p)} />
              <label className="krds-form-chip-outline" htmlFor={`rp-${p}`}>{label}</label>
            </div>
          ))}
        </div>
        <div className="period-range" role="group" aria-label="보고 기간 날짜">
          <label className="vh" htmlFor="rp-from">시작일</label>
          <input className="krds-input small" type="date" id="rp-from" value={range.from} min={addDays(today, -365)} max={today} title="최대 3개월까지 고를 수 있습니다" onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} />
          <span aria-hidden="true">~</span>
          <label className="vh" htmlFor="rp-to">종료일</label>
          <input className="krds-input small" type="date" id="rp-to" value={range.to} min={range.from} max={[addDays(range.from, RANGE_MAX_DAYS - 1), today].sort()[0]} title="최대 3개월까지 고를 수 있습니다" onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} />
        </div>
        <span className="grow" />
        <button type="button" className="krds-btn small tertiary" onClick={printReport}>인쇄·PDF 저장</button>
        <button type="button" className="krds-btn small secondary" onClick={download}>엑셀로 내려받기</button>
      </div>

      <article className="report" ref={reportRef}>
        <header className="report-head">
          <h2>{title}</h2>
          <p>기간: {span} · 비교: {krRange(prevRange(range))} · 작성: {fmtTime(new Date().toISOString())}</p>
        </header>

        {!cur.total ? (
          <EmptyState kind="empty" title="이 기간에 들어온 관측이 없습니다" desc="다른 기간을 골라 보세요. 최대 3개월까지 볼 수 있습니다." />
        ) : <>
          <div className="kpis">
            <KpiCard hero label="전체 관측" unit="건" value={cur.total} delta={delta('total')} deltaLabel={vs} tone="neutral" />
            <KpiCard label="단절" unit="건" value={cur.blocked} delta={delta('blocked')} deltaLabel={vs} />
            <KpiCard label="좁아짐" unit="건" value={cur.narrowed} delta={delta('narrowed')} deltaLabel={vs} />
            <KpiCard label="조치 완료율" unit={cur.rate == null ? undefined : '%'} value={cur.rate ?? '—'} note={`처리 대상 ${cur.targets}건 중 ${cur.done}건`} tone="good" />
          </div>

          <div className="report-grid">
            <section>
              <SectionTitle title="행정구역별 위험 관측" sub="상위 10곳" />
              <RankTable head={['행정구역', '건수']} rows={cur.areas} />
            </section>
            <section>
              <SectionTitle title="원인별 위험 관측" />
              <RankTable head={['원인', '건수']} rows={cur.causes} />
            </section>
          </div>

          <section>
            <SectionTitle title="부서별 조치 현황" />
            <div className="krds-table-wrap list-table">
              <table className="tbl col data">
                <caption>부서별 조치 현황</caption>
                <thead><tr><th scope="col">담당 부서</th>{STATES.map((s) => <th key={s} scope="col" className="num">{s}</th>)}</tr></thead>
                <tbody>{cur.depts.map((d) => <tr key={d.dept}><th scope="row">{d.dept}</th>{d.by.map((n, i) => <td key={i} className="num">{n}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>

          {cur.repeat.length > 0 && (
            <section>
              <SectionTitle title="반복 발생 및 해소 지점" sub={`${cur.repeat.length}곳`} />
              <div className="krds-table-wrap list-table">
                <table className="tbl col data">
                  <caption>반복 발생 및 해소 지점</caption>
                  <thead><tr><th scope="col">위치</th><th scope="col">현장 추이</th><th scope="col">행정구역</th><th scope="col">최근 관측</th><th scope="col">판정</th></tr></thead>
                  <tbody>{cur.repeat.map((o) => (
                    <tr key={o.id}><td>{o.place}</td><td>{trendOf(o)!.label}</td><td>{o.area ?? '—'}</td><td>{fmtTime(o.t)}</td><td><PassDot pass={effPass(o)} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <SectionTitle title="미조치 현황(위험도순)" sub={`${cur.open.length}건${cur.open.length > OPEN_SHOWN ? ` 중 상위 ${OPEN_SHOWN}건 (전체는 엑셀)` : ''}`} />
            <div className="krds-table-wrap list-table">
              <table className="tbl col data">
                <caption>미조치 현황</caption>
                <thead><tr><th scope="col">위치</th><th scope="col">판정</th><th scope="col" className="num">위험도</th><th scope="col">처리 유형</th><th scope="col">담당 부서</th><th scope="col">처리 상태</th><th scope="col">촬영</th></tr></thead>
                <tbody>{cur.open.length ? cur.open.slice(0, OPEN_SHOWN).map((o) => (
                  <tr key={o.id}><td>{o.place}</td><td><PassDot pass={effPass(o)} /></td><td className="num">{o.risk ?? '—'}</td><td>{[...new Set(o.routes.map((x) => routeName(x.type)))].join(', ')}</td><td>{o.dept}</td><td>{o.action}</td><td>{fmtTime(o.t)} · {SRC_LABEL[o.src]}</td></tr>
                )) : <tr><td colSpan={7} className="small">미조치 건이 없습니다.</td></tr>}</tbody>
              </table>
            </div>
          </section>
          <p className="report-note">판정·위험도·점유율은 사진을 AI로 분석한 값으로, 현장 확인 전 참고 자료입니다.</p>
        </>}
      </article>
    </section>
  );
}

/** 이름·건수 표 (건수는 막대로 함께) */
function RankTable({ head, rows }: { head: [string, string]; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="krds-table-wrap list-table">
      <table className="tbl col data">
        <caption>{head[0]}별 {head[1]}</caption>
        <thead><tr><th scope="col">{head[0]}</th><th scope="col">{head[1]}</th></tr></thead>
        <tbody>{rows.length ? rows.map(([k, n]) => (
          <tr key={k}><th scope="row">{k}</th><td><span className="rank-bar"><i style={{ width: `${(n / max) * 100}%` }} /></span><b>{n}</b></td></tr>
        )) : <tr><td colSpan={2} className="small">위험 관측이 없습니다.</td></tr>}</tbody>
      </table>
    </div>
  );
}
