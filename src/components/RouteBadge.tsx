import { routeName } from '../lib/constants';
import type { Observation, Route } from '../types';

/** 처리 유형 배지 (A 운영사 수거 · B 점유자 계도 · C 단속 · D 허가 확인 · E 수거 · F 정비 계획 · 미분류) */
export function RouteBadge({ route }: { route: Route }) {
  return <span className={`krds-badge small route route-${route.type}`}>{routeName(route.type)}</span>;
}

/**
 * 현장 추이: 지속성(최근 7일 반복)과 현장 확인(요청 뒤 다음 관측)을 하나로.
 * 해소됨 > 상습 > 지속 > 확인 대기 순. 처음 감지된 건(일시)은 비운다
 */
type Trend = { label: string; tone: 'done' | 'again' | 'stay' | 'wait'; hint: string };
export function trendOf(o: Observation): Trend | null {
  const p = o.persist;
  if (o.site === '해소 확인') return { label: '해소됨', tone: 'done', hint: '요청 뒤 다음 관측에서 사라짐' };
  if (p?.kind === '상습') return { label: `상습 ${p.n}회`, tone: 'again', hint: `최근 7일 ${p.n}회, 사라졌다가 다시 나타남` };
  if (p?.kind === '지속') return { label: `지속 ${p.days}일`, tone: 'stay', hint: `${p.days}일째 그대로 (최근 7일 ${p.n}회)` };
  if (o.site === '새 관측 대기') return { label: '확인 대기', tone: 'wait', hint: '요청을 넘김, 다음 관측으로 해소 여부 확인 예정' };
  return null;
}
export function TrendBadge({ o, empty = '—' }: { o: Observation; empty?: string | null }) {
  const t = trendOf(o);
  if (!t) return empty ? <span className="small">{empty}</span> : null;
  return <span className={`krds-badge small trend-${t.tone}`} title={t.hint}>{t.label}</span>;
}
