/** 화면 맨 아래 두 줄: 서비스 이름·AI 판정 안내·바로가기 / 자료 출처·저작권. 지도 위에는 배경지도(브이월드) 출처만 둔다 */
export function Footer() {
  return (
    <footer className="site-foot">
      <div className="sf-top">
        <p className="sf-brand">
          <a href="#map"><b>RoadPush</b></a>
          <span className="sf-note">판정은 AI가 사진으로 추정한 결과입니다. 현장 조치 전에 사진을 확인해 주세요.</span>
        </p>
        <nav className="sf-links" aria-label="바로가기">
          <a href="/report">시민 제보 화면</a>
        </nav>
      </div>
      <p className="sf-bottom">
        <span>배경지도 © 브이월드(국토교통부)</span>
        <span>도로 © 국토교통부 표준노드링크(2026-10-14)</span>
        <span>도로폭 © 국토지리정보원 연속수치지형도</span>
        <span className="sf-copy">© 2026 RoadPush</span>
      </p>
    </footer>
  );
}
