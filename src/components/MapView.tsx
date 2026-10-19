import { useCallback, useEffect, useMemo, useState } from 'react';
import { SEGMENTS, NODES } from '../data/nodelink';
import { ACTIONS, PASS, PASS_KEYS, RANK, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { loadIndex } from '../lib/nodelinkTiles';
import { effPass, inPeriod, nodeName, segById, segLatest, segShown } from '../lib/segments';
import type { Action, Filters, Observation, ObservationPatch, Pass, Source } from '../types';
import { RiskMap } from './map/RiskMap';
import type { SegStatus } from './map/types';
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

export function MapView({ obs, filters: f, setFilters, selSeg, selObs, focusKey, selectSeg, setSelObs, onUpdate }: Props) {
  const [national, setNational] = useState<{ links: number; nodes: number } | null>(null);
  useEffect(() => { loadIndex().then(setNational); }, []);
  const observedSegs = useMemo(() => SEGMENTS.filter((sg) => obs.some((o) => o.seg === sg.id)), [obs]);
  const rows = useMemo(() => observedSegs.map((sg) => ({ sg, o: segLatest(sg, obs, f) })), [observedSegs, obs, f]);
  const cnt = (p: Pass) => rows.filter((r) => r.o && effPass(r.o) === p).length;
  const live = rows.filter((r) => r.o && effPass(r.o) !== 'passable' && r.o.action !== '조치 완료');

  const statusOf = useCallback((segId: string): SegStatus => {
    const sg = segById.get(segId)!;
    const o = segLatest(sg, obs, f);
    return o ? { pass: effPass(o), shown: segShown(sg, obs, f) } : null;
  }, [obs, f]);

  const toggle = <K extends 'pass' | 'act' | 'src'>(key: K, v: string, on: boolean) => {
    const s = new Set(f[key] as Set<string>);
    on ? s.add(v) : s.delete(v);
    setFilters({ ...f, [key]: s });
  };
  const chk = (key: 'pass' | 'act' | 'src', v: string, label: string, n: number) => (
    <label className="chk" key={v}>
      <input type="checkbox" checked={(f[key] as Set<string>).has(v)} onChange={(e) => toggle(key, v, e.target.checked)} />
      {label}<span className="cnt">{n}</span>
    </label>
  );

  const queue = rows.filter((r) => r.o && segShown(r.sg, obs, f) && effPass(r.o) !== 'passable' && r.o.action !== '조치 완료')
    .sort((a, b) => (b.o!.risk ?? 50) - (a.o!.risk ?? 50));

  const sg = selSeg ? segById.get(selSeg) : undefined;
  const list = sg ? obs.filter((o) => o.seg === sg.id).sort((a, b) => b.t.localeCompare(a.t)) : [];
  const cur = list.find((o) => o.id === selObs) ?? list[0];
  let trend: JSX.Element | null = null;
  if (list.length > 1) {
    const a = RANK_ORDER[effPass(list[1])], b = RANK_ORDER[effPass(list[0])];
    if (a >= 0 && b >= 0) trend = b < a ? <span className="trend good">이전 관측보다 개선</span> : b > a ? <span className="trend bad">이전 관측보다 악화</span> : <span className="trend">이전 관측과 같음</span>;
  }
  const shownCount = observedSegs.filter((s) => segShown(s, obs, f)).length;

  return (
    <section id="v-map" aria-label="위험 지도">
      <div className="filters">
        <div className="fgroup">
          <h2>구간 현황 <span className="small">관측 구간 {observedSegs.length}</span></h2>
          <div className="sum">
            <div><span>단절 구간</span><b className="r">{cnt('blocked')}</b></div>
            <div><span>좁아짐 구간</span><b>{cnt('narrowed')}</b></div>
            <div><span>미처리 위험</span><b className="r">{live.filter((r) => r.o!.action === '미처리').length}</b></div>
            <div><span>판단 유보</span><b>{cnt('hold')}</b></div>
          </div>
        </div>
        <div className="fgroup"><h2>기간</h2><PeriodToggle value={f.period} onChange={(period) => setFilters({ ...f, period })} /></div>
        <div className="fgroup"><h2>구간 판정 <span className="small">최신 관측 기준</span></h2>{PASS_KEYS.map((p) => chk('pass', p, PASS[p].label, cnt(p)))}</div>
        <div className="fgroup"><h2>처리 상태</h2>{ACTIONS.map((a: Action) => chk('act', a, a, rows.filter((r) => r.o?.action === a).length))}</div>
        <div className="fgroup"><h2>수집 경로</h2>{(['cctv', 'car'] as Source[]).map((s) => chk('src', s, s === 'car' ? '불법주정차 단속차량' : 'CCTV', obs.filter((o) => o.src === s && inPeriod(o, f.period)).length))}</div>
      </div>

      <div className="mapwrap">
        <RiskMap statusOf={statusOf} selected={selSeg} onSelect={(id) => selectSeg(id)} focusKey={focusKey} />
        <div className="maptools"><div className="box">{PASS_KEYS.map((p) => <Pill key={p} pass={p} />)}<span className="small">흰 도로: 관측 없는 링크</span></div></div>
        <div className="mapfoot">국토교통부 표준노드링크(2026-10-14) · {national ? `전국 링크 ${national.links.toLocaleString()} · 노드 ${national.nodes.toLocaleString()}` : `링크 ${SEGMENTS.length} · 노드 ${Object.keys(NODES).length}`} · 관측 구간 {shownCount}</div>
      </div>

      <div className="side">
        {!sg ? (
          <div className="queue">
            <h2>우선 점검 구간 <span className="small">{queue.length}구간 · 위험도 순</span></h2>
            {queue.length ? queue.map((r, i) => (
              <button key={r.sg.id} type="button" className="qitem" onClick={() => selectSeg(r.sg.id, true)}>
                <span className="rk">{i + 1}</span><span className="pl">{r.sg.road}</span><Pill pass={effPass(r.o!)} />
                <span className="sub">{nodeName(r.sg.a)} → {nodeName(r.sg.b)} · {r.sg.len}m · {r.o!.risk == null ? '점수 없음' : `${r.o!.risk}점`} · {r.o!.action}</span>
              </button>
            )) : <p className="small">조건에 맞는 구간이 없습니다.</p>}
          </div>
        ) : (
          <>
            <button type="button" className="back" onClick={() => selectSeg(null)}>← 우선 점검 구간</button>
            <div className="dh">
              <div className="rowx"><h3>{sg.road}</h3><Pill pass={list.length ? effPass(list[0]) : 'none'} /></div>
              <div className="meta"><span>{nodeName(sg.a)} → {nodeName(sg.b)}</span></div>
            </div>
            <dl className="facts">
              <dt>링크 ID</dt><dd>{sg.id}</dd><dt>길이</dt><dd>{sg.len}m</dd>
              <dt>차로 · 제한속도</dt><dd>{sg.lanes}차로 · {sg.spd}km/h</dd>
              <dt>도로 등급</dt><dd>{RANK[sg.rank] ?? sg.rank}</dd>
              <dt>노드</dt><dd className="small">{sg.a} → {sg.b}</dd>
            </dl>
            {!cur ? <p className="small">이 링크에는 아직 수집된 관측이 없습니다. CCTV 화각 밖이거나 단속차량이 지나가지 않은 구간입니다.</p> : (
              <>
                {list.length > 1 && (
                  <div className="obslist">
                    <div className="rowx"><h4 className="sec">구간 관측 {list.length}건</h4>{trend}</div>
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
            )}
          </>
        )}
      </div>
    </section>
  );
}
