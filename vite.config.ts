import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { dongOf } from './api/_address';
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
      // /api/address?lat=&lng= : 좌표 → 동 단위 지역 이름 (배포 환경의 api/address.ts와 같은 동작)
      server.middlewares.use('/api/address', async (req, res) => {
        const p = new URL((req as { url?: string }).url ?? '', 'http://x').searchParams;
        try {
          if (!key) throw new Error('.env에 VWORLD_KEY가 없습니다');
          const body = JSON.stringify(await dongOf(Number(p.get('lat')), Number(p.get('lng')), key, domain));
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
  return {
    plugins: [
      krdsImgPath, vworldRoads(vworldKey, (env.VWORLD_REFERER ?? 'https://road-push-fe.vercel.app/').replace(/\/$/, '')), react(),
      // npm run dev:https → 자체 서명 인증서로 https 개발 서버. 휴대폰에서 '현재 위치'를 쓰려면 https여야 한다
      ...(mode === 'https' ? [basicSsl()] : []),
    ],
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
