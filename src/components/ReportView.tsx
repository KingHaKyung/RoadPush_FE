import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_NOW, NO_DEPT, PASS, PASS_KEYS, routeName } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { addDays, dayStart, effPass, obsTime, RANGE_MAX_DAYS, ymd } from '../lib/segments';
import type { Action, DateRange, Observation } from '../types';
import { KpiCard, SectionTitle } from './Dashboard';
import { EmptyState } from './EmptyState';
import { FrameView } from './FrameView';
import { PassDot } from './Pill';

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

/** 처리 단계 (미조치 대상이 어디쯤 와 있는지). 미처리는 부서 배정 여부로 나눈다 */
const STAGES = ['부서 미배정', '요청 전', '현장점검 요청', '조치 중', '조치 완료'] as const;
type Stage = (typeof STAGES)[number];
const stageOf = (o: Observation): Stage => (o.action === '미처리' ? (o.dept === NO_DEPT ? '부서 미배정' : '요청 전') : o.action);
/** 우선 확인 지점 수 */
const TOP_N = 5;
const H = 36e5;

/** 기간 안의 관측으로 보고서에 들어갈 숫자·표를 만든다 */
function summarize(obs: Observation[], r: DateRange) {
  const list = obs.filter((o) => !o.analyzing && inRange(o, r));
  const risk = list.filter(isRisk);
  const targets = list.filter((o) => o.routes.length > 0);
  const done = targets.filter((o) => o.action === '조치 완료').length;
  const count = <K extends string>(items: Observation[], key: (o: Observation) => K[]) => {
    const m = new Map<K, number>();
    for (const o of items) for (const k of key(o)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // 같은 지점(좌표)의 가장 최근 관측: 우선 확인 지점은 지점마다 한 줄
  const latest = new Map<string, Observation>();
  for (const o of risk) { const k = `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`; const c = latest.get(k); if (!c || o.t > c.t) latest.set(k, o); }
  // 접수부터 처음 '현장점검 요청'까지 걸린 시간 (처리 이력의 시각). 가운데 값으로 (몇 건이 튀어도 덜 흔들리게)
  const leads = targets.map((o) => {
    const at = obsTime(o);
    const req = o.hist.filter((h) => h.txt.includes('현장점검 요청')).map((h) => Date.parse(h.t)).filter((t) => t >= at).sort((a, b) => a - b)[0];
    return req ? (req - at) / H : null;
  }).filter((x): x is number => x != null).sort((a, b) => a - b);
  const reviewed = list.filter((o) => o.review !== '미검수');
  return {
    list,
    total: list.length,
    blocked: list.filter((o) => effPass(o) === 'blocked').length,
    narrowed: list.filter((o) => effPass(o) === 'narrowed').length,
    risk: risk.length,
    hold: list.filter((o) => effPass(o) === 'hold').length,
    judge: PASS_KEYS.map((p) => [p, list.filter((o) => effPass(o) === p).length] as const),
    targets: targets.length,
    done,
    open: targets.length - done,
    rate: targets.length ? Math.round((done / targets.length) * 100) : null,
    areas: count(risk, (o) => [o.area ?? '행정구역 미상']).slice(0, 10),
    causes: count(risk, (o) => o.causes),
    /** 원인을 가리지 못한 위험 관측 (원인 집계에서 빠진다) */
    noCause: risk.filter((o) => !o.causes.length).length,
    top: [...latest.values()].filter((o) => o.risk != null).sort((a, b) => b.risk! - a.risk!).slice(0, TOP_N),
    stages: STAGES.map((s) => [s, targets.filter((o) => stageOf(o) === s).length] as const),
    depts: count(targets, (o) => [o.dept]).map(([dept]) => ({ dept, by: STATES.map((s) => targets.filter((o) => o.dept === dept && o.action === s).length) })),
    openList: targets.filter((o) => o.action !== '조치 완료').sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1)),
    reviewed: reviewed.length,
    confirmed: reviewed.filter((o) => o.review === '확인').length,
    corrected: reviewed.filter((o) => o.review === '수정').length,
    leadH: leads.length ? leads[Math.floor(leads.length / 2)] : null,
    leadN: leads.length,
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
  const title = '보행 안전 위험 분석 및 조치 현황 보고';
  const span = `${krRange(range)}(${days(range)}일)`;
  useEffect(() => { document.title = `${title} ${range.from}~${range.to} · RoadPush`; return () => { document.title = 'RoadPush 관제 대시보드'; }; }, [title]);

  /** 엑셀(CSV): 요약·표를 위에서부터 차례로 (빈 줄로 구분) */
  const download = () => {
    const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows: (string | number)[][] = [
      [title], [`기간: ${span}`], [`작성: ${fmtTime(new Date().toISOString())}`], [],
      ['1. 핵심 요약', '이번 기간', `직전 ${days(range)}일`],
      ['전체 관측', cur.total, prev.total], ['단절', cur.blocked, prev.blocked], ['좁아짐', cur.narrowed, prev.narrowed], ['판단 유보', cur.hold, prev.hold],
      ['처리 대상', cur.targets, prev.targets], ['미조치 대상', cur.open, prev.open], ['조치 완료', cur.done, prev.done], ['조치 완료율(%)', cur.rate ?? '', prev.rate ?? ''], [],
      ['2. 행정구역별 위험 관측', '건수'], ...cur.areas, [],
      ['2. 원인별 위험 관측', '건수'], ...cur.causes, ...(cur.noCause ? [['원인 미상', cur.noCause]] : []), [],
      ['3. 우선 확인 지점', '행정구역', '판정', '위험도', '원인', '처리 유형', '최근 관측', '반복', '관측 ID'],
      ...cur.top.map((o) => [o.place, o.area ?? '', PASS[effPass(o)].label, o.risk ?? '', o.causes.join(', '), [...new Set(o.routes.map((x) => routeName(x.type)))].join(', '), fmtTime(o.t), o.persist && o.persist.kind !== '일시' ? `${o.persist.kind} ${o.persist.n}회` : '', o.id]), [],
      ['4. 처리 단계', '건수'], ...cur.stages.map(([st, n]) => [st, n]), [],
      ['4. 부서별 조치 현황', ...STATES], ...cur.depts.map((d) => [d.dept, ...d.by]), [],
      ['4. 미조치 목록(위험도순)', '판정', '위험도', '처리 유형', '담당 부서', '처리 상태', '촬영', '관측 ID'],
      ...cur.openList.map((o) => [o.place, PASS[effPass(o)].label, o.risk ?? '', [...new Set(o.routes.map((x) => routeName(x.type)))].join(', '), o.dept, o.action, fmtTime(o.t), o.id]), [],
      ['5. AI 판정', '건수'], ...cur.judge.map(([p, n]) => [PASS[p].label, n]),
      ['검수한 관측', cur.reviewed], ['AI 판정 확인', cur.confirmed], ['AI 판정 수정', cur.corrected],
    ];
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `보행통로_위험관측_현황보고_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const delta = (k: 'total' | 'risk' | 'open') => ({ now: cur[k], prev: prev[k] });
  /** 증감 옆에 직전 기간의 실제 수를 함께 (증가분만으로는 크기를 알 수 없어서) */
  const vsN = (n: number) => `직전 ${days(range)}일 ${n}건`;

  /**
   * 인쇄·PDF: 보고서 부분만 따로 HTML 문서로 만들어 보이지 않는 틀(iframe)에서 인쇄한다.
   * 화면의 스타일을 그대로 옮겨 같은 모양으로 나오고, 뒤 화면·창 테두리·도구 줄은 들어가지 않는다
   */
  const reportRef = useRef<HTMLElement>(null);
  /** 인쇄용 보고서를 만드는 중 (사진을 받느라 몇 초 걸린다). 그동안 버튼을 막고 안내를 띄운다 */
  const [printing, setPrinting] = useState(false);
  const printReport = () => {
    if (printing) return;
    setPrinting(true);
    const src = reportRef.current; if (!src) return;
    const frame = document.createElement('iframe');
    frame.title = '보고서 인쇄';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument!, win = frame.contentWindow!;
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><base href="${location.origin}/">${styles}</head>`
      // 큰 창과 같은 틀(modal-box) 안에 넣어 창 안에서와 같은 글자 크기·규칙을 받게 한다
      + `<body class="report-print"><div class="modal-box modal-xl">${src.outerHTML.replace(/ loading="lazy"/g, '')}</div></body></html>`);
    doc.close();
    // 글꼴·스타일을 다 읽은 뒤 인쇄하고, 인쇄 창을 닫으면 틀을 치운다
    // 인쇄 창이 뜨기 직전에 안내를 내린다 (인쇄 창은 닫힐 때까지 화면을 멈춘다)
    const go = () => { setPrinting(false); win.focus(); win.print(); };
    win.addEventListener('afterprint', () => frame.remove());
    // 사진(우선 확인 지점)까지 받은 뒤 인쇄 (공유 서버가 느려 최대 10초까지 기다린다. 화면에서 'lazy'는 숨은 틀에서 받지 않아 뺐다)
    const imgs = [...doc.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })));
    Promise.race([Promise.all([doc.fonts?.ready ?? Promise.resolve(), ...imgs]), new Promise((r) => setTimeout(r, 10000))]).then(() => setTimeout(go, 100));
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
        <button type="button" className="krds-btn small tertiary" onClick={printReport} disabled={printing} aria-busy={printing}>
          {printing ? <><span className="krds-spinner small" aria-hidden="true" />보고서 만드는 중</> : '인쇄·PDF 저장'}
        </button>
        <button type="button" className="krds-btn small secondary" onClick={download}>엑셀로 내려받기</button>
      </div>

      <p className="report-making" role="status" aria-live="polite">
        {printing && '인쇄용 보고서를 만드는 중입니다. 현장 사진을 받느라 몇 초(최대 10초) 걸릴 수 있습니다.'}
      </p>
      <article className="report" ref={reportRef}>
        <header className="report-head">
          <h2>{title}</h2>
          <p>기간: {span} · 비교: {krRange(prevRange(range))} · 작성: {fmtTime(new Date().toISOString())}</p>
        </header>

        {!cur.total ? (
          <EmptyState kind="empty" title="이 기간에 들어온 관측이 없습니다" desc="다른 기간을 골라 보세요. 최대 3개월까지 볼 수 있습니다." />
        ) : <>
          <section className="report-sec">
            <SectionTitle title="1. 핵심 요약" />
            {/* 숫자가 무슨 뜻인지 한 문장으로 먼저 */}
            <p className="report-lead">
              이 기간 관측 {cur.total}건 중 {cur.risk}건({pct(cur.risk, cur.total)})이 보행 통로가 막히거나 좁아진 위험 관측이었고,
              처리 대상 {cur.targets}건 중 {cur.done}건이 조치를 마쳤습니다.
            </p>
            <div className="kpis">
              <KpiCard hero label="전체 관측" unit="건" value={cur.total} delta={delta('total')} deltaLabel={vsN(prev.total)} tone="neutral" />
              <KpiCard label="단절·좁아짐" unit="건" value={cur.risk} delta={delta('risk')} deltaLabel={vsN(prev.risk)} />
              <KpiCard label="미조치 대상" unit="건" value={cur.open} delta={delta('open')} deltaLabel={vsN(prev.open)} />
              <KpiCard label="조치 완료율" unit={cur.rate == null ? undefined : '%'} value={cur.rate ?? '—'} note={`처리 대상 ${cur.targets}건 중 ${cur.done}건 · 직전 ${prev.rate == null ? '—' : `${prev.rate}%`}`} tone="good" />
            </div>
          </section>

          <section className="report-sec">
            <SectionTitle title="2. 위험 발생 분석" sub="어디에서, 어떤 원인으로" />
            <div className="report-grid">
              <section>
                <SectionTitle as="h3" title="행정구역별 위험 관측" sub="상위 10곳" />
                <RankTable head={['행정구역', '건수']} rows={cur.areas} />
              </section>
              <section>
                <SectionTitle as="h3" title="원인별 위험 관측" />
                <RankTable head={['원인', '건수']} rows={cur.causes} />
              </section>
            </div>
            <p className="report-sub">
              집계 기준: 단절·좁아짐 판정 {cur.risk}건. 한 관측에 원인이 여럿이면 원인마다 셉니다
              {cur.noCause > 0 && `. 원인을 가리지 못한 관측 ${cur.noCause}건은 원인 집계에서 빠집니다`}.
            </p>
          </section>

          <section className="report-sec">
            <SectionTitle title="3. 우선 확인 지점" sub={`위험도순 상위 ${cur.top.length}곳`} />
            {cur.top.length ? (
              <div className="krds-table-wrap list-table">
                <table className="tbl col data report-top">
                  <caption>우선 확인 지점</caption>
                  <thead><tr><th scope="col">AI 분석 사진</th><th scope="col">위치</th><th scope="col">판정</th><th scope="col" className="num">위험도</th><th scope="col">원인 · 처리 유형</th><th scope="col">최근 관측</th><th scope="col">반복</th></tr></thead>
                  <tbody>{cur.top.map((o) => (
                    <tr key={o.id}>
                      <td><span className="report-photo"><FrameView o={o} overlay thumb /></span></td>
                      <td><b>{o.place}</b><span className="report-cell-sub">{o.area ?? '행정구역 미상'}</span></td>
                      <td><PassDot pass={effPass(o)} /></td>
                      <td className="num"><b>{o.risk}</b></td>
                      <td>{o.causes.join(', ') || '—'}<span className="report-cell-sub">{[...new Set(o.routes.map((x) => routeName(x.type)))].join(', ') || '—'}</span></td>
                      <td>{fmtTime(o.t)}</td>
                      <td>{o.persist && o.persist.kind !== '일시' ? `${o.persist.kind} ${o.persist.n}회` : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="small">위험도가 산출된 위험 관측이 없습니다.</p>}
            <p className="report-sub">
              위험도(0~100)는 남은 통로 폭(가중치 절반), 남은 통로의 추정 너비, 차도로 돌아갈 때의 위험, 원인 종류를 합친 상대 점수로,
              높을수록 먼저 확인할 곳입니다. 단절·좁아짐 판정 안에서 순서를 매기며, 기준값은 현장 보정 전 임시값입니다.
            </p>
          </section>

          <section className="report-sec">
            <SectionTitle title="4. 행정 조치 현황" sub="위험 관측이 조치로 이어지고 있는가" />
            <section>
              <SectionTitle as="h3" title="처리 단계" sub={`처리 대상 ${cur.targets}건`} />
              <StageBar stages={cur.stages} total={cur.targets} />
              {cur.leadH != null && (
                <p className="report-sub">접수부터 현장점검 요청까지 걸린 시간: 가운데 값 {fmtHours(cur.leadH)} (요청한 {cur.leadN}건 기준)</p>
              )}
            </section>
            <section>
              <SectionTitle as="h3" title="부서별 조치 현황" />
              <div className="krds-table-wrap list-table">
                <table className="tbl col data">
                  <caption>부서별 조치 현황</caption>
                  <thead><tr><th scope="col">담당 부서</th>{STATES.map((s) => <th key={s} scope="col" className="num">{s}</th>)}</tr></thead>
                  <tbody>{cur.depts.map((d) => <tr key={d.dept}><th scope="row">{d.dept}</th>{d.by.map((n, i) => <td key={i} className="num">{n}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </section>
            <section>
              <SectionTitle as="h3" title="미조치 목록(위험도순)" sub={`${cur.openList.length}건${cur.openList.length > OPEN_SHOWN ? ` 중 상위 ${OPEN_SHOWN}건 (전체는 엑셀)` : ''}`} />
              <div className="krds-table-wrap list-table">
                <table className="tbl col data">
                  <caption>미조치 목록</caption>
                  <thead><tr><th scope="col">위치</th><th scope="col">판정</th><th scope="col" className="num">위험도</th><th scope="col">처리 유형</th><th scope="col">담당 부서</th><th scope="col">처리 상태</th><th scope="col">촬영</th></tr></thead>
                  <tbody>{cur.openList.length ? cur.openList.slice(0, OPEN_SHOWN).map((o) => (
                    <tr key={o.id}><td>{o.place}</td><td><PassDot pass={effPass(o)} /></td><td className="num">{o.risk ?? '—'}</td><td>{[...new Set(o.routes.map((x) => routeName(x.type)))].join(', ')}</td><td>{o.dept}</td><td>{o.action}</td><td>{fmtTime(o.t)}</td></tr>
                  )) : <tr><td colSpan={7} className="small">미조치 건이 없습니다.</td></tr>}</tbody>
                </table>
              </div>
            </section>
          </section>

          <section className="report-sec">
            <SectionTitle title="5. AI 분석 결과와 유의 사항" />
            <dl className="report-ai">
              {cur.judge.map(([p, n]) => (
                <div key={p}><dt><PassDot pass={p} /></dt><dd><b>{n}</b>건 <span>{pct(n, cur.total)}</span></dd></div>
              ))}
            </dl>
            <p className="report-lead">
              AI가 사진만으로 판단하지 못한 판단 유보는 {cur.hold}건({pct(cur.hold, cur.total)})이며 담당자가 직접 판정합니다.
              {cur.reviewed > 0
                ? ` 담당자가 검수한 ${cur.reviewed}건 중 AI 판정을 그대로 확인한 것이 ${cur.confirmed}건, 고친 것이 ${cur.corrected}건입니다.`
                : ' 이 기간에 담당자가 검수한 건은 없습니다.'}
            </p>
            <ul className="report-notes">
              <li>판정·위험도·점유율은 사진을 AI로 분석한 값으로, 현장 확인 전 참고 자료입니다.</li>
              <li>위험도 기준값은 현장 보정 전 임시값이며, 판정 구간(단절·좁아짐) 안에서 순서를 매기는 데 씁니다.</li>
              <li>위험 해소율·조치 완료까지 걸린 시간은 조치 뒤 다시 관측한 자료가 쌓이면 함께 보고합니다.</li>
            </ul>
          </section>
        </>}
      </article>
    </section>
  );
}

/** 비율 글자 (분모가 0이면 —) */
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
/** 시간 → '40분', '5시간', '1.5일' */
const fmtHours = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))}분` : h < 48 ? `${Math.round(h)}시간` : `${Math.round((h / 24) * 10) / 10}일`);

/** 처리 단계 막대: 처리 대상이 어느 단계에 몇 건(몇 %) 있는지 한 줄로 */
function StageBar({ stages, total }: { stages: readonly (readonly [string, number])[]; total: number }) {
  return (
    <div className="stage">
      <div className="stage-bar" role="img" aria-label={stages.map(([st, n]) => `${st} ${n}건`).join(', ')}>
        {total ? stages.map(([st, n], i) => n > 0 && <i key={st} className={`st-${i}`} style={{ flexGrow: n }} />) : null}
      </div>
      <ul className="stage-legend">
        {stages.map(([st, n], i) => <li key={st}><i className={`st-${i}`} aria-hidden="true" />{st} <b>{n}건</b> <span>{pct(n, total)}</span></li>)}
      </ul>
    </div>
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
