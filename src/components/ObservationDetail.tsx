import { useId, useState } from 'react';
import { ACTIONS, DEPTS, PASS, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { effPass } from '../lib/segments';
import type { Action, Observation, ObservationPatch } from '../types';
import { FrameView } from './FrameView';
import { Pill } from './Pill';

interface Props {
  o: Observation;
  onUpdate: (patch: ObservationPatch, log?: string) => void;
}

export function ObservationDetail({ o, onUpdate }: Props) {
  const [overlay, setOverlay] = useState(true);
  const [memo, setMemo] = useState('');
  const uid = useId();
  const addMemo = () => {
    const v = memo.trim();
    if (!v) return;
    onUpdate({}, `메모: ${v}`);
    setMemo('');
  };
  return (
    <>
      <div className="dh">
        <div className="rowx"><h3>{o.place}</h3><Pill pass={effPass(o)} /></div>
        <div className="meta"><span>{fmtTime(o.t)}</span><span>{SRC_LABEL[o.src]} {o.dev}</span><span>링크 {o.seg}</span><span className="mono">{o.id}</span></div>
      </div>
      <div className="rowx">
        <span className="small">촬영 화면(예시)</span>
        <div className="seg" role="group" aria-label="보기">
          <button type="button" aria-pressed={!overlay} onClick={() => setOverlay(false)}>원본</button>
          <button type="button" aria-pressed={overlay} onClick={() => setOverlay(true)}>분석</button>
        </div>
      </div>
      <div className="frame"><FrameView o={o} overlay={overlay} /></div>
      <dl className="facts">
        <dt>AI 판정</dt><dd><Pill pass={o.pass} />{o.human && <> → 사람 판정 <Pill pass={o.human} /></>}</dd>
        <dt>상대 위험도</dt>
        <dd>{o.risk == null ? '산출 불가' : <><b>{o.risk}</b> / 100<div className="meter"><i style={{ width: `${o.risk}%`, background: PASS[o.pass].color }} /></div></>}</dd>
        <dt>보도 점유</dt><dd>{o.occ == null ? '측정 불가' : `${o.occ}% · 남은 폭 ${100 - o.occ}%`}</dd>
        <dt>원인</dt><dd>{o.causes.length ? <span className="tags">{o.causes.map((c) => <span key={c} className="tag">{c}</span>)}</span> : '없음'}</dd>
      </dl>
      {o.reason && <div className="reason">{o.reason}</div>}
      <div className="form">
        <label htmlFor={`${uid}-dept`}>담당 부서</label>
        <select className="sel" id={`${uid}-dept`} value={o.dept} onChange={(e) => onUpdate({ dept: e.target.value }, `${e.target.value} 배정`)}>
          {DEPTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <label htmlFor={`${uid}-act`}>처리 상태</label>
        <select className="sel" id={`${uid}-act`} value={o.action} onChange={(e) => onUpdate({ action: e.target.value as Action }, `처리 상태: ${e.target.value}`)}>
          {ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="full">
          <label className="vh" htmlFor={`${uid}-memo`}>처리 메모</label>
          <input className="inp" id={`${uid}-memo`} value={memo} placeholder="처리 메모 (예: 차주 연락 완료)"
            onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMemo()} />
          <button type="button" className="btn primary" onClick={addMemo}>기록</button>
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
    </>
  );
}
