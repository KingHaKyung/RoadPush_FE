import { useCallback, useState } from 'react';
import { COND_LABEL, DEMO_NOW, PASS, SORT_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { compareObs, matchesQuery } from '../lib/segments';
import { dayDelta, trend } from '../lib/stats';
import type { Condition, Filters, Observation, ObservationPatch, Pass, SortKey } from '../types';
import { KpiCard, SectionTitle } from './Dashboard';
import { EmptyState } from './EmptyState';
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
  // 첫 분석이 안 끝난 관측은 판단 유보가 아니라 관측 목록에서 '분석 중'으로 본다
  const all = obs.filter((o) => o.pass === 'hold' && !o.analyzing && matchesQuery(o, f.q)).sort(cmp);
  const allOpen = all.filter((o) => !o.human);
  /** 지표 카드로 거르기: 검수 대기만 · 검수 완료만 · 재분석 요청만 (다시 누르면 해제) */
  const [view, setView] = useState<'' | 'open' | 'done' | 're'>('');
  const pickView = (v: 'open' | 'done' | 're') => setView((cur) => (cur === v ? '' : v));
  const hold = cond ? all.filter((o) => o.cond === cond) : all;
  const open = view === 'done' ? [] : hold.filter((o) => !o.human && (view !== 're' || o.reanalyze));
  const done = view === '' || view === 'done' ? hold.filter((o) => o.human) : [];

  // 지표 카드 (검색어까지만 반영, 사유 선택과는 무관)
  const waitPred = (o: Observation) => o.pass === 'hold' && !o.analyzing && !o.human && matchesQuery(o, f.q);
  // 기다린 시간은 촬영 시각이 아니라 접수 시각부터 (앨범의 며칠 전 사진이 오래 기다린 것처럼 보이지 않게). 없으면 촬영 시각
  const since = (o: Observation) => new Date(o.received ?? o.t).getTime();
  const oldest = allOpen.reduce<Observation | null>((a, o) => (!a || since(o) < since(a) ? o : a), null);
  const waitH = oldest ? Math.max(0, Math.floor((DEMO_NOW.getTime() - since(oldest)) / 36e5)) : 0;
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
      {/* 판정 셋은 붙인 한 묶음(고르는 것), 재분석 요청은 떨어진 글자 버튼(다른 일)으로 모양부터 나눈다 */}
      <div className="judge-group" role="group" aria-label="사람 판정">
        {(['passable', 'narrowed', 'blocked'] as Pass[]).map((p) => (
          <button key={p} type="button" className={`judge judge-${p}`}
            onClick={() => { onUpdate(o.id, { human: p, review: '수정' }, `사람 판정: ${PASS[p].label}`); toast(`'${PASS[p].label}'(으)로 판정했습니다`); }}>
            {PASS[p].label}
          </button>
        ))}
      </div>
      <button type="button" className="krds-btn small text reanalyze" onClick={() => { onUpdate(o.id, { reanalyze: !o.reanalyze }, o.reanalyze ? '재분석 요청 취소' : '재분석 요청'); toast(o.reanalyze ? '재분석 요청을 취소했습니다' : '재분석을 요청했습니다'); }}>
        {o.reanalyze ? '재분석 대기 중' : '재분석 요청'}
      </button>
    </div>
  );

  const card = (o: Observation) => (
    // 카드를 누르면 큰 창 (버튼을 누른 경우는 제외)
    <article key={o.id} className={`hcard${o.human ? ' done' : ''}`} onClick={(e) => !(e.target as HTMLElement).closest('button') && setOpenId(o.id)}>
      {/* 왼쪽 사진(모든 카드 같은 크기), 오른쪽 글. 판정 버튼은 아래 한 줄 */}
      <button type="button" className="frame hframe-btn" aria-label={`${o.place} 크게 보기`} onClick={() => setOpenId(o.id)}>
        <FrameView o={o} overlay={false} thumb /><span className="hzoom">크게 보기</span>
      </button>
      <div className="hbody">
        {/* 검수 대기 카드는 모두 판단 유보라 배지를 빼고, 검수 완료는 사람 판정을 배지로 */}
        <div className="hhead"><h3>{o.place}</h3>{o.human && <Pill pass={o.human} />}</div>
        {/* 위험 지도 '우선 점검 지점'과 같은 정보 줄 */}
        <span className="sub">{o.area && <span>{o.area}</span>}<span>{SRC_LABEL[o.src]} {o.dev}</span><span>{fmtTime(o.t)}</span></span>
        <div className="reason">{o.reason}</div>
      </div>
      {actions(o)}
    </article>
  );
  const opened = openId ? all.find((o) => o.id === openId) : undefined;

  return (
    <section id="v-hold" className="page">
      <h1 className="vh" tabIndex={-1}>판단 유보 검수 · 검수 대기 {open.length}건</h1>
      <div className="kpis">
        <KpiCard hero label="검수 대기" unit="건" value={allOpen.length} delta={dayDelta(obs, f, waitPred)} values={trend(obs, f, waitPred)} active={view === 'open'} onClick={() => pickView('open')} />
        <KpiCard label="검수 완료" unit="건" value={all.length - allOpen.length} active={view === 'done'} onClick={() => pickView('done')} />
        <KpiCard label="재분석 요청" unit="건" value={allOpen.filter((o) => o.reanalyze).length} active={view === 're'} onClick={() => pickView('re')} />
        {/* 가장 오래 기다린 건: 거르기 대신 그 건의 검수 창을 바로 연다 */}
        <KpiCard label="가장 오래 기다린 건" unit={oldest ? '시간' : undefined} value={oldest ? waitH : '—'} note={oldest?.place} onClick={oldest ? () => setOpenId(oldest.id) : undefined} />
      </div>
      {/* 한 줄: 관측 목록처럼 검색·정렬을 왼쪽에, 그 옆에 유보 사유로 거르기 (휴대폰은 두 줄) */}
      <div className="card hold-bar">
        <div className="hb-tools">
          <label className="vh" htmlFor="hq">검색</label>
          <input className="krds-input small" id="hq" type="search" placeholder="위치·행정구역·장비·관측 ID" value={f.q} onChange={(e) => setFilters({ ...f, q: e.target.value })} />
          <label className="vh" htmlFor="hs">정렬</label>
          <select className="krds-form-select-sort small" id="hs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </div>
        <h2 className="hr-title">유보 사유</h2>
        {reasons.length ? (
          // 기간 선택과 같은 구간 선택: 전체 또는 사유 하나
          <div className="seg" role="radiogroup" aria-label="유보 사유로 거르기">
            {[{ key: '' as const, label: '전체', n: allOpen.length }, ...reasons].map((r) => (
              <button key={r.key || 'all'} type="button" role="radio" aria-checked={cond === r.key} onClick={() => setCond(r.key)}>
                {r.label}<b>{r.n}</b>
              </button>
            ))}
          </div>
        ) : <p className="small">검수 대기 중인 건이 없습니다.</p>}
      </div>
      {view !== 'done' && <>
        <SectionTitle title={view === 're' ? '재분석 요청' : '검수 대기'} sub={`${open.length}건`} />
        <div className="holdgrid">{open.length ? open.map(card) : f.q.trim() ? (
          <EmptyState kind="search" title={`'${f.q.trim()}'에 맞는 판단 유보 건이 없습니다`} desc="위치·행정구역·장비 이름이나 관측 ID로 찾아보세요."
            action={{ label: '검색어 지우기', onClick: () => setFilters({ ...f, q: '' }) }} />
        ) : cond ? (
          <EmptyState kind="review" title={`'${COND_LABEL[cond]}' 사유로 남은 건이 없습니다`} action={{ label: '사유 선택 해제', onClick: () => setCond('') }} />
        ) : view === 're' ? (
          <EmptyState kind="review" title="재분석을 요청한 건이 없습니다" desc="검수 카드에서 '재분석 요청'을 누르면 여기에 모입니다." action={{ label: '검수 대기 전체 보기', onClick: () => setView('') }} />
        ) : (
          <EmptyState kind="review" title="검수할 판단 유보 건이 없습니다" desc="AI가 사진만으로 판정하지 못한 관측이 들어오면 여기에 모입니다." />
        )}</div>
      </>}
      {(done.length > 0 || view === 'done') && <>
        <SectionTitle title="검수 완료" sub={`${done.length}건`} />
        <div className="holdgrid">{done.length ? done.map(card) : <p className="small">아직 검수를 마친 건이 없습니다.</p>}</div>
      </>}
      <Modal open={!!opened} label={opened ? `${opened.place} 판단 유보 검수` : '판단 유보 검수'} onClose={closeModal}>
        {opened && <ObservationDetail key={opened.id} o={opened} layout="wide" onUpdate={(p, l) => onUpdate(opened.id, p, l)}
          extra={<div className="hold-judge"><h4 className="sec">사람 판정</h4>{actions(opened)}</div>} />}
      </Modal>
    </section>
  );
}
