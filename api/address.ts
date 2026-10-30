// api/address.ts : /api/address?lat=37.51&lng=126.95 → { area: '서울특별시 동작구 본동' } (브이월드 역지오코딩)
import { dongOf } from './_address.js';

export async function GET(request: Request) {
  const key = (process.env.VWORLD_KEY ?? '').trim();
  if (!key) return new Response('VWORLD_KEY가 없습니다', { status: 500 });
  const domain = (process.env.VWORLD_REFERER ?? 'https://road-push-fe.vercel.app/').replace(/\/$/, '');
  const p = new URL(request.url).searchParams;
  try {
    const body = JSON.stringify(await dongOf(Number(p.get('lat')), Number(p.get('lng')), key, domain));
    // 같은 자리는 같은 동이라 CDN에 하루 둔다
    return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof RangeError ? 400 : 502 });
  }
}
