/** 목록을 한 번에 다 그리지 않고 나눠 보여 줄 때 아래에 두는 '더 보기' (남은 건수와 함께) */
export function MoreButton({ shown, total, step, onMore }: { shown: number; total: number; step: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <button type="button" className="krds-btn small tertiary more-btn" onClick={onMore}>
      더 보기 <span>{Math.min(step, total - shown)}건 / 남은 {total - shown}건</span>
    </button>
  );
}
