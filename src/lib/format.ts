const p2 = (n: number) => String(n).padStart(2, '0');

/** 10/18 14:32 형식 */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function addMinutes(iso: string, m: number, cap: Date): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + m);
  return (d > cap ? new Date(cap.getTime() - 60_000) : d).toISOString();
}
