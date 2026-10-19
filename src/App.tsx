import { useCallback, useEffect, useState } from 'react';
import { Drawer } from './components/Drawer';
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
  const { observations, update } = useObservations();
  const [tab, setTab] = useState<Tab>(readTab);
  const [filters, setFilters] = useState<Filters>({ period: '3d', src: new Set(['cctv', 'car']), pass: new Set(PASS_KEYS), act: new Set(ACTIONS), q: '', sort: 'time' });
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
    update(ids, patch, log);
    if (!Array.isArray(ids) && patch.dept) toast('담당 부서를 바꿨습니다');
    else if (!Array.isArray(ids) && patch.action) toast('처리 상태를 바꿨습니다');
    else if (!Array.isArray(ids) && log?.startsWith('메모')) toast('메모를 기록했습니다');
  }, [update, toast]);

  const holdCount = observations.filter((o) => o.pass === 'hold' && !o.human).length;
  const drawerObs = drawerId ? observations.find((o) => o.id === drawerId) ?? null : null;

  return (
    <>
      <Header tab={tab} holdCount={holdCount} />
      <main id="content" tabIndex={-1}>
        {tab === 'map' && (
          <MapView obs={observations} filters={filters} setFilters={setFilters} selSeg={selSeg} selObs={selObs} focusKey={focusKey}
            selectSeg={selectSeg} setSelObs={setSelObs} onUpdate={onUpdate} />
        )}
        {tab === 'list' && <ListView obs={observations} filters={filters} setFilters={setFilters} onOpen={setDrawerId} onUpdate={onUpdate} toast={toast} />}
        {tab === 'hold' && <HoldView obs={observations} onUpdate={onUpdate} toast={toast} />}
      </main>
      <Drawer o={drawerObs} onClose={() => setDrawerId(null)} onUpdate={onUpdate} />
      <Toast message={toastMsg} />
    </>
  );
}
