import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReportApp } from './report/ReportApp';
// KRDS HTML 컴포넌트 키트(krds-uiux): 토큰·공통 리셋·컴포넌트. 앱 스타일은 그 위에 레이아웃만 얹는다
import 'krds-uiux/resources/css/common/common.css';
import 'krds-uiux/resources/css/component/component.css';
import './styles/app.css';

// 주소로 화면을 나눈다: /dashboard 관제 대시보드(탭은 #map·#list·#hold) · /report 시민 제보 웹앱
const path = location.pathname.replace(/\/+$/, '') || '/';
const isReport = path === '/report';
if (!isReport && path !== '/dashboard') history.replaceState(null, '', `/dashboard${location.hash}`);
if (isReport) {
  // 휴대폰 홈 화면에 추가할 수 있게 (제보 화면만)
  document.head.insertAdjacentHTML('beforeend', '<link rel="manifest" href="/report.webmanifest"><meta name="theme-color" content="#5B5ECF"><link rel="apple-touch-icon" href="/report-icon.svg">');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isReport ? <ReportApp /> : <App />}
  </StrictMode>,
);
