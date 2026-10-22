import { API_BASE } from '../api/client';
import { SRC_LABEL } from '../lib/constants';
import { fmtTime } from '../lib/format';
import type { Observation, Tab } from '../types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '위험 지도' },
  { id: 'list', label: '관측 목록' },
  { id: 'hold', label: '판단 유보' },
];

export function Header({ tab, holdCount, obs, error }: { tab: Tab; holdCount: number; obs: Observation[]; error: string | null }) {
  // 백엔드에 연결되면 실제 관측으로 최종 수신 시각·수집 경로별 건수를 보여 준다
  const latest = obs.reduce<string | null>((m, o) => (!m || o.t > m ? o.t : m), null);
  const bySrc = (['cctv', 'car', 'upload'] as const).map((s) => [s, obs.filter((o) => o.src === s).length] as const).filter(([, n]) => n > 0);
  return (
    <>
      <a className="skip" href="#content">본문 바로가기</a>
      <header className="top">
        <div className="top-in">
          <div className="brand"><b>RoadPush</b><span className="krds-badge small outline-secondary">경기 성남시</span></div>
          {/* KRDS 탭(라인형) 모양의 주 메뉴 */}
          <nav className="krds-tab-area top-nav" aria-label="주 메뉴">
            <div className="tab line">
              <ul>
                {TABS.map((t) => (
                  <li key={t.id} className={tab === t.id ? 'active' : undefined}>
                    <a className="btn-tab" href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
                      {t.label}
                      {t.id === 'hold' && holdCount > 0 && <span className="krds-badge small bg-danger number">{holdCount}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          <div className="status-line">
            {API_BASE ? (
              <>
                {latest && <span className="live">최종 촬영 {fmtTime(latest)}</span>}
                <span>{bySrc.map(([s, n]) => `${SRC_LABEL[s]} ${n}건`).join(' · ') || '관측 없음'}</span>
                {error
                  ? <span className="krds-badge small bg-danger" title={error}>백엔드 연결 실패</span>
                  : <span className="krds-badge small outline-primary">백엔드 연결</span>}
              </>
            ) : (
              <>
                <span className="live">최종 수신 10/18 14:38</span>
                <span>CCTV 12대 · 단속차량 2대</span>
                <span className="krds-badge small outline-gray">예시 데이터</span>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
