import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACTIONS, DEPTS, OPEN_ACTIONS, CL_KIND, CL_PAVE, PASS, PASS_KEYS, PIN_COLOR, RANK, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { siteCounts, type KpiKey } from '../lib/stats';
import { compareObs, effPass, inPeriod, nodeName, pinKey, pinsOf, segById } from '../lib/segments';
import type { Action, Filters, Observation, ObservationPatch, Pass, Pin, SortKey, Source } from '../types';
import { AreaBars, SectionTitle, Stat } from './Dashboard';
import { RiskMap } from './map/RiskMap';
import { Modal } from './Modal';
import { CCTV_ROADS, loadCctvs, type Cctv, type CctvRoad } from '../lib/cctv';
import { CctvPlayer } from './CctvPlayer';
import { ObservationDetail } from './ObservationDetail';
import { PeriodToggle } from './PeriodToggle';
import { Pill } from './Pill';

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
const KPIS: [KpiKey, string, 'danger' | 'warning' | undefined][] = [['blocked', '단절', 'danger'], ['narrowed', '좁아짐', 'warning'], ['open', '미처리 위험', 'danger'], ['hold', '판단 유보', undefined]];
const FILTER_KEY = 'roadpush.filters';
const readFilterOpen = () => { try { return localStorage.getItem(FILTER_KEY) !== 'off'; } catch { return true; } };

