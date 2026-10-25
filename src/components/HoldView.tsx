import { useCallback, useState } from 'react';
import { COND_LABEL, DEMO_NOW, PASS, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { compareObs, matchesQuery } from '../lib/segments';
import { dayDelta, trend } from '../lib/stats';
import type { Condition, Filters, Observation, ObservationPatch, Pass, SortKey } from '../types';
import { CountBars, KpiCard, SectionTitle } from './Dashboard';
import { FrameView } from './FrameView';
import { Modal } from './Modal';
import { ObservationDetail } from './ObservationDetail';
import { Pill } from './Pill';

interface Props {
  obs: Observation[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  onUpdate: (id: string, patch: ObservationPatch, log?: string) => void;
  toast: (m: string) => void;
}

export function HoldView({ obs, filters: f, setFilters, onUpdate, toast }: Props) {
  /** 정렬은 화면마다 따로 (검색어는 관측 목록·위험 지도와 함께 쓴다) */
  const [sort, setSort] = useState<SortKey>('time');
  const cmp = compareObs(sort);
  /** 유보 사유로 거르기 (사유 막대를 눌러 고른다) */
  const [cond, setCond] = useState<Condition | ''>('');
  /** 크게 보는 관측 */
  const [openId, setOpenId] = useState<string | null>(null);
  const closeModal = useCallback(() => setOpenId(null), []);
  const all = obs.filter((o) => o.pass === 'hold' && matchesQuery(o, f.q)).sort(cmp);
  const allOpen = all.filter((o) => !o.human);
  const hold = cond ? all.filter((o) => o.cond === cond) : all;
  const open = hold.filter((o) => !o.human);
  const done = hold.filter((o) => o.human);

  // 지표 카드 (검색어까지만 반영, 사유 선택과는 무관)
  const waitPred = (o: Observation) => o.pass === 'hold' && !o.human && matchesQuery(o, f.q);
  const oldest = allOpen.reduce<Observation | null>((a, o) => (!a || o.t < a.t ? o : a), null);
  const waitH = oldest ? Math.floor((DEMO_NOW.getTime() - new Date(oldest.t).getTime()) / 36e5) : 0;
  const reasons = (Object.keys(COND_LABEL) as Condition[]).map((k) => ({ key: k, label: COND_LABEL[k], n: allOpen.filter((o) => o.cond === k).length }))
    .filter((r) => r.n > 0).sort((a, b) => b.n - a.n);

  /** 사람 판정 버튼 (카드와 큰 창에서 같이 쓴다) */
  const actions = (o: Observation) => o.human ? (
    <div className="rowx">
      <span className="small">사람 판정 완료</span>
      <button type="button" className="krds-btn small tertiary" onClick={() => { onUpdate(o.id, { human: null, review: '미검수' }, '사람 판정 취소'); toast('판정을 취소했습니다'); }}>판정 취소</button>
    </div>
  ) : (
    <div className="hacts">
      {(['passable', 'narrowed', 'blocked'] as Pass[]).map((p) => (
        <button key={p} type="button" className="krds-btn small secondary"
          onClick={() => { onUpdate(o.id, { human: p, review: '수정' }, `사람 판정: ${PASS[p].label}`); toast(`'${PASS[p].label}'(으)로 판정했습니다`); }}>
          {PASS[p].label}
        </button>
      ))}
      <button type="button" className="krds-btn small tertiary" onClick={() => { onUpdate(o.id, { reanalyze: !o.reanalyze }, o.reanalyze ? '재분석 요청 취소' : '재분석 요청'); toast(o.reanalyze ? '재분석 요청을 취소했습니다' : '재분석을 요청했습니다'); }}>
        {o.reanalyze ? '재분석 대기 중' : '재분석 요청'}
      </button>
    </div>
  );

  const card = (o: Observation) => (
    // 카드를 누르면 큰 창 (버튼을 누른 경우는 제외)
    <article key={o.id} className={`hcard${o.human ? ' done' : ''}`} onClick={(e) => !(e.target as HTMLElement).closest('button') && setOpenId(o.id)}>
      {/* 검수 대기 카드는 모두 판단 유보라 배지를 빼고, 검수 완료는 사람 판정을 배지로 */}
      <div className="hhead"><h3>{o.place}</h3>{o.human && <Pill pass={o.human} />}</div>
      {/* 위험 지도 '우선 점검 지점'과 같은 정보 줄 */}
      <span className="sub">{o.area && <>{o.area} · </>}{SRC_LABEL[o.src]} {o.dev} · {fmtTime(o.t)}</span>
      <button type="button" className="frame hframe-btn" aria-label={`${o.place} 크게 보기`} onClick={() => setOpenId(o.id)}>
        <FrameView o={o} overlay={false} /><span className="hzoom">크게 보기</span>
      </button>
      <div className="reason">{o.reason}</div>
      {actions(o)}
    </article>
  );
  const opened = openId ? all.find((o) => o.id === openId) : undefined;

  return (
    <section id="v-hold" className="page">
      <h1 className="vh" tabIndex={-1}>판단 유보 검수 · 검수 대기 {open.length}건</h1>
      <div className="kpis">
        <KpiCard hero label="검수 대기" unit="건" value={allOpen.length} delta={dayDelta(obs, f, waitPred)} values={trend(obs, f, waitPred)} />
        <KpiCard label="검수 완료" unit="건" value={all.length - allOpen.length} />
        <KpiCard label="재분석 요청" unit="건" value={allOpen.filter((o) => o.reanalyze).length} />
        <KpiCard label="가장 오래 기다린 건" unit={oldest ? '시간' : undefined} value={oldest ? waitH : '—'} note={oldest?.place} />
      </div>
      <div className="card hold-reasons">
        <SectionTitle as="h2" title="유보 사유" sub={cond ? COND_LABEL[cond] : undefined} />
        {reasons.length ? <CountBars rows={reasons} active={cond} onPick={setCond} /> : <p className="small">검수 대기 중인 건이 없습니다.</p>}
      </div>
      <div className="toolbar">
        <label className="vh" htmlFor="hq">검색</label>
        <input className="krds-input small" id="hq" type="search" placeholder="위치·행정구역·장비·관측 ID" value={f.q} style={{ width: 240 }} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
        <label className="vh" htmlFor="hs">정렬</label>
        <select className="krds-form-select-sort small" id="hs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
        </select>
        <span className="grow" />
      </div>
      <SectionTitle title="검수 대기" sub={`${open.length}건`} />
      <div className="holdgrid">{open.length ? open.map(card) : <p className="small">{f.q.trim() ? `'${f.q.trim()}'에 맞는 판단 유보 건이 없습니다.` : '검수할 판단 유보 건이 없습니다.'}</p>}</div>
      {done.length > 0 && <><SectionTitle title="검수 완료" sub={`${done.length}건`} /><div className="holdgrid">{done.map(card)}</div></>}
      <Modal open={!!opened} label={opened ? `${opened.place} 판단 유보 검수` : '판단 유보 검수'} onClose={closeModal}>
        {opened && <ObservationDetail key={opened.id} o={opened} layout="wide" onUpdate={(p, l) => onUpdate(opened.id, p, l)}
          extra={<div className="hold-judge"><h4 className="sec">사람 판정</h4>{actions(opened)}</div>} />}
      </Modal>
    </section>
  );
}
