import type { Observation, Pass } from '../types';
import { NO_DEPT, SRC_LABEL } from './constants';
import { fmtTime } from './format';
import { capturedEarlier, effPass } from './segments';

/** 원인 → 받는 부서가 바로 알아듣는 요청 이름 (처리 유형 코드 'C 단속' 대신) */
const ASK: Record<string, string> = {
  차량: '보도 위 주정차 단속',
  이륜차: '보도 위 이륜차 주차 단속',
  PM: '공유 킥보드(PM) 수거',
  자전거: '방치 자전거 수거',
  적치물: '보도 적치물 정리 계도',
  입간판: '보도 입간판 정비',
  공사시설: '공사장 보행 통로 확보 확인',
  쓰레기: '보도 쓰레기 수거',
  장애물: '보도 장애물 확인',
};
/** 판정 → 현장 상황 (AI 판정 이름 대신 걷는 사람 기준으로) */
const SITUATION: Record<Pass, string> = {
  blocked: '보도가 막혀 사람이 지나갈 수 없습니다',
  narrowed: '보도가 좁아져 지나가기 어렵습니다',
  hold: '사진만으로 판단하기 어려워 현장 확인이 필요합니다',
  passable: '지나갈 수 있는 상태입니다',
};
const REPEAT: Record<string, string> = { 상습: '없어졌다가 다시 나타나기를 반복', 지속: '계속 그대로 있음', 일시: '이번에 처음 발견' };

/**
 * 담당 부서에 보낼 글 (업무 메신저·새올 등에 붙여 넣는다).
 * RoadPush는 처리 과정을 관리하지 않고, 발견한 근거를 담당 부서에 넘긴다.
 * 받는 사람이 RoadPush를 몰라도 읽히게, 내부 코드(처리 유형·상대 위험도) 대신 하는 일과 현장 상황을 쓴다
 */
export function requestText(o: Observation): string {
  const p = o.persist;
  // 원인마다 기본 부서. 둘 이상이면 같은 글을 모든 부서에 보낸다. 미분류(장애물)는 기본 부서가 없어 뺀다
  const routeDepts = [...new Set(o.routes.map((r) => r.dept))].filter((d) => d !== NO_DEPT);
  const others = routeDepts.filter((d) => d !== o.dept);
  const asks = [...new Set(o.causes.map((c) => ASK[c] ?? `${c} 확인`))];
  return [
    `[보행 통로 처리 요청] ${asks.join(' / ') || '보도 통행 확인'} 요청`,
    `받는 부서: ${o.dept === NO_DEPT ? '(담당 부서를 정해 주세요)' : o.dept}`,
    others.length ? `함께 보낸 부서: ${others.join(', ')} (원인마다 담당이 달라 같은 내용을 함께 보냄)` : null,
    '',
    `위치: ${o.place}${o.addr ? ` (${o.addr})` : ''}`,
    `상황: ${SITUATION[effPass(o)]}.`,
    o.causes.length ? `막은 것: ${o.causes.join(', ')}${o.occ != null ? ` · 보도의 약 ${o.occ}%를 차지 (사진으로 추정)` : ''}` : null,
    `발견: ${fmtTime(o.t)} · ${SRC_LABEL[o.src]}${o.dev ? ` ${o.dev}` : ''}${capturedEarlier(o) ? ` (접수 ${fmtTime(o.received!)})` : ''}`,
    p && p.n > 1 ? `반복: 최근 7일 ${p.n}번 발견, ${p.days}일째 (${REPEAT[p.kind] ?? p.kind})` : null,
    o.risk != null ? `급한 정도: ${o.risk}점 / 100점 (높을수록 먼저 처리)` : null,
    '',
    ...o.routes.map((r) => `처리 참고${o.routes.length > 1 ? `(${r.cause})` : ''}: ${r.guide}`),
    // 받는 사람이 RoadPush에 들어오지 않아도 사진을 볼 수 있게
    o.img ? `현장 사진: ${o.img.original}` : null,
    o.img?.overlay ? `분석 표시 사진: ${o.img.overlay}` : null,
    `좌표: ${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}`,
    `관측 번호: ${o.id}`,
  ].filter((l): l is string => l !== null).join('\n');
}
