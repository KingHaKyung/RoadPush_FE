import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * krds-uiux 1.1.0의 component.css는 아이콘을 '../../img/img/component/...'로 가리키지만
 * 실제 파일은 'resources/img/component/...'에 있다. KRDS CSS를 읽을 때 경로를 바로잡는다.
 */
const krdsImgPath: Plugin = {
  name: 'krds-img-path',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('krds-uiux') && id.split('?')[0].endsWith('.css')) return code.split('../../img/img/').join('../../img/');
  },
};

/**
 * 브이월드 배경지도 프록시: 브라우저는 /vworld/wmts/... 로 요청하고, 개발 서버가 키를 붙여 브이월드로 넘긴다.
 * 키(.env의 VWORLD_KEY, VITE_ 접두사 없음)는 브라우저 코드에 들어가지 않는다.
 * 배포할 때는 같은 경로를 백엔드나 리버스 프록시가 처리해야 한다 (없으면 약도로 전환).
 */
function vworldProxy(key: string): Record<string, ProxyOptions> {
  if (!key) return {};
  return {
    '/vworld/wmts/': {
      target: 'https://api.vworld.kr',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/vworld\/wmts\//, `/req/wmts/1.0.0/${encodeURIComponent(key)}/`),
      // 브이월드는 인증키에 등록한 서비스 URL을 Referer로 확인한다
      headers: { Referer: 'http://localhost:5173/' },
    },
  };
}

/**
 * UTIC CCTV 영상: /api/utic/player?cctvid=... 로 부르면 UTIC 개방데이터 재생 페이지 주소로 보낸다(302).
 * 재생 페이지에 필요한 카메라 정보(종류·접속값)는 UTIC가 세션이 있을 때만 주므로, 서버가 재생 페이지로 세션을 열고 받아 둔다.
 * UTIC는 등록한 IP 대역에서만 응답·재생하고, 같은 주소를 1초에 5번 넘게 부르면 IP를 차단한다 → 요청 간격 1.1초, 카메라 정보는 캐시.
 * 배포할 때는 같은 경로를 등록 IP의 백엔드가 처리해야 한다.
 */
