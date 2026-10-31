// 제보 사진: 브라우저에서 촬영 정보(EXIF)를 읽고, 보내기 전에 줄인다.
// 전에는 정보를 읽으려고 원본을 서버에 한 번, 접수할 때 또 한 번 올려서 큰 사진이면 오래 걸렸다
import exifr from 'exifr';

export interface PhotoMeta {
  /** 촬영 시각 (사진에 없으면 null) */
  at: Date | null;
  /** 촬영 위치 (사진에 없으면 null) */
  gps: { lat: number; lng: number } | null;
}

/** 대한민국 대략 범위 (사진 위치가 엉뚱한 곳인지 거르는 데만 쓴다) */
export const inKorea = (lat: number, lng: number) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

/** 사진의 촬영 시각·위치. 정보가 없거나 읽지 못하면 비워서 돌려준다 (실패해도 제보는 계속) */
export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  const [tags, gps] = await Promise.all([
    exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null),
    exifr.gps(file).catch(() => null),
  ]);
  const at = tags?.DateTimeOriginal ?? tags?.CreateDate ?? null;
  return {
    at: at instanceof Date && !Number.isNaN(at.getTime()) ? at : null,
    gps: gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) ? { lat: gps.latitude, lng: gps.longitude } : null,
  };
}

/** 브라우저가 열 수 있는 사진인지 (깨진 파일·브라우저가 못 여는 형식이면 거절) */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('decode'));
    img.src = url;
  });
}

/**
 * 보내기 전에 긴 변 1600px JPEG로 줄인다. AI는 640px(장애물)·짧은 변 480px(보도 영역)로 줄여 보므로 충분하고,
 * 공유 서버로 올리는 속도가 초당 수백 KB라 크기가 곧 기다리는 시간이다 (수 MB 사진이 200~300KB가 된다).
 * 회전 정보는 브라우저가 반영해 그리므로 줄인 사진도 똑바로 선다. 줄여도 작아지지 않으면 원본 그대로
 */
export async function shrinkPhoto(file: File, url: string, max = 1600, quality = 0.82): Promise<File> {
  const img = await loadImage(url);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
}
