import { useState } from 'react';
import { EmptyState } from '../EmptyState';
import { SvgRiskMap } from './SvgRiskMap';
import type { RiskMapProps } from './types';
import { VWorldRiskMap } from './VWorldRiskMap';

/** 브이월드 타일 경로 (개발 서버 프록시가 키를 붙인다). 비어 있으면 약도 */
const VWORLD_TILES = (import.meta.env.VITE_VWORLD_PROXY as string | undefined)?.trim();

/**
 * 브이월드 키가 있으면 실제 지도, 없으면 표준노드링크 약도.
 * 키가 있는데 타일을 못 받으면 오류 안내 (약도는 예시 지역만 그려서 바로 바꾸지 않고 고르게 한다)
 */
export function RiskMap(props: RiskMapProps) {
  const [error, setError] = useState<string | null>(null);
  const [schematic, setSchematic] = useState(false);
  if (VWORLD_TILES && !error && !schematic) return <VWorldRiskMap {...props} tileBase={VWORLD_TILES} onError={setError} />;
  if (error && !schematic) return (
    <div className="map-error">
      <EmptyState kind="offline" title="배경지도를 불러오지 못했습니다" desc="브이월드 지도 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => setError(null) }} more={{ label: '약도로 보기', onClick: () => setSchematic(true) }} />
    </div>
  );
  return (
    <>
      <SvgRiskMap {...props} />
      {schematic && VWORLD_TILES && (
        <div className="map-note" role="status">
          약도로 보는 중 · <button type="button" className="map-note-btn" onClick={() => { setSchematic(false); setError(null); }}>지도 다시 불러오기</button>
        </div>
      )}
    </>
  );
}
