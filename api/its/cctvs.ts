// api/its/cctvs.ts : 전국 고속도로·국도 CCTV 위치 (ITS)
import { itsList } from '../_its.js';

export async function GET() {
  const key = (process.env.ITS_API_KEY ?? '').trim();
  const json = { 'Content-Type': 'application/json; charset=utf-8' };
  if (!key) return new Response(JSON.stringify({ error: 'ITS_API_KEY가 없습니다', cctvs: [] }), { status: 500, headers: json });
  try {
    return new Response(await itsList(key), {
      // 전국 조회가 30초쯤 걸려 CDN에 6시간 두고, 지난 뒤에도 하루 동안은 옛 목록을 주며 뒤에서 새로 받는다
      headers: { ...json, 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, cctvs: [] }), { status: 502, headers: json });
  }
}
