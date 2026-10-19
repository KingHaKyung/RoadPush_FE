import { useState } from 'react';
import { SvgRiskMap } from './SvgRiskMap';
import type { RiskMapProps } from './types';
import { VWorldRiskMap } from './VWorldRiskMap';

const VWORLD_KEY = (import.meta.env.VITE_VWORLD_KEY as string | undefined)?.trim();

/** 브이월드 키가 있으면 실제 지도, 없거나 불러오지 못하면 표준노드링크 약도 */
export function RiskMap(props: RiskMapProps) {
  const [error, setError] = useState<string | null>(null);
  if (VWORLD_KEY && !error) return <VWorldRiskMap {...props} apiKey={VWORLD_KEY} onError={setError} />;
  return (
    <>
      <SvgRiskMap {...props} />
      {error && <div className="map-note" role="status">{error} · 약도로 표시합니다</div>}
    </>
  );
}
