// api/its/stream.ts : ?type=&name=&lat=&lng= → 그 카메라의 지금 HLS 주소 (ITS)
import { itsStream } from '../_its.js';

export async function GET(request: Request) {
  const key = (process.env.ITS_API_KEY ?? '').trim();
  const json = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (!key) return new Response('{"error":"ITS_API_KEY가 없습니다"}', { status: 500, headers: json });
  try {
    return new Response(await itsStream(key, new URL(request.url).searchParams), { headers: json });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: e instanceof RangeError ? 400 : 502, headers: json });
  }
}
