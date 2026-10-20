import { useId } from 'react';

/** 하나만 고르는 칩 묶음 (KRDS 라디오 칩 krds-form-chip) */
export function ChipGroup<T extends string>({ label, options, value, onChange }: {
  label: string; options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <div className="krds-check-area chip-group" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <div key={k} className="krds-form-chip small">
          <input type="radio" className="radio" name={name} id={`${name}-${k}`} checked={value === k} onChange={() => onChange(k)} />
          <label className="krds-form-chip-outline" htmlFor={`${name}-${k}`}>{l}</label>
        </div>
      ))}
    </div>
  );
}
