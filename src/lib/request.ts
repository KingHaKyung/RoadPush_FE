import type { Observation } from '../types';
import { NO_DEPT, PASS, routeName, SRC_LABEL } from './constants';
import { fmtTime } from './format';
import { effPass } from './segments';

/**
 * 요청 양식 (기존 행정 시스템·메신저에 붙여 넣는 글).
 * RoadPush는 처리 과정을 관리하지 않고, 발견한 근거를 담당 부서에 넘긴다.
 */
export function requestText(o: Observation): string {
  const p = o.persist;
  // 원인마다 기본 부서. 둘 이상이면 같은 요청 양식을 모든 부서에 보낸다
  // 미분류(장애물)는 기본 부서가 없어 빼고 센다
  const routeDepts = [...new Set(o.routes.map((r) => r.dept))].filter((d) => d !== NO_DEPT);
  return [
    `[RoadPush 보행 통로 처리 요청] ${o.routes.map((r) => routeName(r.type)).join(' / ')}`,
    `담당: ${o.dept}`,
    routeDepts.length > 1 ? `함께 보낼 부서: ${routeDepts.join(', ')} (원인별 담당이 다름)` : '',
    `위치: ${o.place}${o.addr ? ` (${o.addr})` : ''}`,
    `좌표: ${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}`,
    `촬영: ${fmtTime(o.t)} · ${SRC_LABEL[o.src]} ${o.dev}`,
    `판정: ${PASS[effPass(o)].label}${o.risk != null ? ` · 상대 위험도 ${o.risk}` : ''}${o.occ != null ? ` · 점유 ${o.occ}%(사진 면적 기준 근사)` : ''}`,
    `원인: ${o.causes.join(', ') || '없음'}`,
    p ? `감지 이력: 최근 7일 ${p.n}회 · ${p.days}일째 · ${p.kind}` : '',
    ...o.routes.map((r) => `안내(${r.cause} → ${r.dept}): ${r.guide}`),
    `관측 ID: ${o.id} (원본·분석 화면은 RoadPush에서 확인)`,
  ].filter(Boolean).join('\n');
}