export function MapView({ obs, filters: f, setFilters, selSeg, selObs, focusKey, selectSeg, setSelObs, onUpdate }: Props) {
  /** 우선 점검 지점 정렬 (관측 목록과 따로, 기본은 위험도순) */
  const [qSort, setQSort] = useState<SortKey>('risk');
  /** 목록에서 마우스를 올리거나 키보드로 고른 지점 (지도에서 강조) */
  const [hoverPin, setHoverPin] = useState<string | null>(null);
  /** 교통 CCTV(UTIC) 표시 · 영상 보는 CCTV */
  const [cctvRoads, setCctvRoads] = useState<CctvRoad[]>(CCTV_ROADS);
  const [cctv, setCctv] = useState<Cctv | null>(null);
  const [cctvList, setCctvList] = useState<Cctv[]>([]);
  useEffect(() => { loadCctvs().then(setCctvList); }, []);
  const closeCctv = useCallback(() => setCctv(null), []);
  const [filterOpen, setFilterOpen] = useState(readFilterOpen);
  const showFilters = (on: boolean) => {
    setFilterOpen(on);
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
  const chk = (key: 'pass' | 'act' | 'src', v: string, label: string, n: number, dot?: string) => (
    // KRDS 체크박스: input + label 형제 구조
    <div className="krds-form-check fcheck" key={v}>
      <input type="checkbox" id={`f-${key}-${v}`} checked={(f[key] as Set<string>).has(v)} onChange={(e) => toggle(key, v, e.target.checked)} />
      <label htmlFor={`f-${key}-${v}`} className={n ? undefined : 'zero'}>{dot && <i className="fdot" style={{ background: dot }} aria-hidden="true" />}{label}<span className="cnt">{n}</span></label>
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

  const obsList = cur && (
    <>
      {list.length > 1 && (
        <div className="obslist">
          <div className="rowx"><h4 className="sec">{site ? '이 지점' : '이 링크'} 관측 {list.length}건</h4>{trend}</div>
          {list.map((o) => (
            <button key={o.id} type="button" className={`orow${o === cur ? ' on' : ''}`} onClick={() => setSelObs(o.id)}>
              <Pill pass={effPass(o)} /><span>{fmtTime(o.t)}</span><span className="small">{SRC_LABEL[o.src]} {o.dev}</span>
            </button>
          ))}
        </div>
      )}
      <div className="divider" />
      <ObservationDetail key={cur.id} o={cur} onUpdate={(p, l) => onUpdate(cur.id, p, l)} />
    </>
  );

  return (
    <section id="v-map" className={filterOpen ? undefined : 'nofilter'} aria-label="위험 지도">
      {/* 화면 제목 (보이지 않게, 화면 전환 시 포커스가 여기로) */}
      <h1 className="vh" tabIndex={-1}>위험 지도</h1>
      {sites.length ? (
        <div className="stats" aria-label="지점 현황">
          {KPIS.map(([k, label, tone]) => <Stat key={k} label={label} unit="곳" tone={tone} value={sites.filter((x) => siteCounts(k, x)).length} />)}
        </div>
      ) : (
        <p className="stats empty">이 기간에 수집된 관측이 없습니다</p>
      )}

      {filterOpen && <div className="filters">
        <div className="rowx">
          <SectionTitle title="필터" sub={`${sites.length}곳`} />
          <button type="button" className="krds-btn xsmall text" onClick={() => showFilters(false)}>접기</button>
        </div>
        <div className="fgroup"><h2>기간</h2><PeriodToggle value={f.period} onChange={(period) => setFilters({ ...f, period })} /></div>
        <div className="fgroup"><h2>판정</h2>{PASS_KEYS.map((p) => chk('pass', p, PASS[p].label, cnt(p), PIN_COLOR[p].fill))}</div>
        <div className="fgroup"><h2>처리 상태</h2>{ACTIONS.map((a: Action) => chk('act', a, a, sites.filter((s) => s.obs.action === a).length))}</div>
        <div className="fgroup">
          <h2><label htmlFor="f-dept">담당 부서</label></h2>
          <select className="krds-form-select small" id="f-dept" value={f.dept} onChange={(e) => setFilters({ ...f, dept: e.target.value })}>
            <option value="">전체 부서</option>{DEPTS.filter((d) => d !== '미배정').map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="fgroup"><h2>수집 경로</h2>{(['cctv', 'car', 'upload'] as Source[]).map((s) => chk('src', s, s === 'car' ? '불법주정차 단속차량' : SRC_LABEL[s], obs.filter((o) => o.src === s && inPeriod(o, f.period)).length))}</div>
        {cctvList.length > 0 && (
          <div className="fgroup">
            <h2>교통 CCTV</h2>
            {CCTV_ROADS.map((r) => {
              const n = cctvList.filter((c) => c.road === r).length;
              if (!n) return null;
              return (
                <div key={r} className="krds-form-check fcheck">
                  <input type="checkbox" id={`f-cctv-${r}`} checked={cctvRoads.includes(r)}
                    onChange={(e) => setCctvRoads(e.target.checked ? [...cctvRoads, r] : cctvRoads.filter((x) => x !== r))} />
                  <label htmlFor={`f-cctv-${r}`}><i className="fdot cam" aria-hidden="true" />{r}<span className="cnt">{n}</span></label>
                </div>
              );
            })}
          </div>
        )}
        {sites.length > 0 && (
          <div className="fgroup">
            <h2>행정구역</h2>
            <AreaBars sites={sites} active={f.q.trim()} onPick={(a) => setFilters({ ...f, q: a })} />
          </div>
        )}
      </div>}

      <div className="mapwrap">
        <RiskMap pins={pins} selectedPin={site} hoverPin={hoverPin} cctvRoads={cctvRoads} onPickCctv={setCctv} onPickPin={(p) => { setHoverPin(null); pickPin(p); }} selected={selSeg} onSelect={(id) => selectSeg(id)} focusKey={focusKey} />
        <div className="maptools">
          {!filterOpen && <button type="button" className="krds-btn xsmall secondary" onClick={() => showFilters(true)}>필터</button>}
          <div className="box map-legend">
            {PASS_KEYS.map((p) => <span key={p}><i style={{ ['--c' as string]: PIN_COLOR[p].fill }} />{PASS[p].label}</span>)}
          </div>
        </div>
      </div>

      <div className="side">
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
            {queue.length ? queue.map((p, i) => (
              <button key={p.key} type="button" className="qitem" style={{ ['--c' as string]: PIN_COLOR[p.pass].fill }} onClick={() => { setHoverPin(null); pickPin(p, true); }}
                onMouseEnter={() => setHoverPin(p.key)} onMouseLeave={() => setHoverPin(null)} onFocus={() => setHoverPin(p.key)} onBlur={() => setHoverPin(null)}>
                <span className="rk">{i + 1}</span>
                <span className="pl">{p.obs.place}</span>
                <span className={`qscore${(p.obs.risk ?? 0) >= 80 ? ' hi' : ''}`}><span className="vh">위험도 </span>{p.obs.risk ?? '–'}</span>
                <span className="sub">
                  <b className={`t-${p.pass}`}>{PASS[p.pass].label}</b>
                  {p.obs.area && ` · ${p.obs.area.split(' ').pop()}`} · {fmtTime(p.obs.t)}
                  {p.obs.action !== '미처리' && ` · ${p.obs.action}`}
                  {p.obs.persist?.kind === '상습' && ` · 상습 ${p.obs.persist.n}회`}
                </span>
              </button>
            )) : <p className="small">{f.q.trim() ? `'${f.q.trim()}'에 맞는 지점 없음` : '점검할 지점 없음'}</p>}
          </div>
        ) : site && cur ? (
          <>
            <button type="button" className="krds-btn small text back" onClick={() => selectSeg(null)}>← 우선 점검 지점</button>
            {/* 지점 정보(위치·장비·주소·가까운 도로)는 아래 관측 상세 머리에 함께 나온다 */}
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
            {cur ? obsList : !sg.cl && <p className="small">수집된 관측 없음</p>}
          </>
        ) : null}
      </div>
      {/* 교통 CCTV 실시간 영상: ITS는 HLS, UTIC는 재생 페이지 (등록한 IP 대역에서만 재생) */}
      <Modal open={!!cctv} size="xl" label={cctv ? `교통 CCTV ${cctv.name} 실시간 영상` : '교통 CCTV'} onClose={closeCctv}>
        {cctv && (
          <div className="cctv-view">
            <div className="dh">
              <h3>{cctv.name}</h3>
              <div className="meta">{cctv.center && <span>{cctv.center}</span>}<span>{cctv.road}</span></div>
            </div>
            <CctvPlayer cctv={cctv} />
            <p className="small">{cctv.src === 'its' ? '출처: 국가교통정보센터(ITS)' : '출처: 도시교통정보센터(UTIC) · 등록 IP에서만 재생, 최대 60초'}</p>
          </div>
        )}
      </Modal>
    </section>
  );
}
