import { useCallback, useEffect, useState, useRef } from 'react';
import { Modal } from './components/Modal';
import { ObservationDetail } from './components/ObservationDetail';
import { Header } from './components/Header';
import { HoldView } from './components/HoldView';
import { ListView } from './components/ListView';
import { MapView } from './components/MapView';
import { Toast } from './components/Toast';
import { ACTIONS, PASS_KEYS } from './lib/constants';
import { useObservations } from './lib/useObservations';
import type { Filters, Tab } from './types';

const readTab = (): Tab => (['map', 'list', 'hold'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'map');

export default function App() {
  const { observations, update, error } = useObservations();
  const [tab, setTab] = useState<Tab>(readTab);
  const [filters, setFilters] = useState<Filters>({ period: '3d', src: new Set(['cctv', 'car', 'upload']), pass: new Set(PASS_KEYS), act: new Set(ACTIONS), q: '', sort: 'time', dept: '' });
  const [selSeg, setSelSeg] = useState<string | null>(null);
  const [selObs, setSelObs] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const on = () => { setTab(readTab()); setDrawerId(null); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // 화면을 바꾸면 새 화면 제목으로 포커스를 옮긴다 (처음 열 때는 제외)
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
  }, [tab]);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 1800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const toast = useCallback((m: string) => setToastMsg(m), []);
  const selectSeg = useCallback((id: string | null, focus = false) => {
    setSelSeg(id); setSelObs(null);
    if (focus || id === null) setFocusKey((k) => k + 1);
  }, []);
  const onUpdate = useCallback((ids: string | string[], patch: Parameters<typeof update>[1], log?: string) => {
    // 백엔드가 '지금은 할 수 없음'(409)으로 답하면 먼저 띄운 안내를 그 내용으로 바꾼다 (예시 데이터 모드는 안내 없음)
    Promise.resolve(update(ids, patch, log)).then((notice) => notice && toast(notice));
    if (!Array.isArray(ids) && patch.dept) toast('담당 부서를 바꿨습니다');
    else if (!Array.isArray(ids) && patch.action) toast('처리 상태를 바꿨습니다');
    else if (!Array.isArray(ids) && log?.startsWith('메모')) toast('메모를 기록했습니다');
  }, [update, toast]);

  const holdCount = observations.filter((o) => o.pass === 'hold' && !o.human).length;
  const closeDrawer = useCallback(() => setDrawerId(null), []);
  const drawerObs = drawerId ? observations.find((o) => o.id === drawerId) ?? null : null;

  return (
    <>
      <Header tab={tab} holdCount={holdCount} obs={observations} error={error} />
      <main id="content" tabIndex={-1}>
        {tab === 'map' && (
          <MapView obs={observations} filters={filters} setFilters={setFilters} selSeg={selSeg} selObs={selObs} focusKey={focusKey}
            selectSeg={selectSeg} setSelObs={setSelObs} onUpdate={onUpdate} />
        )}
        {tab === 'list' && <ListView obs={observations} filters={filters} setFilters={setFilters} onOpen={setDrawerId} onUpdate={onUpdate} toast={toast} />}
        {tab === 'hold' && <HoldView obs={observations} filters={filters} setFilters={setFilters} onUpdate={onUpdate} toast={toast} />}
      </main>
      {/* 관측 목록에서 항목을 누르면 화면 가운데 큰 창으로 */}
      <Modal open={!!drawerObs} label={drawerObs ? `${drawerObs.place} 관측 상세` : '관측 상세'} onClose={closeDrawer}>
        {drawerObs && <ObservationDetail key={drawerObs.id} o={drawerObs} layout="wide" onUpdate={(p, l) => onUpdate(drawerObs.id, p, l)} />}
      </Modal>
      <Toast message={toastMsg} />
    </>
  );
}
