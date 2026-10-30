import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, DEPTS, OPEN_ACTIONS, CL_KIND, CL_PAVE, PASS, PASS_KEYS, PIN_COLOR, RANK, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { dayDelta, kpiPred, siteCounts, trend as trendOf, type KpiKey } from '../lib/stats';
import { compareObs, effPass, inPeriod, nodeName, pinKey, pinsOf, segById } from '../lib/segments';
import type { Action, Filters, Observation, ObservationPatch, Pass, Pin, SortKey, Source } from '../types';
import { AreaBars, KpiCard, SectionTitle } from './Dashboard';
import { EmptyState } from './EmptyState';
import { RiskMap } from './map/RiskMap';
import { ObservationDetail } from './ObservationDetail';
import { PeriodToggle } from './PeriodToggle';
import { PassDot, Pill } from './Pill';
import { MoreButton } from './MoreButton';
import { TrendIcon } from './RouteBadge';

interface Props {
  obs: Observation[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  selSeg: string | null;
  selObs: string | null;
  focusKey: number;
  selectSeg: (id: string | null, focus?: boolean) => void;
  setSelObs: (id: string | null) => void;
  onUpdate: (id: string, patch: ObservationPatch, log?: string) => void;
}

const RANK_ORDER: Record<Pass, number> = { passable: 0, narrowed: 1, blocked: 2, hold: -1 };
const byTimeDesc = (a: Observation, b: Observation) => b.t.localeCompare(a.t);
/** 첫 칸(미처리 위험)이 대표 카드 */
const KPIS: [KpiKey, string][] = [['open', '미처리 위험 지점'], ['blocked', '단절 지점'], ['narrowed', '좁아짐 지점'], ['hold', '판단 유보']];
/** 카드를 누르면 거는 필터 (판정·처리 상태). act가 null이면 처리 상태 전체 */
const KPI_APPLY: Record<KpiKey, { pass: Pass[]; act: Action[] | null }> = {
  open: { pass: ['blocked', 'narrowed', 'hold'], act: ['미처리'] },
  blocked: { pass: ['blocked'], act: null },
  narrowed: { pass: ['narrowed'], act: null },
  hold: { pass: ['hold'], act: null },
};
const sameSet = <T,>(s: Set<T>, a: T[]) => s.size === a.length && a.every((v) => s.has(v));
const FILTER_KEY = 'roadpush.filters';
/** 휴대폰에서는 필터가 지도 위 시트로 열리므로 늘 닫힌 채 시작하고, 열고 닫은 것도 기억하지 않는다 */
const isPhone = () => window.matchMedia('(max-width:760px)').matches;
const readFilterOpen = () => {
  if (isPhone()) return false;
  try { return localStorage.getItem(FILTER_KEY) !== 'off'; } catch { return true; }
};

/**
 * 오른쪽 패널 너비: 우선 점검 지점(목록)은 400, 지점·관측을 고르면(상세) 1.5배 600.
 * 끌어서 바꾼 너비는 목록·상세 따로 기억한다
 */
const SIDE_KEY = 'roadpush-side-width';
const SIDE_DEFAULT = { list: 400, detail: 600 };
const SIDE_MIN = 320;
/** 패널을 넓혀도 지도는 이만큼은 남긴다 */
const MAP_MIN = 420;
type SideW = typeof SIDE_DEFAULT;
const readSideW = (): SideW => {
  try { return { ...SIDE_DEFAULT, ...JSON.parse(localStorage.getItem(SIDE_KEY) ?? '{}') }; } catch { return SIDE_DEFAULT; }
};

export function MapView({ obs, filters: f, setFilters, selSeg, selObs, focusKey, selectSeg, setSelObs, onUpdate }: Props) {
  /** 우선 점검 지점 정렬 (관측 목록과 따로, 기본은 위험도순) */
  const [qSort, setQSort] = useState<SortKey>('risk');
  /** 우선 점검 지점은 20곳씩 (조건·정렬을 바꾸면 처음부터) */
  const Q_STEP = 20;
  const [qN, setQN] = useState(Q_STEP);
  const qKey = `${f.q}|${f.period}|${f.range.from}|${f.range.to}|${qSort}|${[...f.pass, ...f.act, ...f.src].join()}|${f.dept}`;
  const [lastQKey, setLastQKey] = useState(qKey);
  if (lastQKey !== qKey) { setLastQKey(qKey); setQN(Q_STEP); }
  /** 목록에서 마우스를 올리거나 키보드로 고른 지점 (지도에서 강조) */
  const [hoverPin, setHoverPin] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(readFilterOpen);
  const [sideW, setSideW] = useState<SideW>(readSideW);
  const [resizing, setResizing] = useState(false);
  const sideRef = useRef<HTMLDivElement>(null);
  // 창 크기가 바뀌면 패널 최대 너비(지도 최소 폭)를 다시 계산
  const [, setVw] = useState(0);
  useEffect(() => { const on = () => setVw(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  const showFilters = (on: boolean) => {
    setFilterOpen(on);
    if (isPhone()) return;
    try { localStorage.setItem(FILTER_KEY, on ? 'on' : 'off'); } catch { /* 저장 못 해도 화면은 그대로 */ }
  };

  // 지점 = 같은 좌표의 관측 묶음. sites는 판정·처리 필터와 상관없이 (개수 표시용), pins는 지도에 찍을 것
  const sites = useMemo(() => pinsOf(obs, { ...f, pass: new Set(PASS_KEYS), act: new Set(ACTIONS) }), [obs, f]);
  const pins = useMemo(() => pinsOf(obs, f), [obs, f]);
  const cnt = (p: Pass) => sites.filter((s) => s.pass === p).length;

  const toggle = <K extends 'pass' | 'act' | 'src'>(key: K, v: string, on: boolean) => {
    const s = new Set(f[key] as Set<string>);
    on ? s.add(v) : s.delete(v);
    setFilters({ ...f, [key]: s });
  };
  const chk = (key: 'pass' | 'act' | 'src', v: string, label: string, n: number) => (
    // KRDS 체크박스: input + label 형제 구조
    <div className="krds-form-check fcheck" key={v}>
      <input type="checkbox" id={`f-${key}-${v}`} checked={(f[key] as Set<string>).has(v)} onChange={(e) => toggle(key, v, e.target.checked)} />
      <label htmlFor={`f-${key}-${v}`} className={n ? undefined : 'zero'}>{label}<span className="cnt">{n}</span></label>
    </div>
  );

  const cmp = compareObs(qSort);
  const queue = pins.filter((p) => p.pass !== 'passable' && OPEN_ACTIONS.includes(p.obs.action)).sort((a, b) => cmp(a.obs, b.obs));
  const pickPin = (p: Pin, focus = false) => { selectSeg(p.obs.seg, focus); setSelObs(p.obs.id); };

  // 선택: 관측(핀)을 고르면 그 지점, 도로만 눌렀으면 그 링크
  const selO = selObs ? obs.find((o) => o.id === selObs) : undefined;
  const site = selO ? pinKey(selO) : null;
  const sg = selSeg ? segById.get(selSeg) : undefined;
  const list = site ? obs.filter((o) => pinKey(o) === site).sort(byTimeDesc) : sg ? obs.filter((o) => o.seg === sg.id).sort(byTimeDesc) : [];
  const cur = list.find((o) => o.id === selObs) ?? list[0];
  let trend: JSX.Element | null = null;
  if (list.length > 1) {
    const a = RANK_ORDER[effPass(list[1])], b = RANK_ORDER[effPass(list[0])];
    if (a >= 0 && b >= 0) trend = b < a ? <span className="trend good">이전 관측보다 개선</span> : b > a ? <span className="trend bad">이전 관측보다 악화</span> : <span className="trend">이전 관측과 같음</span>;
  }

  // 같은 지점의 관측 목록: 상단 탭 메뉴로 전환해서 볼 수 있게 한다
  const siteTabs = list.length > 1 && (
    <div className="site-tabs" aria-label="이 지점 관측 목록">
      <div className="site-tabs-head">
        <span className="site-tabs-title"><b>{site ? '이 지점' : '이 링크'} 관측</b><span className="cnt">{list.length}건</span></span>
        {trend}
      </div>
      <div className="krds-tab-area site-tab-area">
        <div className="tab line">
          <ul role="tablist">
            {list.map((o, idx) => {
              const active = o.id === cur.id;
              return (
                <li key={o.id} className={active ? 'active' : undefined}>
                  <button
                    type="button"
                    className="btn-tab"
                    role="tab"
                    aria-selected={active}
                    title={`${fmtTime(o.t)} · ${SRC_LABEL[o.src]} ${o.dev}`}
                    onClick={() => setSelObs(o.id)}
                  >
                    <PassDot pass={effPass(o)} />
                    <span className="tab-time">{fmtTime(o.t)}</span>
                    {idx === 0 && <span className="tab-badge">최신</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
  const obsList = cur && <ObservationDetail key={cur.id} o={cur} onUpdate={(p, l) => onUpdate(cur.id, p, l)} />;

  // 오른쪽 패널: 상세(지점·링크를 골랐을 때)면 넓게
  const mode: keyof SideW = sg || selO ? 'detail' : 'list';
  // 지도가 최소 MAP_MIN은 남게: 화면 폭 - 필터(열려 있으면) - 여백·간격 - 지도 최소 폭
  const sideMax = () => Math.max(SIDE_MIN, Math.min(900, window.innerWidth - (filterOpen ? 272 + 16 : 0) - 48 - MAP_MIN));
  const sideNow = Math.min(sideW[mode], sideMax());
  const setW = (w: number) => setSideW((cur) => {
    const next = { ...cur, [mode]: Math.round(Math.min(sideMax(), Math.max(SIDE_MIN, w))) };
    try { localStorage.setItem(SIDE_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    return next;
  });
  /** 손잡이를 끌면 패널 오른쪽 끝에서 마우스까지가 새 너비 */
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const right = sideRef.current?.getBoundingClientRect().right; if (right == null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
    const move = (ev: PointerEvent) => setW(right - ev.clientX);
    const up = () => { setResizing(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section id="v-map" className={`${filterOpen ? '' : 'nofilter'}${resizing ? ' resizing' : ''}`.trim() || undefined} aria-label="위험 지도"
      style={{ ['--side-w' as string]: `${sideNow}px` }}>
      {/* 화면 제목 (보이지 않게, 화면 전환 시 포커스가 여기로) */}
      <h1 className="vh" tabIndex={-1}>위험 지도</h1>
      <div className="kpis" aria-label="지점 현황">
        {KPIS.map(([k, label], i) => {
          // 누르면 그 카드의 판정·처리 상태로 거르고, 다시 누르면 해제 (관측 목록 카드와 같은 동작)
          const ap = KPI_APPLY[k];
          const active = sameSet(f.pass, ap.pass) && sameSet(f.act, ap.act ?? ACTIONS);
          return (
            <KpiCard key={k} hero={i === 0} label={label} unit="곳" value={sites.filter((x) => siteCounts(k, x)).length}
              tone={k === 'hold' ? 'neutral' : 'risk'} delta={dayDelta(obs, f, kpiPred(k))} values={trendOf(obs, f, kpiPred(k))}
              active={active} onClick={() => setFilters({ ...f, pass: new Set(active ? PASS_KEYS : ap.pass), act: new Set(active ? ACTIONS : ap.act ?? ACTIONS) })} />
          );
        })}
      </div>

      {/* 휴대폰에서만 보이는 시트 바깥 영역: 누르면 닫힌다 */}
      {filterOpen && <button type="button" className="filter-scrim" aria-label="필터 닫기" onClick={() => showFilters(false)} />}
      {filterOpen && <div className="filters">
        <div className="rowx">
          <SectionTitle title="필터" sub={`${sites.length}곳`} />
          <button type="button" className="krds-btn xsmall text" onClick={() => showFilters(false)}>{isPhone() ? '닫기' : '접기'}</button>
        </div>
        <div className="fgroup"><h2>기간</h2><PeriodToggle f={f} onChange={(p) => setFilters({ ...f, ...p })} /></div>
        <div className="fgroup"><h2>판정</h2>{PASS_KEYS.map((p) => chk('pass', p, PASS[p].label, cnt(p)))}</div>
        <div className="fgroup"><h2>처리 상태</h2>{ACTIONS.map((a: Action) => chk('act', a, a, sites.filter((s) => s.obs.action === a).length))}</div>
        <div className="fgroup">
          <h2><label htmlFor="f-dept">담당 부서</label></h2>
          <select className="krds-form-select small" id="f-dept" value={f.dept} onChange={(e) => setFilters({ ...f, dept: e.target.value })}>
            <option value="">전체 부서</option>{DEPTS.filter((d) => d !== '미배정').map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="fgroup"><h2>수집 경로</h2>{(['cctv', 'car', 'upload'] as Source[]).map((s) => chk('src', s, s === 'car' ? '불법주정차 단속차량' : SRC_LABEL[s], obs.filter((o) => o.src === s && inPeriod(o, f)).length))}</div>
        {sites.length > 0 && (
          <div className="fgroup">
            <h2>행정구역</h2>
            <AreaBars sites={sites} active={f.q.trim()} onPick={(a) => setFilters({ ...f, q: a })} />
          </div>
        )}
      </div>}

      <div className="mapwrap">
        <RiskMap pins={pins} selectedPin={site} hoverPin={hoverPin} onPickPin={(p) => { setHoverPin(null); pickPin(p); }} selected={selSeg} onSelect={(id) => selectSeg(id)} focusKey={focusKey} />
        <div className="maptools">
          {!filterOpen && <button type="button" className="krds-btn xsmall secondary" onClick={() => showFilters(true)}>필터</button>}
          <div className="box map-legend">
            {PASS_KEYS.map((p) => <span key={p}><i style={{ ['--c' as string]: PIN_COLOR[p].fill }} />{PASS[p].label}</span>)}
          </div>
        </div>
      </div>

      {/* 패널 너비 조절: 끌기, 또는 포커스 후 ←→ (두 번 누르면 기본 너비) */}
      <div className="side-resizer" role="separator" aria-orientation="vertical" aria-label="오른쪽 패널 너비 조절" tabIndex={0}
        aria-valuenow={sideNow} aria-valuemin={SIDE_MIN} aria-valuemax={sideMax()}
        onPointerDown={startResize} onDoubleClick={() => setW(SIDE_DEFAULT[mode])}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setW(sideNow + (e.key === 'ArrowLeft' ? 40 : -40)); } }} />
      <div className="side" ref={sideRef}>
        {!sg && !selO ? (
          <div className="queue">
            <SectionTitle title="우선 점검 지점" sub={`${queue.length}곳`} />
            <div className="qtools">
              <label className="vh" htmlFor="mq">지점 검색</label>
              <input className="krds-input small" id="mq" type="search" placeholder="위치·행정구역·장비" value={f.q} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
              <label className="vh" htmlFor="ms">정렬</label>
              <select className="krds-form-select-sort small" id="ms" value={qSort} onChange={(e) => setQSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
            </div>
            {queue.length ? queue.slice(0, qN).map((p) => (
              <button key={p.key} type="button" className="qitem" onClick={() => { setHoverPin(null); pickPin(p, true); }}
                onMouseEnter={() => setHoverPin(p.key)} onMouseLeave={() => setHoverPin(null)} onFocus={() => setHoverPin(p.key)} onBlur={() => setHoverPin(null)}>
                {/* 위험도 사각형: 판정 색 옅은 바탕 + 진한 숫자 (판정과 위험도를 한 번에) */}
                <span className={`qscore q-${p.pass}`}><span className="vh">위험도 </span>{p.obs.risk ?? '–'}</span>
                <span className="pl">{p.obs.place}</span>
                <span className="sub">
                  <span className="qpass">{PASS[p.pass].label}</span>
                  {p.obs.area && <span>{p.obs.area.split(' ').pop()}</span>}
                  <span>{fmtTime(p.obs.t)}</span>
                  {p.obs.action !== '미처리' && <span>{p.obs.action}</span>}
                  {p.obs.persist?.kind === '상습' && <span className="hot"><TrendIcon tone="again" />상습 {p.obs.persist.n}회</span>}
                </span>
              </button>
            )) : f.q.trim() ? (
              <EmptyState kind="search" title={`'${f.q.trim()}'에 맞는 지점이 없습니다`} desc="위치·행정구역·장비 이름으로 찾아보세요."
                action={{ label: '검색어 지우기', onClick: () => setFilters({ ...f, q: '' }) }} />
            ) : (
              <EmptyState kind="map" title="지금 점검할 지점이 없습니다" desc="단절·좁아짐·판단 유보 지점 중 처리가 끝나지 않은 곳이 위험도순으로 올라옵니다." />
            )}
            <MoreButton shown={qN} total={queue.length} step={Q_STEP} onMore={() => setQN((n) => n + Q_STEP)} />
          </div>
        ) : site && cur ? (
          <>
            <button type="button" className="krds-btn small text back" onClick={() => selectSeg(null)}>← 우선 점검 지점</button>
            {/* 같은 지점에 관측이 여러 건이면 상단에서 탭 메뉴로 전환 */}
            {siteTabs}
            {obsList}
          </>
        ) : sg ? (
          <>
            <button type="button" className="krds-btn small text back" onClick={() => selectSeg(null)}>← 우선 점검 지점</button>
            <div className="dh">
              <div className="rowx"><h3>{sg.road}</h3><Pill pass={list.length ? effPass(list[0]) : 'none'} /></div>
              <div className="meta"><span>{sg.cl ? '연속수치지형도 도로중심선' : sg.a ? `${nodeName(sg.a)} → ${nodeName(sg.b)}` : '표준노드링크'}</span></div>
            </div>
            {sg.cl ? (
              <>
                <dl className="facts">
                  <dt>종류</dt><dd>{CL_KIND[sg.cl.kind] ?? sg.cl.kind}</dd>
                  <dt>도로폭</dt><dd>{sg.cl.width}m</dd>
                  <dt>차로</dt><dd>{sg.cl.lanes}차로 · {sg.cl.oneway === 'ITH001' ? '일방통행' : '양방통행'}</dd>
                  <dt>포장</dt><dd>{CL_PAVE[sg.cl.pave] ?? '미분류'}</dd>
                  <dt>길이</dt><dd>{sg.len}m</dd>
                  <dt>UFID</dt><dd className="small">{sg.cl.ufid}</dd>
                </dl>
              </>
            ) : (
              <dl className="facts">
                <dt>링크 ID</dt><dd>{sg.id}</dd><dt>길이</dt><dd>{sg.len}m</dd>
                {sg.lanes ? <><dt>차로 · 제한속도</dt><dd>{sg.lanes}차로 · {sg.spd}km/h</dd></> : <><dt>제한속도</dt><dd>{sg.spd}km/h</dd></>}
                {sg.width && <><dt>도로폭</dt><dd>{sg.width}m</dd></>}
                <dt>도로 등급</dt><dd>{RANK[sg.rank] ?? sg.rank}</dd>
                {sg.a && <><dt>노드</dt><dd className="small">{sg.a} → {sg.b}</dd></>}
              </dl>
            )}
            {siteTabs}
            {cur ? obsList : !sg.cl && <p className="small">수집된 관측 없음</p>}
          </>
        ) : null}
      </div>
    </section>
  );
}
