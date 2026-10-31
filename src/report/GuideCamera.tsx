import { useEffect, useRef, useState } from 'react';

/** 페이지 안에서 카메라를 쓸 수 있는지 (https·지원 브라우저). 안 되면 휴대폰 기본 카메라로 넘긴다 */
export const canUseGuideCamera = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

/**
 * 가이드선이 있는 촬영 화면. 휴대폰 기본 카메라 화면 위에는 그릴 수 없어서 페이지 안에 카메라를 띄운다.
 * 분석이 잘 되는 구도: 서서 정면, 보도가 뻗은 방향, 길 전체 폭이 보이게.
 * 가이드는 그 구도의 원근(화면 가운데 위로 모이는 길 양쪽 끝선)과 눈높이 선이다.
 * 이렇게 찍은 사진에는 위치 정보가 없지만, 방금 찍은 사진이라 제보 화면이 현재 위치를 바로 찾는다
 */
export function GuideCamera({ onShot, onClose, onFallback }: {
  onShot: (file: File) => void;
  onClose: () => void;
  /** 카메라를 열 수 없을 때 휴대폰 기본 카메라로 */
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 부모가 다시 그려져 onClose가 새로 만들어져도 카메라를 다시 켜지 않게 (처음 한 번만 연다)
  const closeCb = useRef(onClose);
  closeCb.current = onClose;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    closeRef.current?.focus();
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    }).then((s) => {
      if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = videoRef.current!;
      v.srcObject = s;
      v.onloadedmetadata = () => { setSize({ w: v.videoWidth, h: v.videoHeight }); v.play().catch(() => {}); };
    }).catch((e: DOMException) => {
      setError(e.name === 'NotAllowedError'
        ? '카메라 권한이 꺼져 있습니다. 브라우저 설정에서 카메라를 허용하거나 기본 카메라로 찍어 주세요.'
        : '카메라를 열지 못했습니다. 기본 카메라로 찍어 주세요.');
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCb.current(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  /** 지금 화면을 그대로 사진으로 (원본 해상도). 줄이기는 보낼 때 한다 */
  const shoot = () => {
    const v = videoRef.current; if (!v || !size || busy) return;
    setBusy(true);
    const c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    c.getContext('2d')!.drawImage(v, 0, 0, size.w, size.h);
    c.toBlob((b) => {
      setBusy(false);
      if (!b) { setError('사진을 만들지 못했습니다. 다시 눌러 주세요.'); return; }
      const now = Date.now();
      onShot(new File([b], `제보_${now}.jpg`, { type: 'image/jpeg', lastModified: now }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="gc" role="dialog" aria-modal="true" aria-label="가이드 촬영">
      <div className="gc-top">
        <button ref={closeRef} type="button" className="gc-close" onClick={onClose}>닫기</button>
        <p className="gc-tip">보도가 뻗은 방향을 보고 서서, 길 양쪽 끝이 선 안에 들어오게 찍어 주세요</p>
      </div>
      <div className="gc-stage">
        {/* 영상 비율 그대로의 틀: 가이드선이 찍히는 범위와 정확히 겹치게 */}
        <div className="gc-frame" style={size ? { ['--r' as string]: size.w / size.h } : undefined}>
          <video ref={videoRef} playsInline muted />
          {size && (
            <svg className="gc-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {/* 눈높이 선: 서서 정면으로 들면 길이 모이는 점이 이 선 위에 온다 */}
              <line x1="0" y1="40" x2="100" y2="40" className="gc-eye" />
              {/* 길 양쪽 끝선: 화면 가운데 위로 모인다. 길 전체 폭이 이 두 선 사이에 들어오게 */}
              <polyline points="4,100 50,40 96,100" className="gc-edge" />
              <circle cx="50" cy="40" r="1.2" className="gc-dot" />
            </svg>
          )}
          {size && <span className="gc-label gc-label-eye">눈높이</span>}
          {size && <span className="gc-label gc-label-edge">길 양쪽 끝</span>}
        </div>
        {error && (
          <div className="gc-error" role="alert">
            <p>{error}</p>
            <button type="button" className="krds-btn medium primary" onClick={onFallback}>기본 카메라로 찍기</button>
          </div>
        )}
      </div>
      <div className="gc-bottom">
        <button type="button" className="gc-shutter" onClick={shoot} disabled={!size || busy} aria-label="사진 찍기" />
      </div>
    </div>
  );
}
