import { useId, useState, type ReactNode } from 'react';
import { ACTIONS, DEPTS, PASS, RANK, ROUTE_LABEL, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { effPass, segById } from '../lib/segments';
import { requestText } from '../lib/request';
import type { Action, Observation, ObservationPatch } from '../types';
import { ChipGroup } from './ChipGroup';
import { FrameView } from './FrameView';
import { Pill } from './Pill';
import { PersistBadge, RouteBadge, SiteBadge } from './RouteBadge';

interface Props {
  o: Observation;
  onUpdate: (patch: ObservationPatch, log?: string) => void;
  /** panel: 오른쪽 패널(세로 한 줄) · wide: 가운데 큰 창(왼쪽 촬영 화면, 오른쪽 정보) */
  layout?: 'panel' | 'wide';
  /** 오른쪽 정보 맨 위에 넣을 내용 (예: 판단 유보 판정 버튼) */
  extra?: ReactNode;
}

export function ObservationDetail({ o, onUpdate, layout = 'panel', extra }: Props) {
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
  // 원인마다 기본 부서 (둘 이상이면 같은 요청서를 모든 부서에 보낸다)
  const routeDepts = [...new Set(o.routes.map((r) => r.dept))];
  // [전달] 기존 행정 시스템에 붙여 넣을 처리 요청서를 복사하고 '현장점검 요청'으로 기록. 부서가 비어 있으면 첫 원인의 기본 부서로
  const deliver = () => {
    const dept = o.dept === '미배정' ? routeDepts[0] ?? '미배정' : o.dept;
    const done = () => onUpdate({ action: '현장점검 요청', ...(dept !== o.dept ? { dept } : {}) }, `처리 요청서 전달 (${[...new Set([dept, ...routeDepts])].join(', ')})`);
    navigator.clipboard?.writeText(requestText(o)).then(done, done);
  };
  const links = [...new Map(o.routes.flatMap((r) => (r.link ? [[r.link.url, r.link] as const] : []))).values()];
  // 오탐: 사람 판정을 '통과 가능'으로 바꾼다. 사유는 처리 이력에만 남는다 (백엔드에는 아직 저장하지 않음)
  const markFalse = (why: string) => {
    onUpdate({ human: 'passable', review: '수정' }, `오탐 처리: ${why}`);
    setFpOpen(false);
  };
  return (
    <div className={`od od-${layout}`}>
      {/* 위치 · 판정 · 시각 · 장비 · 주소 · 가까운 도로를 한곳에 (위에 따로 두던 지점 정보와 합침) */}
      <div className="dh od-head">
        <div className="rowx"><h3>{o.place}</h3><Pill pass={effPass(o)} /></div>
        <div className="meta">
          <span>{fmtTime(o.t)}</span><span>{SRC_LABEL[o.src]} {o.dev}</span>
          {o.addr && <span>{o.addr}</span>}
        </div>
        {road && !road.cl && (
          <dl className="facts od-road">
            <dt>가까운 도로</dt>
            <dd>{road.road} <span className="small">({RANK[road.rank] ?? road.rank} · {road.lanes}차로{road.width ? ` · 도로폭 ${road.width}m` : ''})</span></dd>
            <dt>링크 · 관측</dt><dd className="small">{road.id} · {o.id}</dd>
          </dl>
        )}
      </div>
      <div className="od-view">
        <div className="rowx">
          <span className="small">촬영 화면(예시)</span>
          <ChipGroup label="촬영 화면 보기" options={[['raw', '원본'], ['ai', '분석']]} value={overlay ? 'ai' : 'raw'} onChange={(v) => setOverlay(v === 'ai')} />
        </div>
        <div className="frame"><FrameView o={o} overlay={overlay} /></div>
      </div>
      <div className="od-side">
        {extra}
        <dl className="facts">
          <dt>AI 판정</dt><dd><Pill pass={o.pass} />{o.human && <> → 사람 판정 <Pill pass={o.human} /></>}</dd>
          <dt>상대 위험도</dt>
          <dd>{o.risk == null ? '산출 불가' : <><b>{o.risk}</b> / 100<div className="meter"><i style={{ width: `${o.risk}%`, background: PASS[o.pass].color }} /></div></>}</dd>
          <dt>보도 점유</dt><dd>{o.occ == null ? '측정 불가' : <>{o.occ}% <span className="small">(사진 면적 기준 근사)</span></>}</dd>
          <dt>원인</dt><dd>{o.causes.length ? <span className="krds-badge-wrap">{o.causes.map((c) => <span key={c} className="krds-badge small outline-gray">{c}</span>)}</span> : '없음'}</dd>
          {o.routes.length > 0 && <><dt>처리 유형</dt><dd>{o.routes.map((r) => <div key={r.cause}>{r.type}. {ROUTE_LABEL[r.type]} · {r.dept}</div>)}</dd></>}
        </dl>
        {o.reason && <div className="reason">{o.reason}</div>}
        {o.routes.length > 0 && (
          <section className="route-box" aria-label="처리 경로">
            <div className="rowx"><h4 className="sec">처리 경로</h4>{o.persist && <PersistBadge p={o.persist} />}{o.site && <SiteBadge s={o.site} />}</div>
            {routeDepts.length > 1 && <p className="small">담당이 다른 원인이 함께 감지됐습니다. 같은 요청서를 {routeDepts.join(', ')} 모두에 보내세요.</p>}
            <ul className="route-list">
              {o.routes.map((r) => (
                <li key={r.cause}>
                  <div className="rowx">
                    <RouteBadge route={r} /><b>{r.cause}</b><span className="small">기본 부서 {r.dept}</span>
                  </div>
                  <p className="small">{r.guide}</p>
                </li>
              ))}
            </ul>
            {o.persist && o.persist.kind !== '일시' && (
              <p className="small">감지 근거: 최근 7일 같은 원인 <b>{o.persist.n}회</b> · {o.persist.days}일째{o.persist.kind === '상습' ? ' · 사라졌다가 다시 나타남' : ''}</p>
            )}
            <div className="route-actions">
              <button type="button" className="krds-btn small primary" onClick={deliver}>
                {o.action !== '미처리' ? '처리 요청서 다시 복사' : '처리 요청서 복사·전달'}
              </button>
              {links.map((l) => <a key={l.url} className="krds-btn small secondary" href={l.url} target="_blank" rel="noreferrer">{l.label} 열기</a>)}
              <button type="button" className="krds-btn small tertiary" aria-expanded={fpOpen} onClick={() => setFpOpen(!fpOpen)}>오탐 처리</button>
            </div>
            {fpOpen && (
              <div className="fp-reasons" role="group" aria-label="오탐 사유">
                {['차도·배경에 있는 물체', '상시 고정시설', '그림자·반사', '원인 종류가 틀림', '기타'].map((r) => (
                  <button key={r} type="button" className="krds-btn small tertiary" onClick={() => markFalse(r)}>{r}</button>
                ))}
              </div>
            )}
            <p className="small hint">요청서를 기존 업무 시스템에 붙여 넣으세요. 처리 결과는 다음 관측에서 자동으로 확인합니다.</p>
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
          {o.site === '새 관측 대기' && <p className="full small">현장 개선: 새 관측 대기 (업무 종결과 별개로 다음 관측에서 확인)</p>}
          <div className="full">
            <label className="vh" htmlFor={`${uid}-memo`}>처리 메모</label>
            <input className="krds-input small" id={`${uid}-memo`} value={memo} placeholder="처리 메모 (예: 운영사 수거 요청 접수번호)"
              onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMemo()} />
            <button type="button" className="krds-btn small primary" onClick={addMemo}>기록</button>
          </div>
        </div>
        <h4 className="sec">처리 이력</h4>
        <ol className="hist">
          {[...o.hist].sort((a, b) => b.t.localeCompare(a.t)).map((e, i) => (
            <li key={i} className={e.ai ? 'ai' : ''}>
              <time>{fmtTime(e.t)}{e.by ? ` · ${e.by}` : e.ai ? ' · 시스템' : ''}</time>{e.txt}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
