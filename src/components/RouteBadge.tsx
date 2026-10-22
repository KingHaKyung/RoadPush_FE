import { ROUTE_LABEL } from '../lib/constants';
import type { Persistence, Route, SiteCheck } from '../types';

/** 처리 유형 배지 (A 운영사 수거 · B 점유자 계도 · C 단속 · D 허가 확인 · E 수거 · F 정비 계획) */
export function RouteBadge({ route }: { route: Route }) {
  return <span className={`krds-badge small route route-${route.type}`}>{route.type} {ROUTE_LABEL[route.type]}</span>;
}

/** 지속성 배지: 일시 / 지속 N일 / 상습 N회 */
export function PersistBadge({ p }: { p: Persistence }) {
  const txt = p.kind === '일시' ? '일시' : p.kind === '지속' ? `지속 ${p.days}일` : `상습 ${p.n}회`;
  return <span className={`krds-badge small persist persist-${p.kind}`} title={`최근 7일 같은 원인 ${p.n}회 감지`}>{txt}</span>;
}

/** 현장 확인 배지: 해소 확인 / 재발 / 새 관측 대기 (화면에서만 계산, 처리 상태와 별개) */
export function SiteBadge({ s }: { s: SiteCheck }) {
  const tone = s === '해소 확인' ? 'done' : s === '재발' ? 'again' : 'wait';
  return <span className={`krds-badge small site site-${tone}`} title="다음 관측으로 확인한 현장 상태 (처리 상태와 별개)">{s}</span>;
}
