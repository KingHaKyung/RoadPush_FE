import { useEffect, useRef, type ReactNode } from 'react';

/** 화면 가운데 큰 창. Esc·바깥 누르기·닫기 버튼으로 닫고, 닫으면 열기 전 위치로 포커스를 돌려준다 */
export function Modal({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Tab이 창 밖으로 나가지 않게 처음·끝에서 돌린다
      if (e.key === 'Tab' && boxRef.current) {
        const f = [...boxRef.current.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; back?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="modal-box" role="dialog" aria-modal="true" aria-label={label}>
        <button ref={closeRef} type="button" className="krds-btn small tertiary modal-close" onClick={onClose}>닫기</button>
        {children}
      </div>
    </div>
  );
}
