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
  /** 선택한 도로 링크 (도로를 눌렀을 때) */
  selected: string | null;
  onSelect: (segId: string) => void;
  /** 값이 바뀌면 선택한 핀(없으면 링크)으로 이동 */
  focusKey: number;
  /** 값이 바뀌면(필터를 바꾸면) 남은 핀이 모두 보이게 지도를 옮긴다 */
  fitKey?: string;
}