function uticPlayer(key: string): Plugin {
  const BASE = 'https://www.utic.go.kr';
  const info = new Map<string, Record<string, string | null>>();
  let cookie = '', cookieAt = 0, last = 0;
  const gap = async () => { const d = 1100 - (Date.now() - last); if (d > 0) await new Promise((r) => setTimeout(r, d)); last = Date.now(); };
  return {
    name: 'utic-player',
    configureServer(server) {
      server.middlewares.use('/api/utic/player', async (req, res) => {
        try {
          if (!key) throw new Error('.env에 UTIC_API_KEY가 없습니다');
          const id = new URL((req as { url?: string }).url ?? '', 'http://x').searchParams.get('cctvid') ?? '';
          if (!/^[A-Za-z0-9]{3,16}$/.test(id)) { res.statusCode = 400; res.end('cctvid가 올바르지 않습니다'); return; }
          let c = info.get(id);
          if (!c) {
            if (!cookie || Date.now() - cookieAt > 10 * 60e3) {
              await gap();
              const r = await fetch(`${BASE}/jsp/map/openDataCctvStream.jsp?key=${encodeURIComponent(key)}&cctvid=${id}`);
              cookie = r.headers.getSetCookie().map((v) => v.split(';')[0]).join('; ');
              cookieAt = Date.now();
            }
            await gap();
            const r2 = await fetch(`${BASE}/map/getCctvInfoById.do?cctvId=${id}`, { headers: { cookie, referer: `${BASE}/jsp/map/openDataCctvStream.jsp` } });
            const j = await r2.json();
            if (!j?.CCTVID) { cookie = ''; throw new Error(j?.msg ?? 'UTIC에서 카메라 정보를 받지 못했습니다'); }
            c = j as Record<string, string | null>;
            info.set(id, c);
          }
          const v = (x: string | null | undefined) => (x == null || x === '' ? 'undefined' : String(x));
          const q = new URLSearchParams({
            key, cctvid: id, cctvName: encodeURIComponent(c.CCTVNAME ?? ''), kind: v(c.KIND), cctvip: v(c.CCTVIP),
            cctvch: v(c.CH), id: v(c.ID), cctvpasswd: v(c.PASSWD), cctvport: v(c.PORT),
          });
          res.statusCode = 302;
          res.setHeader('Location', `${BASE}/jsp/map/openDataCctvStream.jsp?${q}`);
          res.end();
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<p style="font-family:sans-serif;padding:16px">영상을 불러오지 못했습니다: ${(e as Error).message}</p>`);
        }
      });
    },
  };
}

/**
 * ITS 국가교통정보센터 CCTV (키: .env의 ITS_API_KEY, 응답에는 넣지 않는다)
 * - /api/its/cctvs : 전국 고속도로(ex)·국도(its) CCTV 위치. 전국 응답은 약 4MB·30초라 처음 요청 때 받아 6시간 캐시한다.
 *                    영상 주소는 빼고 보낸다 (시간이 지나면 바뀌고 용량만 크다).
 * - /api/its/stream?type=&name=&lat=&lng= : 카메라를 열 때 그 주변만 다시 조회해 지금의 HLS 주소를 준다.
 * 영상은 등록 IP 제한 없이 브라우저에서 바로 재생된다. 배포할 때는 같은 경로를 백엔드가 처리해야 한다.
 */
function itsCctv(key: string): Plugin {
  const KOREA = { minX: 124, maxX: 132, minY: 33, maxY: 39 };
  type Raw = { cctvname: string; coordx: number | string; coordy: number | string; cctvurl: string };
  const query = async (type: 'ex' | 'its', b: typeof KOREA): Promise<Raw[]> => {
    const q = new URLSearchParams({ apiKey: key, type, cctvType: '4', getType: 'json', ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)])) });
    const r = await fetch(`https://openapi.its.go.kr:9443/cctvInfo?${q}`);
    const j = await r.json();
    // 결과가 1개면 배열이 아니라 객체 하나로 온다
    const d = j?.response?.data;
    return Array.isArray(d) ? d : d ? [d] : [];
  };
  let cache: { at: number; body: string } | null = null;
  let loading: Promise<string> | null = null;
  const loadAll = () => (loading ??= Promise.all((['ex', 'its'] as const).map(async (type) => (await query(type, KOREA)).map((d) => ({
    id: `its-${type}-${(+d.coordy).toFixed(5)},${(+d.coordx).toFixed(5)}`,
    name: String(d.cctvname).replace(/^\[[^\]]+\]\s*/, ''),
    center: String(d.cctvname).match(/^\[([^\]]+)\]/)?.[1] ?? '',
    road: type === 'ex' ? '고속도로' : '국도',
    lat: +d.coordy, lng: +d.coordx, src: 'its', its: { type, name: String(d.cctvname) },
  }))))
    .then(([ex, its]) => {
      if (!ex.length && !its.length) throw new Error('ITS에서 CCTV 목록을 받지 못했습니다');
      const body = JSON.stringify({ source: 'ITS 국가교통정보센터', cctvs: [...ex, ...its] });
      cache = { at: Date.now(), body };
      return body;
    })
    .finally(() => { loading = null; }));
  return {
    name: 'its-cctv',
    configureServer(server) {
      server.middlewares.use('/api/its/cctvs', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          if (!key) throw new Error('.env에 ITS_API_KEY가 없습니다');
          res.end(cache && Date.now() - cache.at < 6 * 3600e3 ? cache.body : await loadAll());
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: (e as Error).message, cctvs: [] }));
        }
      });
      server.middlewares.use('/api/its/stream', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          if (!key) throw new Error('.env에 ITS_API_KEY가 없습니다');
          const p = new URL((req as { url?: string }).url ?? '', 'http://x').searchParams;
          const type = p.get('type'), name = p.get('name') ?? '', lat = Number(p.get('lat')), lng = Number(p.get('lng'));
          if ((type !== 'ex' && type !== 'its') || !Number.isFinite(lat) || !Number.isFinite(lng)) { res.statusCode = 400; res.end('{"error":"요청 값이 올바르지 않습니다"}'); return; }
          const d = 0.003;
          const list = await query(type, { minX: lng - d, maxX: lng + d, minY: lat - d, maxY: lat + d });
          const dist = (c: Raw) => Math.hypot(+c.coordy - lat, +c.coordx - lng);
          const hit = list.filter((c) => c.cctvname === name).sort((a, b) => dist(a) - dist(b))[0] ?? list.sort((a, b) => dist(a) - dist(b))[0];
          if (!hit) throw new Error('카메라를 찾지 못했습니다');
          res.end(JSON.stringify({ hls: hit.cctvurl }));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const vworldKey = (env.VWORLD_KEY ?? '').trim();
  const uticKey = (env.UTIC_API_KEY ?? '').trim();
  const itsKey = (env.ITS_API_KEY ?? '').trim();
  return {
    plugins: [krdsImgPath, uticPlayer(uticKey), itsCctv(itsKey), react()],
    // 키 값이 아니라 '프록시가 켜져 있는지'만 브라우저에 알린다
    define: { 'import.meta.env.VITE_VWORLD_PROXY': JSON.stringify(vworldKey ? '/vworld/wmts' : '') },
    server: {
      port: 5173,
      proxy: vworldProxy(vworldKey),
      // 큰 원본 데이터(zip·SHP)는 감시하지 않는다. 복사 중인 파일을 감시하면 EBUSY로 서버가 죽는다
      watch: { ignored: ['**/*.zip', '**/*.pdf', '**/*.xlsx', '**/*.xls', '**/*.csv', '**/data/raw/**', '**/public/nodelink/**'] },
    },
    preview: { proxy: vworldProxy(vworldKey) },
  };
});
