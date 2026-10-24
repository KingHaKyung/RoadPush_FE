// ITS 국가교통정보센터 CCTV (고속도로 ex · 국도 its). Vercel 함수(api/its/*)와 개발 서버(vite.config.ts)가 함께 쓴다.
// 영상(HLS)은 등록 IP 제한 없이 브라우저에서 바로 재생된다. 키는 서버에만 둔다.

const KOREA = { minX: 124, maxX: 132, minY: 33, maxY: 39 };
type Box = typeof KOREA;
type Raw = { cctvname: string; coordx: number | string; coordy: number | string; cctvurl: string };

async function query(key: string, type: 'ex' | 'its', b: Box): Promise<Raw[]> {
  const q = new URLSearchParams({ apiKey: key, type, cctvType: '4', getType: 'json', ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)])) });
  const r = await fetch(`https://openapi.its.go.kr:9443/cctvInfo?${q}`);
  const j = await r.json();
  // 호출 한도 초과 등은 header.resultMsg로만 알려 준다
  if (!j?.response && j?.header?.resultMsg) throw new Error(`ITS: ${j.header.resultMsg}`);
  // 결과가 1개면 배열이 아니라 객체 하나로 온다
  const d = j?.response?.data;
  return Array.isArray(d) ? d : d ? [d] : [];
}

/** 전국 CCTV 위치 (JSON 문자열). 영상 주소는 시간이 지나면 바뀌고 용량만 커서 뺀다. 약 30초 걸린다 */
export async function itsList(key: string): Promise<string> {
  const [ex, its] = await Promise.all((['ex', 'its'] as const).map(async (type) => (await query(key, type, KOREA)).map((d) => ({
    id: `its-${type}-${(+d.coordy).toFixed(5)},${(+d.coordx).toFixed(5)}`,
    name: String(d.cctvname).replace(/^\[[^\]]+\]\s*/, ''),
    center: String(d.cctvname).match(/^\[([^\]]+)\]/)?.[1] ?? '',
    road: type === 'ex' ? '고속도로' : '국도',
    lat: +d.coordy, lng: +d.coordx, src: 'its', its: { type, name: String(d.cctvname) },
  }))));
  if (!ex.length && !its.length) throw new Error('ITS에서 CCTV 목록을 받지 못했습니다');
  return JSON.stringify({ source: 'ITS 국가교통정보센터', cctvs: [...ex, ...its] });
}

/** 카메라 하나의 지금 HLS 주소: 그 주변만 다시 조회해 이름이 같은(없으면 가장 가까운) 카메라를 고른다 */
export async function itsStream(key: string, p: URLSearchParams): Promise<string> {
  const type = p.get('type'), name = p.get('name') ?? '', lat = Number(p.get('lat')), lng = Number(p.get('lng'));
  if ((type !== 'ex' && type !== 'its') || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new RangeError('요청 값이 올바르지 않습니다');
  const d = 0.003;
  const list = await query(key, type, { minX: lng - d, maxX: lng + d, minY: lat - d, maxY: lat + d });
  const dist = (c: Raw) => Math.hypot(+c.coordy - lat, +c.coordx - lng);
  const hit = list.filter((c) => c.cctvname === name).sort((a, b) => dist(a) - dist(b))[0] ?? list.sort((a, b) => dist(a) - dist(b))[0];
  if (!hit) throw new Error('카메라를 찾지 못했습니다');
  return JSON.stringify({ hls: hit.cctvurl });
}
