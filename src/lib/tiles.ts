import { devFlag } from './dev';

/** 브이월드 타일 주소. 개발 서버에서 ?map=fail 이면 일부러 틀린 주소를 줘서 지도 오류 안내를 확인한다 */
export const tileUrl = (base: string, path: string) => (devFlag('map') === 'fail' ? `http://127.0.0.1:1/${path}` : `${base}/${path}`);

/**
 * 지도 줌 범위 (관제 지도·제보 지도 공통). 11은 시·구 전체, 19는 브이월드 배경지도의 가장 큰 단계(그 위는 빈 화면).
 * 전에는 관제 지도가 전국(7)까지, 제보 지도는 제한 없이 세계 지도까지 줄어들었다. 시연 지역이 정해지면 여기서 조정
 */
export const MAP_ZOOM = { min: 11, max: 19 } as const;
/** 끌어서 옮길 수 있는 범위: 국내 (제주~백령도·독도). 밖으로 끌면 되돌아온다 */
export const KOREA_BOUNDS: [[number, number], [number, number]] = [[32.8, 124.0], [38.9, 132.0]];
