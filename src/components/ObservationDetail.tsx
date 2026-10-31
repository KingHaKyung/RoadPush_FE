import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { USE_API } from '../api/client';
import { ACTIONS, DEPTS, NO_DEPT, PASS, RANK, routeName, SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import { capturedEarlier, effPass, segById } from '../lib/segments';
import { requestText } from '../lib/request';
import type { Action, HistoryEntry, Observation, ObservationPatch } from '../types';
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
 * 공유 서버 이력은 처리 상태(처리 기록)와 같이 쓴 메모(메모 테이블)가 따로 와서 두 항목이 된다.
 * 같은 사람이 몇 초 안에 남긴 '처리 상태'와 '메모'는 한 항목으로 묶는다 (메모는 아래 줄, 메모만 고칠 수 있다).
 * 예시 데이터는 처음부터 한 항목에 담기고 시각이 모두 같아서 묶지 않는다
 */
function mergeMemos(hist: HistoryEntry[]): HistoryEntry[] {
  if (!USE_API) return [...hist];
  const out = [...hist].sort((a, b) => a.t.localeCompare(b.t));
  const near = (a: HistoryEntry, b: HistoryEntry) => a.by === b.by && Math.abs(Date.parse(a.t) - Date.parse(b.t)) <= 10_000;
  for (let i = 0; i < out.length; i++) {
    const m = out[i];
    if (m.txt || m.memo == null) continue;
    const j = [i - 1, i + 1].find((k) => out[k] && !out[k].memo && out[k].txt.startsWith('처리 상태') && near(out[k], m));
    if (j == null) continue;
    out[j] = { ...out[j], memo: m.memo, id: m.id, editedAt: m.editedAt };
    out.splice(i, 1);
    i--;
  }
  return out;
}

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
  /**
   * 담당 부서·처리 상태·메모는 고르는 동안 저장하지 않고, '저장'을 눌렀을 때 한 번에 저장한다
   * (전에는 고를 때마다 저장돼 처리 이력이 여러 줄 쌓였다). 다른 곳에서 바뀌면(요청 글 복사 등) 그 값으로 맞춘다
   */
  const [dept, setDept] = useState(o.dept);
  const [act, setAct] = useState<Action>(o.action);
  useEffect(() => { setDept(o.dept); setAct(o.action); }, [o.dept, o.action]);
  const dirty = dept !== o.dept || act !== o.action || !!memo.trim();
  const save = () => {
    const v = memo.trim();
    if (dept === o.dept && act === o.action) {
      if (v) onUpdate({}, `메모: ${v}`);
    } else {
      // 한 번의 저장 = 이력 한 줄. 바뀐 결과만 짧게 (이전 값은 바로 아래 이력에 있다)
      const what = [dept !== o.dept && `담당 부서: ${dept}`, act !== o.action && `처리 상태: ${act}`, v && `메모: ${v}`].filter(Boolean).join(' · ');
      onUpdate({ ...(dept !== o.dept ? { dept } : {}), ...(act !== o.action ? { action: act } : {}) }, what);
    }
    setMemo('');
  };
  const revert = () => { setDept(o.dept); setAct(o.action); setMemo(''); };
  /** 이력 메모 고치기: 고치는 중인 기록 번호와 글 */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const saveEdit = () => {
    if (!editing) return;
    const v = editing.text.trim();
    const e = o.hist.find((h) => h.id === editing.id);
    if (v && v !== e?.memo) onUpdate({ memoEdit: { id: editing.id, text: v } });
    setEditing(null);
  };
  // 원인마다 기본 부서 (둘 이상이면 같은 글을 모든 부서에 보낸다). 미분류(장애물)는 기본 부서가 없어 뺀다
  const routeDepts = [...new Set(o.routes.map((r) => r.dept))].filter((d) => d !== NO_DEPT);
  /** 복사한 글 미리 보기: copied는 자동 복사 결과 (null: 복사 중, false: 실패라 직접 복사하게 글을 골라 둔다) */
  const [sent, setSent] = useState<{ text: string; copied: boolean | null } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 클립보드에 넣고 결과를 미리 보기에 적는다. 브라우저가 권한 창 등으로 답을 안 주면 멈춘 것처럼 보여서
   * 1.5초 안에 답이 없으면 실패로 보고 직접 복사하게 한다
   */
  const copy = (text: string) => {
    setSent({ text, copied: null });
    const fail = () => { setSent({ text, copied: false }); setTimeout(() => textRef.current?.select(), 0); };
    if (!navigator.clipboard) { fail(); return; }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; fail(); } }, 1500);
    navigator.clipboard.writeText(text).then(
      () => { if (!settled) { settled = true; clearTimeout(timer); setSent({ text, copied: true }); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); fail(); } },
    );
  };
  // 업무 메신저·새올에 붙여 넣을 글을 복사하고 '현장점검 요청'으로 기록. 부서가 비어 있으면 첫 원인의 기본 부서로.
  // 무엇이 복사됐는지 보이게 글을 바로 아래에 펼친다
  const deliver = () => {
    const dept = o.dept === NO_DEPT ? routeDepts[0] ?? NO_DEPT : o.dept;
    copy(requestText({ ...o, dept }));
    onUpdate({ action: '현장점검 요청', ...(dept !== o.dept ? { dept } : {}) }, `${[...new Set([dept, ...routeDepts])].join('·')}에 현장점검 요청`);
  };
  const links = [...new Map(o.routes.flatMap((r) => (r.link ? [[r.link.url, r.link] as const] : []))).values()];
  // 오탐: 사람 판정을 '통과 가능'으로 바꾼다. 사유는 검수 기록에 함께 저장된다
  const markFalse = (why: string) => {
    onUpdate({ human: 'passable', review: '수정' }, `오탐 처리: ${why}`);
    setFpOpen(false);
  };
  // 최신이 위로. 시각이 같으면(예시 데이터는 모두 같은 '지금') 나중에 남긴 것이 위로
  const hist = mergeMemos(o.hist).reverse().sort((a, b) => b.t.localeCompare(a.t));

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
                처리 요청 양식 복사하기
              </button>
              {links.map((l) => <a key={l.url} className="krds-btn small secondary" href={l.url} target="_blank" rel="noreferrer">{l.label} 열기</a>)}
              <button type="button" className={`krds-btn small tertiary${fpOpen ? ' fp-on' : ''}`} aria-expanded={fpOpen} onClick={() => setFpOpen(!fpOpen)}>오탐 처리</button>
            </div>
            {sent && (
              <div className="req-preview" role="status">
                <p className={`req-msg${sent.copied === false ? ' warn' : ''}`}>
                  {sent.copied === null ? '복사하는 중입니다.' : sent.copied
                    ? '아래 처리 요청 양식을 복사했습니다. 업무 메신저나 새올 등에 붙여 넣으세요 (Ctrl+V).'
                    : '자동으로 복사하지 못했습니다. 아래 양식이 선택돼 있으니 Ctrl+C로 복사하세요.'}
                </p>
                <label className="vh" htmlFor={`${uid}-req`}>처리 요청 양식</label>
                <textarea ref={textRef} id={`${uid}-req`} className="req-text" readOnly value={sent.text} rows={Math.min(14, sent.text.split('\n').length)} onFocus={(e) => e.currentTarget.select()} />
                <div className="req-btns">
                  <button type="button" className="krds-btn xsmall secondary" onClick={() => copy(sent.text)}>다시 복사</button>
                  <button type="button" className="krds-btn xsmall text" onClick={() => setSent(null)}>닫기</button>
                </div>
              </div>
            )}
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
          <select className="krds-form-select small" id={`${uid}-dept`} value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <label htmlFor={`${uid}-act`}>처리 상태</label>
          <select className="krds-form-select small" id={`${uid}-act`} value={act} onChange={(e) => setAct(e.target.value as Action)}>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <div className="full">
            <label className="vh" htmlFor={`${uid}-memo`}>처리 메모</label>
            <input className="krds-input small" id={`${uid}-memo`} value={memo} placeholder="처리 메모 (예: 운영사 수거 요청 접수번호)"
              onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dirty && save()} />
            <button type="button" className="krds-btn small primary" onClick={save} disabled={!dirty}>저장</button>
          </div>
          {dirty && (
            <p className="form-dirty full" role="status">
              저장하지 않은 변경이 있습니다. '저장'을 눌러야 처리 이력에 남습니다.
              <button type="button" className="krds-btn xsmall text" onClick={revert}>되돌리기</button>
            </p>
          )}
        </div>

        {/* 매번 보지 않아도 되는 정보는 접어 둔다 */}
        <details className="od-more">
          <summary>처리 이력 <span>{hist.length}건</span></summary>
          <ol className="hist">
            {hist.map((e, i) => (
              <li key={e.id ?? i} className={e.ai ? 'ai' : ''}>
                <time>{fmtTime(e.t)}{e.by ? ` · ${e.by}` : e.ai ? ' · 시스템' : ''}</time>
                {e.txt}
                {e.memo != null && !(editing && e.id && editing.id === e.id) && (
                  <span className="hist-memo">
                    메모: {e.memo}
                    {e.editedAt && <span className="hist-edited" title={`${fmtTime(e.editedAt)} 수정`}>(수정됨)</span>}
                    {e.id && <button type="button" className="krds-btn xsmall text hist-fix" onClick={() => setEditing({ id: e.id!, text: e.memo! })}>메모 고치기</button>}
                  </span>
                )}
                {editing && editing.id === e.id && (
                  <span className="hist-editor">
                    <label className="vh" htmlFor={`${uid}-edit-${e.id}`}>메모 고치기</label>
                    <input className="krds-input small" id={`${uid}-edit-${e.id}`} value={editing.text} autoFocus
                      onChange={(ev) => { const text = ev.target.value; setEditing((cur) => cur && { ...cur, text }); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') saveEdit(); if (ev.key === 'Escape') { ev.stopPropagation(); setEditing(null); } }} />
                    <button type="button" className="krds-btn xsmall primary" onClick={saveEdit} disabled={!editing.text.trim()}>저장</button>
                    <button type="button" className="krds-btn xsmall text" onClick={() => setEditing(null)}>취소</button>
                  </span>
                )}
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
