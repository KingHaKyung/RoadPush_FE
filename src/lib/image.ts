/**
 * 사진을 줄여 받기. 공유 서버(Tailscale Funnel)가 느리고 백엔드에 썸네일이 아직 없어,
 * 배포 사이트에서는 Vercel 이미지 최적화(/_vercel/image)가 원본을 한 번 받아 줄여 두고 그다음부터 그걸 준다.
 * 허용 크기·서버 주소는 vercel.json의 images에 있다. 개발 서버에서는 원본 그대로
 */
const ON_VERCEL = import.meta.env.PROD && !/^(localhost|127\.|\[::1\])/.test(location.hostname);

/** vercel.json images.sizes와 같아야 한다 */
export const IMG_W = { thumb: 480, view: 1280 } as const;

export const sized = (url: string, w: number) =>
  (ON_VERCEL && url.startsWith('https://') ? `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75` : url);
