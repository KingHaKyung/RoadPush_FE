// api/its/urls.ts : 전국 고속도로·국도 CCTV 영상(HLS) 주소 목록 (ITS). ?format=csv면 CSV 내려받기
import { itsUrls, urlsCsv } from '../_its.js';

export async function GET(request: Request) {
  const key = (process.env.ITS_API_KEY ?? '').trim();
  if (!key) return new Response('{"error":"ITS_API_KEY가 없습니다"}', { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const csv = new URL(request.url).searchParams.get('format') === 'csv';
  // 영상 주소는 만료되므로 길게 두지 않되, 호출 한도를 아끼려고 30분은 CDN에 둔다
  const cache = { 'Cache-Control': 'public, max-age=300, s-maxage=1800' };
  try {
    const r = await itsUrls(key);
    return csv
      ? new Response(urlsCsv(r), { headers: { ...cache, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="its-cctv-urls.csv"' } })
      : new Response(JSON.stringify(r), { headers: { ...cache, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}
