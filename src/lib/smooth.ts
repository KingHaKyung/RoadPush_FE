// 데이터가 바뀔 때 화면을 부드럽게: 이전 화면에서 새 화면으로 서서히 겹쳐 바꾼다 (자리 이동 없이 페이드).
// 브라우저 View Transitions를 쓰고, 지원하지 않는 브라우저·동작 줄이기 설정·모달이 열린 상태에서는 바로 바꾼다.
import { flushSync } from 'react-dom';

type VT = Document & { startViewTransition?: (cb: () => void) => unknown };

export function smooth(fn: () => void) {
  const d = document as VT;
  if (!d.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches || d.querySelector('.modal-wrap')) { fn(); return; }
  d.startViewTransition(() => flushSync(fn));
}
