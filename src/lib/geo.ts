// 위경도 거리 계산 (짧은 거리용 평면 근사)
const M_LAT = 111320;
export const mPerLng = (lat: number) => M_LAT * Math.cos((lat * Math.PI) / 180);

/** 점과 폴리라인 사이 거리(m) */
export function distToLine([lat, lng]: [number, number], ll: [number, number][]): number {
  const kx = mPerLng(lat);
  let best = Infinity;
  for (let i = 1; i < ll.length; i++) {
    const ax = (ll[i - 1][1] - lng) * kx, ay = (ll[i - 1][0] - lat) * M_LAT;
    const bx = (ll[i][1] - lng) * kx, by = (ll[i][0] - lat) * M_LAT;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** 폴리라인 길이(m) */
export function lineMeters(ll: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < ll.length; i++) m += Math.hypot((ll[i][0] - ll[i - 1][0]) * M_LAT, (ll[i][1] - ll[i - 1][1]) * mPerLng(ll[i][0]));
  return Math.round(m);
}
