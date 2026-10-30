import type { Tab } from '../types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '위험 지도' },
  { id: 'list', label: '관측 목록' },
  { id: 'hold', label: '판단 유보' },
];

export function Header({ tab, holdCount, error }: { tab: Tab; holdCount: number; error: string | null }) {
  return (
    <>
      <a className="skip" href="#content">본문 바로가기</a>
      <header className="top">
        <div className="top-in">
          {/* 로고를 누르면 첫 화면(위험 지도)으로 */}
          <div className="brand"><a href="#map" aria-label="RoadPush 위험 지도로"><b>RoadPush</b></a></div>
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
          {/* 백엔드 연결이 끊겼을 때만 */}
          {error && <div className="status-line"><span className="krds-badge small bg-danger" title={error}>백엔드 연결 실패</span></div>}
        </div>
      </header>
    </>
  );
}
