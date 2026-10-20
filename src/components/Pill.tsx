import { PASS } from '../lib/constants';
import type { Pass } from '../types';

/** KRDS 배지(파스텔 배경) 색: 단절 danger · 좁아짐 warning · 통과 가능 success · 판단 유보 gray */
const TONE: Record<Pass, string> = { blocked: 'danger', narrowed: 'warning', passable: 'success', hold: 'gray' };

/** 판정 배지 (KRDS krds-badge). 다섯 라벨이 같은 너비 */
export function Pill({ pass }: { pass: Pass | 'none' }) {
  if (pass === 'none') return <span className="krds-badge outline-gray pill">관측 없음</span>;
  return <span className={`krds-badge bg-light-${TONE[pass]} pill`}>{PASS[pass].label}</span>;
}
