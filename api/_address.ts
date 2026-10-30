// 좌표 → 동 단위 지역 이름 (브이월드 역지오코딩 getAddress). 시민 제보 화면의 '현재 내 위치(…동)' 안내에 쓴다.
// Vercel 함수(api/address.ts)와 개발 서버(vite.config.ts)가 함께 쓴다.

/** '서울특별시 동작구 본동'처럼 시도 + 시군구 + 법정동. 주소가 없는 곳(바다 등)이면 null */
export async function dongOf(lat: number, lng: number, key: string, domain: string): Promise<{ area: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError('좌표가 올바르지 않습니다');
  const q = new URLSearchParams({
    service: 'address', request: 'getAddress', version: '2.0', crs: 'epsg:4326', point: `${lng},${lat}`,
    format: 'json', type: 'parcel', zipcode: 'false', simple: 'true', key, domain,
  });
  const res = await fetch(`https://api.vworld.kr/req/address?${q}`, { headers: { Referer: `${domain}/` } });
  if (!res.ok) throw new Error(`브이월드 응답 ${res.status}`);
  const j = await res.json();
  if (j.response?.status === 'NOT_FOUND') return null;
  if (j.response?.status !== 'OK') throw new Error('브이월드 주소 변환 실패');
  const s = j.response.result[0].structure;
  return { area: [s.level1, s.level2, s.level4L].filter(Boolean).join(' ') };
}
