import type { ObservationBase } from '../types';

/** 예시 관측: CCTV·불법주정차 단속차량에서 들어와 AI가 판정한 결과 (실제 데이터 아님) */
export const SAMPLE_OBSERVATIONS: ObservationBase[] = [
  { id: 'OBS-1018-014', src: 'cctv', dev: '서현-03', t: '2026-10-18T14:32:00+09:00', pass: 'blocked', risk: 91, occ: 88, causes: ['차량'], action: '현장점검 요청', dept: '주차관리과' },
  { id: 'OBS-1018-013', src: 'car', dev: '단속 2호', t: '2026-10-18T13:05:00+09:00', pass: 'narrowed', risk: 64, occ: 52, causes: ['적치물', 'PM'], action: '미처리', dept: '미배정' },
  { id: 'OBS-1018-012', src: 'cctv', dev: '수내-01', t: '2026-10-18T12:47:00+09:00', pass: 'passable', risk: 12, occ: 8, causes: [], action: '조치 완료', dept: '미배정' },
  { id: 'OBS-1018-011', src: 'car', dev: '단속 1호', t: '2026-10-18T11:20:00+09:00', pass: 'blocked', risk: 86, occ: 80, causes: ['공사시설'], action: '조치 중', dept: '건설관리과' },
  { id: 'OBS-1018-010', src: 'cctv', dev: '수내-04', t: '2026-10-18T09:15:00+09:00', pass: 'narrowed', risk: 58, occ: 45, causes: ['자전거', 'PM'], action: '미처리', dept: '미배정' },
  { id: 'OBS-1018-009', src: 'car', dev: '단속 2호', t: '2026-10-18T08:42:00+09:00', pass: 'hold', risk: null, occ: null, causes: [], reason: '우천 노면 반사로 보도 영역 일부가 잡히지 않음', cond: 'rain', action: '미처리', dept: '미배정' },
  { id: 'OBS-1018-008', src: 'cctv', dev: '서현-07', t: '2026-10-18T05:41:00+09:00', pass: 'hold', risk: null, occ: null, causes: [], reason: '야간 저조도로 보도 경계를 판별할 수 없음', cond: 'night', action: '미처리', dept: '미배정' },
  { id: 'OBS-1017-021', src: 'cctv', dev: '서현-02', t: '2026-10-17T22:10:00+09:00', pass: 'hold', risk: null, occ: null, causes: [], reason: '야간 역광으로 장애물 윤곽이 불명확함', cond: 'night', action: '미처리', dept: '미배정' },
  { id: 'OBS-1017-020', src: 'car', dev: '단속 1호', t: '2026-10-17T19:33:00+09:00', pass: 'blocked', risk: 78, occ: 70, causes: ['차량'], action: '조치 완료', dept: '주차관리과' },
  { id: 'OBS-1017-019', src: 'cctv', dev: '서현-05', t: '2026-10-17T17:02:00+09:00', pass: 'narrowed', risk: 47, occ: 38, causes: ['적치물'], action: '미처리', dept: '도로관리과' },
  { id: 'OBS-1017-018', src: 'car', dev: '단속 2호', t: '2026-10-17T15:48:00+09:00', pass: 'passable', risk: 9, occ: 5, causes: [], action: '조치 완료', dept: '미배정' },
  { id: 'OBS-1017-017', src: 'cctv', dev: '서현-01', t: '2026-10-17T14:20:00+09:00', pass: 'narrowed', risk: 52, occ: 41, causes: ['차량'], action: '현장점검 요청', dept: '주차관리과' },
  { id: 'OBS-1017-016', src: 'car', dev: '단속 1호', t: '2026-10-17T13:11:00+09:00', pass: 'hold', risk: null, occ: null, causes: [], reason: '대형 차량에 가려 보도 반대편 경계를 확인할 수 없음', cond: 'occluded', action: '미처리', dept: '미배정' },
  { id: 'OBS-1017-015', src: 'cctv', dev: '수내-06', t: '2026-10-17T11:55:00+09:00', pass: 'passable', risk: 15, occ: 11, causes: ['자전거'], action: '조치 완료', dept: '미배정' },
  { id: 'OBS-1017-014', src: 'car', dev: '단속 2호', t: '2026-10-17T10:30:00+09:00', pass: 'blocked', risk: 82, occ: 76, causes: ['공사시설', '적치물'], action: '미처리', dept: '미배정' },
  { id: 'OBS-1017-013', src: 'cctv', dev: '서현-03', t: '2026-10-17T09:02:00+09:00', pass: 'narrowed', risk: 61, occ: 49, causes: ['PM'], action: '미처리', dept: '교통행정과' },
  { id: 'OBS-1016-022', src: 'car', dev: '단속 1호', t: '2026-10-16T18:44:00+09:00', pass: 'hold', risk: null, occ: null, causes: [], reason: '보도와 자전거도로 구분이 불명확함', cond: 'mixed', action: '미처리', dept: '미배정' },
  { id: 'OBS-1016-021', src: 'cctv', dev: '서현-07', t: '2026-10-16T16:20:00+09:00', pass: 'narrowed', risk: 44, occ: 35, causes: ['적치물'], action: '조치 완료', dept: '도로관리과' },
  { id: 'OBS-1016-020', src: 'cctv', dev: '수내-04', t: '2026-10-16T07:10:00+09:00', pass: 'passable', risk: 18, occ: 13, causes: [], action: '조치 완료', dept: '미배정' },
  { id: 'OBS-1016-019', src: 'car', dev: '단속 2호', t: '2026-10-16T14:05:00+09:00', pass: 'blocked', risk: 88, occ: 84, causes: ['차량'], action: '현장점검 요청', dept: '주차관리과' },
];
