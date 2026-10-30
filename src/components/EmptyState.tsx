import type { ReactNode } from 'react';

/**
 * 빈 화면 그림. 화면마다 따로 그린다 (모두 배경 원 가운데 80,66 기준)
 * empty: 관측 목록, 들어온 관측 없음(겹친 사진) · search: 검색 결과 없음(보도 위 돋보기)
 * review: 판단 유보, 검수할 건 없음(검수표와 확인 표시) · map: 위험 지도, 점검할 지점 없음(접힌 지도와 초록 핀)
 * offline: 배경지도를 불러오지 못함(빈 지도 칸과 끊긴 표시) · server: 백엔드 연결 실패(빠진 플러그)
 * broken: 화면 코드 오류(금 간 창)
 */
type Kind = 'empty' | 'search' | 'review' | 'map' | 'offline' | 'server' | 'broken';

/** 초록 확인 표시 (검수 끝) */
const Check = ({ x, y }: { x: number; y: number }) => (
  <g>
    <circle cx={x} cy={y} r="15" fill="#2BA884" stroke="#fff" strokeWidth="3" />
    <path d={`M${x - 7} ${y}l5 5 10-11`} stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </g>
);

const ART: Record<Kind, ReactNode> = {
  // 사진 두 장이 겹친 모양 (원 가운데 80,66 기준)
  empty: (
    <>
      <rect x="50" y="38" width="64" height="50" rx="6" fill="#E3E4FA" transform="rotate(-8 82 63)" />
      <rect x="46" y="42" width="68" height="52" rx="6" fill="#fff" stroke="#A6A8EA" strokeWidth="2" />
      <path d="M53 87l17-19 11 11 9-8 17 16z" fill="#C7C8F3" />
      <circle cx="98" cy="56" r="6" fill="#5B5ECF" />
    </>
  ),
  // 보도 블록 위 돋보기
  search: (
    <>
      <polygon points="38,92 122,92 106,44 54,44" fill="#E3E4FA" />
      <path d="M49 60h62M43 76h74M71 44l-5 48M89 44l5 48" stroke="#C7C8F3" strokeWidth="2" fill="none" />
      <circle cx="78" cy="62" r="18" fill="#fff" fillOpacity=".85" stroke="#5B5ECF" strokeWidth="5" />
      <path d="M91 75l14 14" stroke="#5B5ECF" strokeWidth="8" strokeLinecap="round" />
    </>
  ),
  // 검수표(집게 + 항목 줄) 오른쪽 아래에 확인 표시
  review: (
    <>
      <rect x="54" y="34" width="52" height="64" rx="6" fill="#fff" stroke="#A6A8EA" strokeWidth="2" />
      <rect x="68" y="29" width="24" height="10" rx="3" fill="#5B5ECF" />
      <path d="M64 54h32M64 66h32M64 78h18" stroke="#C7C8F3" strokeWidth="3" strokeLinecap="round" />
      <Check x={104} y={88} />
    </>
  ),
  // 세 폭으로 접힌 지도 + 길 + 초록 핀(위험 없음)
  map: (
    <>
      <polygon points="44,46 68,40 92,46 116,40 116,88 92,94 68,88 44,94" fill="#fff" stroke="#A6A8EA" strokeWidth="2" strokeLinejoin="round" />
      <polygon points="68,40 92,46 92,94 68,88" fill="#E3E4FA" />
      <path d="M48 80c14-6 26 4 40-4s18-12 24-14" stroke="#C7C8F3" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M80 80c-10-11-14-17-14-23a14 14 0 0 1 28 0c0 6-4 12-14 23z" fill="#2BA884" stroke="#fff" strokeWidth="2" />
      <path d="M74 57l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // 타일이 비어 점선으로 남은 지도 칸 + 오른쪽 아래 경고 표시
  offline: (
    <>
      <rect x="46" y="38" width="64" height="54" rx="6" fill="#fff" stroke="#A6A8EA" strokeWidth="2" />
      <path d="M78 40v50M48 65h60" stroke="#C7C8F3" strokeWidth="2" strokeDasharray="4 4" />
      <rect x="51" y="43" width="23" height="18" rx="2" fill="#E3E4FA" />
      <circle cx="106" cy="86" r="15" fill="#F2A93B" stroke="#fff" strokeWidth="3" />
      <path d="M106 78v9" stroke="#2A2214" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="106" cy="93" r="2" fill="#2A2214" />
    </>
  ),
  // 콘센트에서 빠진 플러그 + 사이의 끊김 표시
  server: (
    <>
      <path d="M32 66h26M118 66h10" stroke="#A6A8EA" strokeWidth="4" strokeLinecap="round" />
      <rect x="58" y="54" width="20" height="24" rx="4" fill="#5B5ECF" />
      <rect x="78" y="58" width="8" height="4" rx="1" fill="#292A66" />
      <rect x="78" y="70" width="8" height="4" rx="1" fill="#292A66" />
      <rect x="96" y="50" width="22" height="32" rx="5" fill="#fff" stroke="#A6A8EA" strokeWidth="2" />
      <rect x="100" y="58" width="6" height="4" rx="1" fill="#C7C8F3" />
      <rect x="100" y="70" width="6" height="4" rx="1" fill="#C7C8F3" />
      <path d="M91 50l-2-7M91 82l-2 7" stroke="#F2A93B" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // 브라우저 창에 금이 간 모양
  broken: (
    <>
      <rect x="44" y="36" width="72" height="56" rx="6" fill="#fff" stroke="#A6A8EA" strokeWidth="2" />
      <path d="M45 48h70" stroke="#C7C8F3" strokeWidth="2" />
      <circle cx="51" cy="42" r="2" fill="#C7C8F3" /><circle cx="57" cy="42" r="2" fill="#C7C8F3" /><circle cx="63" cy="42" r="2" fill="#C7C8F3" />
      <path d="M86 49l-7 13 10 8-8 21" stroke="#E25563" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

/** 처음 불러오는 동안 (빈 안내가 먼저 보이지 않게) */
export function Loading({ label }: { label: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p className="es-desc">{label}</p>
    </div>
  );
}

type Act = { label: string; onClick: () => void };

/**
 * 비었거나 못 불러왔을 때: 그림 + 무슨 상황인지 + 다음에 할 일 (버튼은 있을 때만)
 * more: 두 번째(가벼운) 버튼 · small: 좁은 칸(시민 제보 지도)용으로 그림을 줄인다
 */
export function EmptyState({ kind, title, desc, action, more, small }: { kind: Kind; title: string; desc?: string; action?: Act; more?: Act; small?: boolean }) {
  return (
    <div className={`empty-state${small ? ' sm' : ''}`} role={kind === 'offline' || kind === 'server' || kind === 'broken' ? 'status' : undefined}>
      <svg viewBox="0 0 160 120" width={small ? 96 : 160} height={small ? 72 : 120} aria-hidden="true">
        <circle cx="80" cy="66" r="52" fill="#F1F1FD" />
        {ART[kind]}
      </svg>
      <p className="es-title">{title}</p>
      {desc && <p className="es-desc">{desc}</p>}
      {(action || more) && (
        <div className="es-actions">
          {action && <button type="button" className="krds-btn small secondary" onClick={action.onClick}>{action.label}</button>}
          {more && <button type="button" className="krds-btn small tertiary" onClick={more.onClick}>{more.label}</button>}
        </div>
      )}
    </div>
  );
}
