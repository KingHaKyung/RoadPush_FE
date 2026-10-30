import { useId } from 'react';
import { DEMO_NOW } from '../lib/constants';
import { addDays, dayStart, defaultRange, RANGE_MAX_DAYS, ymd } from '../lib/segments';
import type { DateRange, Filters, Period } from '../types';
import { ChipGroup } from './ChipGroup';

const OPTS: [Period, string][] = [['today', '오늘'], ['3d', '최근 3일'], ['range', '기간 선택']];
const DAYS = (r: DateRange) => Math.round((dayStart(r.to) - dayStart(r.from)) / 864e5) + 1;

/**
 * 기간: 오늘 · 최근 3일 · 기간 선택. 기간 선택이면 시작일~종료일 (오늘까지, 최대 RANGE_MAX_DAYS일).
 * 한쪽을 바꿔 최대 길이를 넘으면 다른 쪽을 끌어온다
 */
export function PeriodToggle({ f, onChange }: { f: Pick<Filters, 'period' | 'range'>; onChange: (p: Pick<Filters, 'period' | 'range'>) => void }) {
  const uid = useId();
  const today = ymd(DEMO_NOW);
  const pick = (period: Period) => onChange({ period, range: period === 'range' && f.period !== 'range' ? defaultRange() : f.range });
  const setFrom = (from: string) => {
    if (!from) return;
    const to = DAYS({ from, to: f.range.to }) > RANGE_MAX_DAYS ? [addDays(from, RANGE_MAX_DAYS - 1), today].sort()[0] : f.range.to < from ? from : f.range.to;
    onChange({ period: 'range', range: { from, to } });
  };
  const setTo = (to: string) => {
    if (!to) return;
    const from = DAYS({ from: f.range.from, to }) > RANGE_MAX_DAYS ? addDays(to, -(RANGE_MAX_DAYS - 1)) : f.range.from > to ? to : f.range.from;
    onChange({ period: 'range', range: { from, to } });
  };
  return (
    <>
      <ChipGroup label="기간" options={OPTS} value={f.period} onChange={pick} />
      {f.period === 'range' && (
        <div className="period-range" role="group" aria-label={`기간 선택 (최대 ${Math.round(RANGE_MAX_DAYS / 30)}개월)`}>
          <label className="vh" htmlFor={`${uid}-from`}>시작일</label>
          <input className="krds-input small" type="date" id={`${uid}-from`} value={f.range.from} min={addDays(today, -365)} max={today} onChange={(e) => setFrom(e.target.value)} />
          <span aria-hidden="true">~</span>
          <label className="vh" htmlFor={`${uid}-to`}>종료일</label>
          <input className="krds-input small" type="date" id={`${uid}-to`} value={f.range.to} min={addDays(today, -365)} max={today} onChange={(e) => setTo(e.target.value)} />
          <span className="period-hint">최대 3개월</span>
        </div>
      )}
    </>
  );
}
