import type { Period } from '../types';
import { ChipGroup } from './ChipGroup';

const OPTS: [Period, string][] = [['today', '오늘'], ['3d', '최근 3일'], ['all', '전체']];

export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return <ChipGroup label="기간" options={OPTS} value={value} onChange={onChange} />;
}
