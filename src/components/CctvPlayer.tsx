import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { cctvPlayerUrl, itsStreamUrl, type Cctv } from '../lib/cctv';

/** 교통 CCTV 실시간 영상. ITS는 HLS를 큰 16:9 화면으로, UTIC는 재생 페이지(고정 크기)를 키워서 보여 준다 */
export function CctvPlayer({ cctv }: { cctv: Cctv }) {
  return cctv.src === 'its' ? <ItsVideo cctv={cctv} /> : <UticFrame cctv={cctv} />;
}

function ItsVideo({ cctv }: { cctv: Cctv }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    let hls: Hls | null = null, alive = true;
    setErr(''); setUrl(''); setCopied(false);
    // 영상 주소는 시간이 지나면 바뀌므로 열 때마다 새 주소를 받는다
    itsStreamUrl(cctv).then((r) => {
      if (!alive) return;
      if ('error' in r) { setErr(r.error); return; }
      const src = r.hls;
      setUrl(src);
      if (Hls.isSupported()) {
        hls = new Hls({ liveDurationInfinity: true });
        hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr('영상을 불러오지 못했습니다. 카메라 점검 중이거나 일시적으로 끊겼을 수 있습니다.'); });
        hls.loadSource(src);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = src;
      else { setErr('이 브라우저는 실시간 영상(HLS)을 재생하지 못합니다.'); return; }
      v.play().catch(() => {});
    });
    return () => { alive = false; hls?.destroy(); v.removeAttribute('src'); v.load(); };
  }, [cctv]);
  const copy = () => navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false));
  return (
    <>
      <div className="cctv-stage">
        <video ref={ref} className="cctv-video" controls muted playsInline autoPlay aria-label={`${cctv.name} 실시간 영상`} />
        {err && <p className="cctv-err" role="alert">{err}</p>}
      </div>
      {/* 개발자용: 지금 HLS 주소 (시간이 지나면 바뀐다) */}
      {url && (
        <div className="cctv-url">
          <button type="button" className="krds-btn xsmall tertiary" aria-expanded={showUrl} onClick={() => setShowUrl((s) => !s)}>
            영상 주소 {showUrl ? '닫기' : '보기'}
          </button>
          {showUrl && (
            <>
              <code>{url}</code>
              <button type="button" className="krds-btn xsmall secondary" onClick={copy}>{copied ? '복사됨' : '복사'}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * UTIC 재생 페이지(346×325 고정)에서 위쪽 제목 줄을 빼고 영상과 아래 안내 글만 잘라 보여 준다.
 * 다른 출처 페이지라 안을 고칠 수 없으므로, 확대한 iframe을 창 안에서 옮겨 필요한 부분만 보이게 한다.
 */
const UTIC_W = 346, UTIC_H = 325;
const CROP = { x: 8, y: 40, w: 330, h: 282 };
function UticFrame({ cctv }: { cctv: Cctv }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1.8);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(Math.min(e.contentRect.width / CROP.w, (window.innerHeight - 240) / CROP.h)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="cctv-stage utic">
      <div className="utic-crop" style={{ width: CROP.w * k, height: CROP.h * k }}>
        <iframe src={cctvPlayerUrl(cctv.id)} title={`${cctv.name} 실시간 영상`}
          style={{ width: UTIC_W, height: UTIC_H, transform: `translate(${-CROP.x * k}px, ${-CROP.y * k}px) scale(${k})` }} />
      </div>
    </div>
  );
}
