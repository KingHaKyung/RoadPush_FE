import { useEffect, useRef } from 'react';
import type { Observation, ObservationPatch } from '../types';
import { ObservationDetail } from './ObservationDetail';

export function Drawer({ o, onClose, onUpdate }: { o: Observation | null; onClose: () => void; onUpdate: (id: string, p: ObservationPatch, log?: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!o) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [o, onClose]);
  if (!o) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label="관측 상세">
        <button ref={closeRef} type="button" className="btn close" onClick={onClose}>닫기</button>
        <ObservationDetail key={o.id} o={o} onUpdate={(p, l) => onUpdate(o.id, p, l)} />
      </aside>
    </>
  );
}
