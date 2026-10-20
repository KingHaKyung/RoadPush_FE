import { useId, useState, type ReactNode } from 'react';
import { ACTIONS, DEPTS, PASS, RANK, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { effPass, segById } from '../lib/segments';
import type { Action, Observation, ObservationPatch } from '../types';
import { ChipGroup } from './ChipGroup';
import { FrameView } from './FrameView';
import { Pill } from './Pill';

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
  const uid = useId();
  const road = segById.get(o.seg);
  const addMemo = () => {
    const v = memo.trim();
    if (!v) return;
    onUpdate({}, `메모: ${v}`);
    setMemo('');
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
          <dt>보도 점유</dt><dd>{o.occ == null ? '측정 불가' : `${o.occ}% · 남은 폭 ${100 - o.occ}%`}</dd>
          <dt>원인</dt><dd>{o.causes.length ? <span className="krds-badge-wrap">{o.causes.map((c) => <span key={c} className="krds-badge small outline-gray">{c}</span>)}</span> : '없음'}</dd>
        </dl>
        {o.reason && <div className="reason">{o.reason}</div>}
        <div className="form">
          <label htmlFor={`${uid}-dept`}>담당 부서</label>
          <select className="krds-form-select small" id={`${uid}-dept`} value={o.dept} onChange={(e) => onUpdate({ dept: e.target.value }, `${e.target.value} 배정`)}>
            {DEPTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <label htmlFor={`${uid}-act`}>처리 상태</label>
          <select className="krds-form-select small" id={`${uid}-act`} value={o.action} onChange={(e) => onUpdate({ action: e.target.value as Action }, `처리 상태: ${e.target.value}`)}>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <div className="full">
            <label className="vh" htmlFor={`${uid}-memo`}>처리 메모</label>
            <input className="krds-input small" id={`${uid}-memo`} value={memo} placeholder="처리 메모 (예: 차주 연락 완료)"
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
