// api/vworld.ts
export async function GET(request: Request) {
  const key = (process.env.VWORLD_KEY ?? '').trim();
  if (!key) return new Response('VWORLD_KEY가 없습니다', { status: 500 });

  // /vworld/wmts/white/15/12345/27890.png → path=white/15/12345/27890.png
  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!/^[A-Za-z0-9_\-./]+$/.test(path) || path.includes('..')) {
    return new Response('잘못된 경로', { status: 400 });
  }

  const upstream = await fetch(
    `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/${path}`,
    { headers: { Referer: process.env.VWORLD_REFERER ?? 'https://road-push-fe.vercel.app/' } },
  );

  if (!upstream.ok) return new Response(null, { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // 타일은 거의 안 바뀌므로 CDN 캐시를 길게 → 함수 호출·브이월드 호출 횟수 절약
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}