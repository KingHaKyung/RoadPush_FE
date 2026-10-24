import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { itsList, itsStream } from './api/_its';
import { roadTile } from './api/_roads';

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
 * ITS 국가교통정보센터 CCTV (키: .env의 ITS_API_KEY, 응답에는 넣지 않는다). 배포 환경의 api/its/*와 같은 동작.
 * - /api/its/cctvs : 전국 고속도로·국도 CCTV 위치. 약 30초 걸려 처음 요청 때 받아 6시간 캐시한다.
 * - /api/its/stream?type=&name=&lat=&lng= : 카메라를 열 때 지금의 HLS 주소를 준다.
 */
function itsCctv(key: string): Plugin {
  let cache: { at: number; body: string } | null = null;
  let loading: Promise<string> | null = null;
  const loadAll = () => (loading ??= itsList(key)
    .then((body) => { cache = { at: Date.now(), body }; return body; })
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
          res.end(await itsStream(key, new URL((req as { url?: string }).url ?? '', 'http://x').searchParams));
        } catch (e) {
          res.statusCode = e instanceof RangeError ? 400 : 502;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

/**
 * /api/roads?t= : 표준노드링크 도로 타일을 브이월드 데이터 API에서 받는다 (배포 환경의 api/roads.ts와 같은 동작).
 * public/nodelink/가 있으면 화면은 그 파일을 먼저 쓴다.
 */
function vworldRoads(key: string, domain: string): Plugin {
  return {
    name: 'vworld-roads',
    configureServer(server) {
      server.middlewares.use('/api/roads', async (req, res) => {
        const t = new URL((req as { url?: string }).url ?? '', 'http://x').searchParams.get('t') ?? '';
        try {
          if (!key) throw new Error('.env에 VWORLD_KEY가 없습니다');
          const body = await roadTile(t, key, domain);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        } catch (e) {
          res.statusCode = e instanceof RangeError ? 400 : 502;
          res.end((e as Error).message);
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
    plugins: [krdsImgPath, uticPlayer(uticKey), itsCctv(itsKey), vworldRoads(vworldKey, (env.VWORLD_REFERER ?? 'https://road-push-fe.vercel.app/').replace(/\/$/, '')), react()],
    // 키 값이 아니라 '프록시가 켜져 있는지'만 브라우저에 알린다
    // Vercel에서는 api/vworld.ts가 실행할 때 키를 읽으므로, 빌드 때 키가 없어도 프록시를 켠다
    define: { 'import.meta.env.VITE_VWORLD_PROXY': JSON.stringify(vworldKey || env.VERCEL ? '/vworld/wmts' : '') },
    server: {
      port: 5173,
      proxy: vworldProxy(vworldKey),
      // 큰 원본 데이터(zip·SHP)는 감시하지 않는다. 복사 중인 파일을 감시하면 EBUSY로 서버가 죽는다
      watch: { ignored: ['**/*.zip', '**/*.pdf', '**/*.xlsx', '**/*.xls', '**/*.csv', '**/data/raw/**', '**/public/nodelink/**'] },
    },
    preview: { proxy: vworldProxy(vworldKey) },
  };
});
