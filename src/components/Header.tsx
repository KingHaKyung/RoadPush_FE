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
          <div className="brand"><b>RoadPush</b><span className="area">서울 서대문구</span></div>
          <nav className="tabs" aria-label="주 메뉴">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
                {t.label}
                {t.id === 'hold' && holdCount > 0 && <span className="n">{holdCount}</span>}
              </a>
            ))}
          </nav>
          <div className="status-line">
            <span className="live">최종 수신 10/18 14:38</span>
            <span>CCTV 12대 · 단속차량 2대</span>
            <span className="demo">예시 데이터</span>
          </div>
        </div>
      </header>
    </>
  );
}
