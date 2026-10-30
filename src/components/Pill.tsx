import { PASS } from '../lib/constants';
import type { Pass } from '../types';

/** 판정 배지 (KRDS krds-badge 모양, 색은 app.css 판정 토큰). 다섯 라벨이 같은 너비. 상세 화면용 */
export function Pill({ pass }: { pass: Pass | 'none' | 'analyzing' }) {
  if (pass === 'none') return <span className="krds-badge pill pill-none">관측 없음</span>;
  if (pass === 'analyzing') return <span className="krds-badge pill pill-none">분석 중</span>;
  return <span className={`krds-badge pill pill-${pass}`}>{PASS[pass].label}</span>;
}

/** 판정 색 점 + 글자. 줄마다 반복되는 목록·표용 (색만으로 구분하지 않도록 글자를 함께) */
export function PassDot({ pass }: { pass: Pass | 'analyzing' }) {
  if (pass === 'analyzing') return <span className="pdot pdot-hold">분석 중</span>;
  return <span className={`pdot pdot-${pass}`}>{PASS[pass].label}</span>;
}
