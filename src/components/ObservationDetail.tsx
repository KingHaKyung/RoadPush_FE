import { useId, useState, type ReactNode } from 'react';
import { ACTIONS, DEPTS, NO_DEPT, PASS, RANK, routeName, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { capturedEarlier, effPass, segById } from '../lib/segments';
import { requestText } from '../lib/request';
import type { Action, Observation, ObservationPatch } from '../types';
import { ChipGroup } from './ChipGroup';
import { FrameView } from './FrameView';
import { Pill } from './Pill';
import { TrendBadge } from './RouteBadge';

interface Props {
  o: Observation;
  onUpdate: (patch: ObservationPatch, log?: string) => void;
  /** panel: 오른쪽 패널(세로 한 줄) · wide: 가운데 큰 창(왼쪽 촬영 화면, 오른쪽 정보) */
  layout?: 'panel' | 'wide';
  /** 오른쪽 정보 맨 위에 넣을 내용 (예: 판단 유보 판정 버튼) */
  extra?: ReactNode;
  /** 맨 아래 접어 둘 내용 (예: 같은 지점의 다른 관측) */
  related?: ReactNode;
}

const FP_REASONS = ['차도·배경에 있는 물체', '상시 고정시설', '그림자·반사', '원인 종류가 틀림', '기타'];

/**
 * 관측 상세: 위치·판정 → 사진 → 핵심 숫자 → 처리 순서로 보여 주고,
 * 담당자가 매번 보지 않아도 되는 것(처리 이력·위치 정보)은 맨 아래에 접어 둔다
 */
export function ObservationDetail({ o, onUpdate, layout = 'panel', extra, related }: Props) {
  const [overlay, setOverlay] = useState(true);
  const [memo, setMemo] = useState('');
  const [fpOpen, setFpOpen] = useState(false);
  const uid = useId();
  const road = segById.get(o.seg);
  const addMemo = () => {
    const v = memo.trim();
    if (!v) return;
    onUpdate({}, `메모: ${v}`);
    setMemo('');
  };
  // 원인마다 기본 부서 (둘 이상이면 같은 요청 양식을 모든 부서에 보낸다). 미분류(장애물)는 기본 부서가 없어 뺀다
  const routeDepts = [...new Set(o.routes.map((r) => r.dept))].filter((d) => d !== NO_DEPT);
  // 기존 행정 시스템·메신저에 붙여 넣을 요청 양식을 복사하고 '현장점검 요청'으로 기록. 부서가 비어 있으면 첫 원인의 기본 부서로
  const deliver = () => {
    const dept = o.dept === NO_DEPT ? routeDepts[0] ?? NO_DEPT : o.dept;
    const done = () => onUpdate({ action: '현장점검 요청', ...(dept !== o.dept ? { dept } : {}) }, `요청 양식 복사 · 현장점검 요청 (${[...new Set([dept, ...routeDepts])].join(', ')})`);
    navigator.clipboard?.writeText(requestText(o)).then(done, done);
  };
  const links = [...new Map(o.routes.flatMap((r) => (r.link ? [[r.link.url, r.link] as const] : []))).values()];
  // 오탐: 사람 판정을 '통과 가능'으로 바꾼다. 사유는 검수 기록에 함께 저장된다
  const markFalse = (why: string) => {
    onUpdate({ human: 'passable', review: '수정' }, `오탐 처리: ${why}`);
    setFpOpen(false);
  };
  const hist = [...o.hist].sort((a, b) => b.t.localeCompare(a.t));

  return (
    <div className={`od od-${layout}`}>
      <div className="od-head">
        <div className="rowx"><h3>{o.place}</h3><Pill pass={o.analyzing ? 'analyzing' : effPass(o)} /></div>
        <p className="meta">
          <span>{capturedEarlier(o) ? `접수 ${fmtTime(o.received!)} · 촬영 ${fmtTime(o.t)}` : fmtTime(o.t)}</span><span>{SRC_LABEL[o.src]} {o.dev}</span>
          {o.human && <span>AI 판정 {PASS[o.pass].label} → 사람 판정</span>}
        </p>
      </div>

      <div className="od-view">
        {/* 사진 위 오른쪽에 원본/분석 전환 */}
        <div className="frame od-frame">
          <FrameView o={o} overlay={overlay} />
          <div className="frame-toggle">
            <ChipGroup label="촬영 화면 보기" options={[['raw', '원본'], ['ai', '분석']]} value={overlay ? 'ai' : 'raw'} onChange={(v) => setOverlay(v === 'ai')} />
          </div>
        </div>
      </div>

      <div className="od-side">
        {/* 판단 유보 사유: 큰 창에서는 사진 옆 오른쪽 맨 위, 패널에서는 사진 바로 아래 */}
        {o.reason && <p className="reason">{o.reason}</p>}
        {extra}
        {/* 핵심 숫자 세 칸 */}
        <dl className="od-stats">
          <div><dt>위험도</dt><dd>{o.risk == null ? <span className="na">산출 불가</span> : <>{o.risk}<small>/100</small></>}</dd></div>
          <div><dt>보도 점유</dt><dd>{o.occ == null ? <span className="na">측정 불가</span> : <>{o.occ}<small>%</small></>}</dd></div>
          <div><dt>원인</dt><dd className="causes">{o.causes.length ? o.causes.join(', ') : <span className="na">없음</span>}</dd></div>
        </dl>

        {o.routes.length > 0 && (
          <section className="od-act" aria-label="처리">
            <div className="rowx"><h4 className="sec">처리</h4><TrendBadge o={o} empty={null} /></div>
            <ul className="route-list">
              {o.routes.map((r) => (
                <li key={r.cause}>
                  <p className="route-line">
                    <b>{routeName(r.type)}</b>
                    <span className="route-to">→ {r.dept === NO_DEPT ? '담당 부서 직접 지정' : r.dept}</span>
                    {o.routes.length > 1 && <span className="small">{r.cause}</span>}
                  </p>
                  <p className="small">{r.guide}</p>
                </li>
              ))}
            </ul>
            {routeDepts.length > 1 && <p className="small">{routeDepts.join(' · ')} 모두에 전달</p>}
            <div className="route-actions">
              <button type="button" className="krds-btn small primary" onClick={deliver}>
                {o.action !== '미처리' ? '요청 양식 다시 복사' : '요청 양식 복사'}
              </button>
              {links.map((l) => <a key={l.url} className="krds-btn small secondary" href={l.url} target="_blank" rel="noreferrer">{l.label} 열기</a>)}
              <button type="button" className={`krds-btn small tertiary${fpOpen ? ' fp-on' : ''}`} aria-expanded={fpOpen} onClick={() => setFpOpen(!fpOpen)}>오탐 처리</button>
            </div>
            {/* 오탐 처리의 하위 선택: 주요 버튼보다 한 단계 가볍게 */}
            {fpOpen && (
              <div className="fp-panel" role="group" aria-labelledby={`${uid}-fp`}>
                <p className="fp-label" id={`${uid}-fp`}>오탐 사유를 고르세요</p>
                <div className="fp-reasons">
                  {FP_REASONS.map((r) => <button key={r} type="button" className="fp-chip" onClick={() => markFalse(r)}>{r}</button>)}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="form">
          <label htmlFor={`${uid}-dept`}>담당 부서</label>
          <select className="krds-form-select small" id={`${uid}-dept`} value={o.dept} onChange={(e) => onUpdate({ dept: e.target.value }, `담당 부서: ${o.dept} → ${e.target.value}`)}>
            {DEPTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <label htmlFor={`${uid}-act`}>처리 상태</label>
          <select className="krds-form-select small" id={`${uid}-act`} value={o.action} onChange={(e) => onUpdate({ action: e.target.value as Action }, `처리 상태: ${e.target.value}`)}>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <div className="full">
            <label className="vh" htmlFor={`${uid}-memo`}>처리 메모</label>
            <input className="krds-input small" id={`${uid}-memo`} value={memo} placeholder="처리 메모 (예: 운영사 수거 요청 접수번호)"
              onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMemo()} />
            <button type="button" className="krds-btn small primary" onClick={addMemo}>기록</button>
          </div>
        </div>

        {/* 매번 보지 않아도 되는 정보는 접어 둔다 */}
        <details className="od-more">
          <summary>처리 이력 <span>{hist.length}건</span></summary>
          <ol className="hist">
            {hist.map((e, i) => (
              <li key={i} className={e.ai ? 'ai' : ''}>
                <time>{fmtTime(e.t)}{e.by ? ` · ${e.by}` : e.ai ? ' · 시스템' : ''}</time>{e.txt}
              </li>
            ))}
          </ol>
        </details>
        <details className="od-more">
          <summary>위치 정보</summary>
          <dl className="facts">
            {o.addr && <><dt>주소</dt><dd>{o.addr}</dd></>}
            {road && !road.cl && <><dt>가까운 도로</dt><dd>{road.road} <span className="small">({RANK[road.rank] ?? road.rank}{road.lanes ? ` · ${road.lanes}차로` : ''}{road.width ? ` · 도로폭 ${road.width}m` : ''})</span></dd></>}
            {road && <><dt>링크 ID</dt><dd className="small">{road.id}</dd></>}
            <dt>관측 ID</dt><dd className="small">{o.id}</dd>
          </dl>
        </details>
        {related}
      </div>
    </div>
  );
}
