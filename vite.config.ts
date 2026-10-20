import { defineConfig, type Plugin } from 'vite';
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

export default defineConfig({
  plugins: [krdsImgPath, react()],
  server: {
    port: 5173,
    // 큰 원본 데이터(zip·SHP)는 감시하지 않는다. 복사 중인 파일을 감시하면 EBUSY로 서버가 죽는다
    watch: { ignored: ['**/*.zip', '**/*.pdf', '**/data/raw/**', '**/public/nodelink/**'] },
  },
});
