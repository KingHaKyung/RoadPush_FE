import type { Pass } from '../../types';

/** 지도에 그릴 구간 상태 (관측 없는 링크는 null) */
export type SegStatus = { pass: Pass; shown: boolean } | null;

export interface RiskMapProps {
  statusOf: (segId: string) => SegStatus;
  selected: string | null;
  onSelect: (segId: string) => void;
  /** 값이 바뀌면 해당 구간으로 이동 */
  focusKey: number;
}
