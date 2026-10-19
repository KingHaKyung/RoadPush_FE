import type { Period } from '../types';

const OPTS: [Period, string][] = [['today', '오늘'], ['3d', '최근 3일'], ['all', '전체']];

export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="seg" role="group" aria-label="기간">
      {OPTS.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
