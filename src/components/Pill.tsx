import { PASS } from '../lib/constants';
import type { Pass } from '../types';

export function Pill({ pass }: { pass: Pass | 'none' }) {
  if (pass === 'none') return <span className="pill" style={{ ['--c' as string]: 'var(--faint)' }}>관측 없음</span>;
  return <span className={`pill ${pass}`} style={{ ['--c' as string]: PASS[pass].color }}>{PASS[pass].label}</span>;
}
