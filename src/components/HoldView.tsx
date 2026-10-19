import { COND_LABEL, PASS } from '../lib/constants';
import { fmtTime } from '../lib/format';
import type { Observation, ObservationPatch, Pass } from '../types';
import { FrameView } from './FrameView';
import { Pill } from './Pill';

interface Props {
  obs: Observation[];
  onUpdate: (id: string, patch: ObservationPatch, log?: string) => void;
  toast: (m: string) => void;
}

export function HoldView({ obs, onUpdate, toast }: Props) {
  const open = obs.filter((o) => o.pass === 'hold' && !o.human);
  const done = obs.filter((o) => o.pass === 'hold' && o.human);
  const counts: Record<string, number> = {};
  open.forEach((o) => o.cond && (counts[o.cond] = (counts[o.cond] ?? 0) + 1));

  const card = (o: Observation) => (
    <article key={o.id} className={`hcard${o.human ? ' done' : ''}`}>
      <div className="rowx"><h3>{o.place}</h3><span className="small">{fmtTime(o.t)}</span></div>
      <div className="frame"><FrameView o={o} overlay={false} /></div>
      <div className="reason">{o.reason}</div>
      {o.human ? (
        <div className="rowx">
          <span>사람 판정 <Pill pass={o.human} /></span>
          <button type="button" className="btn" onClick={() => { onUpdate(o.id, { human: null, review: '미검수' }, '사람 판정 취소'); toast('판정을 취소했습니다'); }}>판정 취소</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['passable', 'narrowed', 'blocked'] as Pass[]).map((p) => (
            <button key={p} type="button" className="btn j" style={{ ['--c' as string]: PASS[p].color }}
              onClick={() => { onUpdate(o.id, { human: p, review: '수정' }, `사람 판정: ${PASS[p].label}`); toast(`'${PASS[p].label}'(으)로 판정했습니다`); }}>
              {PASS[p].label}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => { onUpdate(o.id, { reanalyze: !o.reanalyze }, o.reanalyze ? '재분석 요청 취소' : '재분석 요청'); toast(o.reanalyze ? '재분석 요청을 취소했습니다' : '재분석을 요청했습니다'); }}>
            {o.reanalyze ? '재분석 대기 중' : '재분석 요청'}
          </button>
        </div>
      )}
    </article>
  );

  return (
    <section id="v-hold" className="page">
      <h1>판단 유보 검수</h1>
      <div className="toolbar">
        <span className="small grow">AI가 확정하지 못한 관측입니다. 사진을 보고 판정하면 사람 판정으로 따로 기록됩니다.</span>
        <span className="tags">{Object.entries(counts).map(([k, v]) => <span key={k} className="tag">{COND_LABEL[k as keyof typeof COND_LABEL]} {v}</span>)}</span>
      </div>
      <div className="holdgrid">{open.length ? open.map(card) : <p className="small">검수할 판단 유보 건이 없습니다.</p>}</div>
      {done.length > 0 && <><h2 style={{ fontSize: 17, margin: '12px 0 0' }}>검수 완료</h2><div className="holdgrid">{done.map(card)}</div></>}
    </section>
  );
}
