// api/roads.ts : /api/roads?t=1495_5084 → 그 타일의 표준노드링크 도로 (브이월드 데이터 API)
import { roadTile } from './_roads.js';

export async function GET(request: Request) {
  const key = (process.env.VWORLD_KEY ?? '').trim();
  if (!key) return new Response('VWORLD_KEY가 없습니다', { status: 500 });
  // 데이터 API는 인증키에 등록한 서비스 URL(domain)이 맞아야 응답한다
  const domain = (process.env.VWORLD_REFERER ?? 'https://road-push-fe.vercel.app/').replace(/\/$/, '');
  const t = new URL(request.url).searchParams.get('t') ?? '';
  try {
    return new Response(await roadTile(t, key, domain), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // 도로망은 거의 안 바뀌므로 CDN에 오래 둔다 → 브이월드 호출 횟수 절약
        'Cache-Control': 'public, max-age=86400, s-maxage=2592000',
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof RangeError ? 400 : 502 });
  }
}
