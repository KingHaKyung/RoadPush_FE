import { devFlag } from './dev';

/** 브이월드 타일 주소. 개발 서버에서 ?map=fail 이면 일부러 틀린 주소를 줘서 지도 오류 안내를 확인한다 */
export const tileUrl = (base: string, path: string) => (devFlag('map') === 'fail' ? `http://127.0.0.1:1/${path}` : `${base}/${path}`);
