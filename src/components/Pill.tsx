import { PASS } from '../lib/constants';
import type { Pass } from '../types';

/** 판정 배지 (KRDS krds-badge 모양, 색은 app.css 판정 토큰). 다섯 라벨이 같은 너비 */
export function Pill({ pass }: { pass: Pass | 'none' }) {
  if (pass === 'none') return <span className="krds-badge pill pill-none">관측 없음</span>;
  return <span className={`krds-badge pill pill-${pass}`}>{PASS[pass].label}</span>;
}
