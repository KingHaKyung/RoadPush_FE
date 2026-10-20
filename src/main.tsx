import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// KRDS HTML 컴포넌트 키트(krds-uiux): 토큰·공통 리셋·컴포넌트. 앱 스타일은 그 위에 레이아웃만 얹는다
import 'krds-uiux/resources/css/common/common.css';
import 'krds-uiux/resources/css/component/component.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
