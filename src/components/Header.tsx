import type { Tab } from '../types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '위험 지도' },
  { id: 'list', label: '관측 목록' },
  { id: 'hold', label: '판단 유보' },
];

export function Header({ tab, holdCount }: { tab: Tab; holdCount: number }) {
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
            <span className="live">최종 수신 10/18 14:38</span>
            <span>CCTV 12대 · 단속차량 2대</span>
            <span className="krds-badge small outline-gray">예시 데이터</span>
          </div>
        </div>
      </header>
    </>
  );
}
