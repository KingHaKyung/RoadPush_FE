import type { Cctv, CctvRoad } from '../../lib/cctv';
import type { Pin } from '../../types';

export type { Pin };

export interface RiskMapProps {
  /** 필터를 통과한 관측 지점 */
  pins: Pin[];
  /** 선택한 핀 키 */
  selectedPin: string | null;
  onPickPin: (pin: Pin) => void;
  /** 목록에서 마우스를 올린 지점 (지도에서 강조) */
  hoverPin?: string | null;
  /** 지도에 표시할 교통 CCTV 도로 종류와 눌렀을 때 */
  cctvRoads?: CctvRoad[];
  onPickCctv?: (c: Cctv) => void;
  /** 선택한 도로 링크 (도로를 눌렀을 때) */
  selected: string | null;
  onSelect: (segId: string) => void;
  /** 값이 바뀌면 선택한 핀(없으면 링크)으로 이동 */
  focusKey: number;
}
