import { useState } from 'react';
import { KakaoRiskMap } from './KakaoRiskMap';
import { SvgRiskMap } from './SvgRiskMap';
import type { RiskMapProps } from './types';

const KAKAO_KEY = (import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined)?.trim();

/** 카카오맵 키가 있으면 실제 지도, 없거나 불러오지 못하면 표준노드링크 약도 */
export function RiskMap(props: RiskMapProps) {
  const [error, setError] = useState<string | null>(null);
  if (KAKAO_KEY && !error) return <KakaoRiskMap {...props} apiKey={KAKAO_KEY} onError={setError} />;
  return (
    <>
      <SvgRiskMap {...props} />
      {error && <div className="map-note" role="status">{error} · 약도로 표시합니다</div>}
    </>
  );
}
