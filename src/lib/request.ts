import type { Observation } from '../types';
import { CAUSE_LABEL, PASS, ROUTE_LABEL, SRC_LABEL } from './constants';
import { fmtTime } from './format';
import { deptText, effPass } from './segments';

/**
 * 처리 요청서 (기존 행정 시스템·메신저에 붙여 넣는 글).
 * RoadPush는 처리 과정을 관리하지 않고, 발견한 근거를 담당 부서에 넘긴다.
 */
export function requestText(o: Observation): string {
  const p = o.persist;
  return [
    `[RoadPush 보행 통로 처리 요청] ${o.routes.map((r) => `${r.type}. ${ROUTE_LABEL[r.type]}`).join(' / ')}`,
    // 원인이 둘이고 부서가 다르면 같은 요청서를 두 부서 모두에 보낸다
    `담당: ${deptText(o)}${o.depts.length > 1 ? ' (원인별로 각 부서에 같은 요청서를 보냄)' : ''}`,
    `위치: ${o.place}${o.addr ? ` (${o.addr})` : ''}`,
    `좌표: ${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}`,
    `촬영: ${fmtTime(o.t)} · ${SRC_LABEL[o.src]} ${o.dev}`,
    `판정: ${PASS[effPass(o)].label}${o.risk != null ? ` · 상대 위험도 ${o.risk}` : ''}${o.occ != null ? ` · 점유 ${o.occ}%(사진 면적 기준 근사)` : ''}`,
    `원인: ${o.causes.map((c) => CAUSE_LABEL[c]).join(', ') || '없음'}`,
    p ? `감지 이력: 최근 7일 ${p.n}회 · ${p.days}일째 · ${p.kind}` : '',
    ...o.routes.map((r, i) => `안내(${CAUSE_LABEL[r.cause]} → ${o.depts[i]}): ${r.guide}`),
    `관측 ID: ${o.id} (원본·분석 화면은 RoadPush에서 확인)`,
  ].filter(Boolean).join('\n');
}
