import { useEffect, useId, useRef, useState } from 'react';
import { API_BASE } from '../api/client';
import { devFlag } from '../lib/dev';
import { addReportNote, dongName, siteCandidates, submitReport, warmUp, type SiteCandidates, type Source } from './api';
import { inKorea, loadImage, readPhotoMeta, shrinkPhoto } from './photo';
import { LocationMap } from './LocationMap';
import '../styles/report.css';

type Loc = { lat: number; lng: number; source: Source };

/** 한국 시간 ISO 8601 ('YYYY-MM-DDTHH:mm:ss+09:00') */
const kstIso = (d: Date) => `${new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 19)}+09:00`;
/** '2026년 10월 26일 17:00' */
const kstText = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 36e5);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const sizeText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const NOTE_MAX = 300;
/** 올릴 수 있는 사진: 백엔드(observations.py IMAGE_EXT)와 같은 확장자, 20MB 이하 */
const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const PHOTO_MAX = 20 * 1024 * 1024;
const LOC_TEXT: Record<Source, string> = { exif: '사진에 담긴 위치', device: '현재 내 위치', manual: '지도에서 고른 위치' };
/** 사진 예시 칸 (사진은 준비되면 넣는다) */
const PHOTO_EXAMPLES = [
  { ok: true, text: '보도 폭 전체가 보이게' },
  { ok: true, text: '막은 물건과 남은 길이 함께' },
  { ok: false, text: '너무 가까이 찍은 사진' },
  { ok: false, text: '어둡거나 흔들린 사진' },
];
const TIME_TEXT: Record<Source, string> = { exif: '사진에 담긴 시각', device: '사진 파일 시각', manual: '직접 고른 시각' };

/**
 * 도보 통행 단절 제보 (시민용 웹앱). 한 화면에서 사진과 위치를 받아 바로 보낸다.
 * 촬영 시각은 묻지 않는다: 사진 메타데이터(EXIF) 시각, 없으면 사진 파일 시각
 */
/** 이보다 최근에 찍은 사진은 '방금 찍은 사진'으로 보고 현재 위치를 쓴다 */
const JUST_TAKEN_MS = 10 * 60 * 1000;

export function ReportApp() {
  if (devFlag('crash')) throw new Error('개발용 화면 오류 (?crash=1)');
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [taken, setTaken] = useState<{ at: string; source: Source } | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const autoLoc = useRef(false);
  /** 지금 위치가 사진 때문에 정해진 것인지 (사진 위치, 또는 방금 찍은 사진이라 저절로 찾은 현재 위치). 사진을 바꾸거나 지우면 같이 비운다 */
  const fromPhoto = loc?.source === 'exif' || autoLoc.current;
  const [cands, setCands] = useState<SiteCandidates | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  /** 보내는 단계: 사진 줄이기 → 보내기 (버튼 글자로 알린다) */
  const [sending, setSending] = useState<'' | 'shrink' | 'send'>('');
  /** 사진을 올린 비율 (0~100). 다 올리고 서버 답을 기다리는 동안은 100 */
  const [sentPct, setSentPct] = useState(0);
  /** 사진에서 위치를 못 얻었을 때 할 일 (사진 칸 아래) */
  const [photoNote, setPhotoNote] = useState('');
  const [note, setNote] = useState('');
  /** 고른 파일이 형식·크기가 맞지 않을 때 사진 칸 아래 안내 */
  const [fileError, setFileError] = useState('');
  /** 배경지도를 못 불러옴: 지도를 누르라는 안내를 숨긴다 (지도 칸에 따로 안내가 나온다) */
  const [mapFailed, setMapFailed] = useState(false);
  /** 휴대폰 인터넷 연결 (끊기면 보내기 전에 알린다). 개발 중 ?offline=1 이면 끊긴 것으로 */
  const [online, setOnline] = useState(() => navigator.onLine && devFlag('offline') !== '1');
  useEffect(() => {
    if (devFlag('offline') === '1') return;
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  const [done, setDone] = useState<{ id: string; at: string; noteLost?: boolean } | null>(null);

  useEffect(() => { document.title = '보행 통로 제보 · RoadPush'; warmUp(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // 접수되면 화면 맨 위 제목으로 (화면 낭독기도 결과부터 읽게)
  useEffect(() => { window.scrollTo(0, 0); headRef.current?.focus(); }, [done]);
  // 위치가 바뀌면 근처에 이미 등록된 지점이 있는지 다시 본다
  useEffect(() => {
    if (!loc || !API_BASE) return;
    let alive = true;
    const t = setTimeout(() => siteCandidates(loc.lat, loc.lng).then((c) => alive && setCands(c)).catch(() => alive && setCands(null)), 300);
    return () => { alive = false; clearTimeout(t); };
  }, [loc]);
  // 위치 안내에 붙일 동 이름 (지도를 못 불러왔으면 브이월드도 안 될 테니 묻지 않는다)
  const [dong, setDong] = useState<string | null>(null);
  useEffect(() => {
    setDong(null);
    if (!loc || mapFailed) return;
    let alive = true;
    const t = setTimeout(() => dongName(loc.lat, loc.lng).then((d) => alive && setDong(d)), 300);
    return () => { alive = false; clearTimeout(t); };
  }, [loc, mapFailed]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    // 백엔드가 받는 형식·크기만 (안 맞으면 고르지 않은 것으로 하고 사진 칸 아래에 알린다)
    const dot = f.name.lastIndexOf('.');
    const ext = dot > 0 ? f.name.slice(dot).toLowerCase() : '';
    const now = `현재 사진: ${ext.slice(1).toUpperCase()} / ${sizeText(f.size)}`;
    // 확장자가 없으면 형식을 알 수 없어 지원하지 않는 파일로 본다
    const bad = !ext ? '지원하지 않는 파일입니다. JPG·PNG·WEBP 사진을 골라 주세요.'
      : !PHOTO_EXT.includes(ext) ? `JPG·PNG·WEBP 사진만 올릴 수 있습니다 (${now}).`
      : f.size > PHOTO_MAX ? `20MB 이하 사진만 올릴 수 있습니다 (${now}).` : '';
    setFileError(bad);
    if (bad) { if (fileRef.current) fileRef.current.value = ''; return; }
    // 브라우저가 열지 못하는 사진(깨진 파일 등)은 받지 않는다
    const url = URL.createObjectURL(f);
    try { await loadImage(url); } catch {
      URL.revokeObjectURL(url);
      setFileError('사진을 열 수 없습니다. 파일이 손상됐을 수 있어요. 다른 사진을 골라 주세요.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setError(''); setFile(f); setPreview(url); setPhotoNote('');
    // 화면을 연 지 오래됐으면 연결이 닫혔을 수 있어 사진을 고를 때 한 번 더 열어 둔다
    warmUp();
    // 사진 위치로 정한 곳은 새 사진에 맞춰 다시 정한다. 사용자가 고른 위치는 그대로 둔다
    if (fromPhoto) { setLoc(null); setCands(null); autoLoc.current = false; }
    setTaken({ at: kstIso(new Date(f.lastModified || Date.now())), source: 'device' });
    // 촬영 시각·위치는 브라우저에서 바로 읽는다 (서버에 원본을 따로 올리지 않는다)
    setReading(true);
    const meta = await readPhotoMeta(f);
    setReading(false);
    if (meta.at) setTaken({ at: kstIso(meta.at), source: 'exif' });
    // 사용자가 이미 지도나 현재 위치로 고른 곳이 있으면 덮지 않는다
    const userPicked = loc && !fromPhoto;
    if (meta.gps && inKorea(meta.gps.lat, meta.gps.lng)) {
      if (!userPicked) setLoc({ lat: meta.gps.lat, lng: meta.gps.lng, source: 'exif' });
    } else if (!userPicked && !meta.gps && Date.now() - (meta.at ?? new Date(f.lastModified || 0)).getTime() < JUST_TAKEN_MS) {
      // 휴대폰 브라우저(아이폰 Safari·안드로이드 Chrome)는 카메라로 찍어 넘긴 사진에서 위치 정보를 지운다.
      // 방금 찍은 사진이면 지금 서 있는 곳이 찍은 곳이므로 현재 위치를 바로 찾는다 (앨범의 지난 사진은 하지 않는다)
      setPhotoNote('');
      useMyLocation(true);
    } else if (!userPicked) {
      setPhotoNote(meta.gps
        ? "사진에 담긴 위치가 국내가 아니에요. 아래 지도에서 막힌 곳을 고르거나 '현재 위치 사용'을 눌러 주세요."
        : "사진에 위치 정보가 없어요. 아래 지도에서 막힌 곳을 고르거나 '현재 위치 사용'을 눌러 주세요.");
    }
  };
  const removePhoto = () => {
    setFile(null); setPreview(''); setTaken(null); setPhotoNote('');
    if (fromPhoto) { setLoc(null); setCands(null); autoLoc.current = false; }
    // 같은 사진을 다시 골라도 change가 일어나게 비운다
    if (fileRef.current) fileRef.current.value = '';
  };

  /** auto: 방금 찍은 사진이라 저절로 찾는 경우. 그사이 사용자가 지도에서 고른 곳은 덮지 않는다 */
  const useMyLocation = (auto = false) => {
    // 브라우저는 https 주소(또는 localhost)에서만 위치를 내준다
    if (!window.isSecureContext) { setError('현재 위치는 https 주소에서만 쓸 수 있습니다. 지도를 눌러 위치를 골라 주세요.'); return; }
    if (!navigator.geolocation) { setError('이 브라우저는 현재 위치를 지원하지 않습니다. 지도를 눌러 위치를 골라 주세요.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next: Loc = { lat: p.coords.latitude, lng: p.coords.longitude, source: 'device' };
        setLoc((cur) => {
          if (auto && cur?.source === 'manual') return cur;
          autoLoc.current = auto;
          return next;
        });
        setLocating(false);
      },
      (e) => {
        setError(e.code === e.PERMISSION_DENIED
          ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용하거나 지도를 눌러 골라 주세요.'
          : '현재 위치를 찾지 못했습니다. 잠시 뒤 다시 누르거나 지도를 눌러 골라 주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const near = cands?.sites[0];
  const road = cands?.nearby_links.find((l) => l.road)?.road;

  const send = async () => {
    if (!file || !loc) return;
    setSending('shrink'); setError(''); setSentPct(0);
    try {
      // 보내기 전에 줄인다 (원본이 수 MB여도 수백 KB로). 줄이지 못하면 원본 그대로
      const small = await shrinkPhoto(file, preview).catch(() => file);
      setSending('send');
      const r = await submitReport({
        file: small, capturedAt: taken?.at ?? kstIso(new Date()), capturedAtSource: taken?.source ?? 'device',
        lat: loc.lat, lng: loc.lng, locationSource: loc.source,
        ...(near ? { siteId: near.site.id } : { newSiteName: road ? `${road} 시민 제보` : '시민 제보 지점' }),
      }, (r) => setSentPct(Math.round(r * 100)));
      // 설명은 관측 메모로 따로 붙인다. 실패해도 제보 자체는 접수된 상태라 완료 화면에서 알린다
      const text = note.trim();
      const noteLost = text ? await addReportNote(r.observation_id, text).then(() => false, () => true) : false;
      setDone({ id: r.observation_id, at: kstIso(new Date()), noteLost });
    } catch (e) {
      // fetch가 응답 없이 실패하면(TypeError) 연결 문제. 영어 기본 문구 대신 안내
      setError(e instanceof TypeError ? '서버에 연결하지 못해 보내지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.' : (e as Error).message);
    } finally { setSending(''); }
  };

  const restart = () => { removePhoto(); setLoc(null); setCands(null); setNote(''); setDone(null); setError(''); setFileError(''); };
  const missing = !file ? '사진을 골라 주세요.' : !loc ? '지도에서 막힌 곳을 골라 주세요.' : '';

  const header = <header className="rp-top"><b>RoadPush</b><span>보행 통로 제보</span></header>;

  if (done) {
    return (
      <main className="rp">
        {header}
        <div className="page-title-wrap"><h1 className="h-tit" ref={headRef} tabIndex={-1}>제보를 접수했습니다</h1></div>
        <p className="rp-lead">사진을 분석해 담당 부서에 전달합니다.</p>
        <dl className="rp-summary">
          <div><dt>접수 번호</dt><dd className="rp-mono">{done.id}</dd></div>
          <div><dt>접수 시각</dt><dd>{kstText(done.at)}</dd></div>
        </dl>
        {done.noteLost && <p className="form-hint-invalid">사진과 위치는 접수했지만 남기신 설명은 전달하지 못했습니다.</p>}
        <div className="btn-wrap rp-actions">
          <button type="button" className="krds-btn large primary" onClick={restart}>다른 곳 제보하기</button>
        </div>
      </main>
    );
  }

  return (
    <main className="rp">
      {header}
      <div className="page-title-wrap"><h1 className="h-tit" ref={headRef} tabIndex={-1}>막힌 보도 제보</h1></div>
      <p className="rp-lead">사진과 위치를 보내 주시면 담당 부서에 전달합니다.</p>

      <section className="krds-file-upload line rp-upload" aria-labelledby={`${uid}-photo`}>
        <div className="file-head">
          <h2 className="tit" id={`${uid}-photo`}>막힌 보도 사진</h2>
          <div>
            <p>길이 막힌 모습이 잘 보이게 찍거나 앨범에서 골라 주세요.</p>
            <p>사람 얼굴이나 차량 번호판이 크게 나오지 않게 찍어 주세요.</p>
            <p>JPG·PNG·WEBP, 20MB 이하</p>
          </div>
        </div>
        {/* 잘 나온 사진 예시: 지금은 칸만 (예시 사진이 준비되면 rp-ex-img에 넣는다) */}
        <div className="rp-examples" aria-label="사진 예시">
          <p className="rp-ex-title">이렇게 찍어 주세요</p>
          <ul>
            {PHOTO_EXAMPLES.map((e) => (
              <li key={e.text} className={e.ok ? 'ok' : 'ng'}>
                <span className="rp-ex-img" aria-hidden="true">예시 사진</span>
                <span className="rp-ex-cap"><b>{e.ok ? '좋은 예' : '피할 예'}</b>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* capture를 넣지 않는다: 넣으면 휴대폰이 바로 카메라를 열어 앨범을 고를 수 없다. 없으면 촬영·앨범 중에서 고르게 한다.
            형식을 jpeg·png·webp로 적으면 아이폰은 HEIC 사진을 JPEG로 바꿔 넘긴다 */}
        <input ref={fileRef} id={`${uid}-file`} type="file" accept={`${PHOTO_EXT.join(',')},image/jpeg,image/png,image/webp`} hidden onChange={(e) => choose(e.target.files?.[0])} />
        {!file ? (
          <div className="file-upload">
            <div className="file-upload-btn-wrap">
              {/* KRDS 예시는 label 안에 button을 두지만, 그러면 파일 선택이 열리지 않는 브라우저가 있어 label에 버튼 모양을 입힌다 */}
              <label htmlFor={`${uid}-file`} className="krds-btn medium"><i className="svg-icon ico-upload" aria-hidden="true" />사진 올리기</label>
            </div>
          </div>
        ) : (
          <div className="file-list">
            <ul className="upload-list">
              <li>
                <div className="file-info">
                  <div className="file-name">{file.name} [{sizeText(file.size)}]</div>
                  <div className="btn-wrap">
                    {reading
                      ? <span className="krds-spinner" role="status"><span className="sr-only">사진 정보를 읽는 중</span></span>
                      : <button type="button" className="krds-btn xsmall text" onClick={removePhoto}>삭제</button>}
                  </div>
                </div>
              </li>
            </ul>
            <img className="rp-preview" src={preview} alt="고른 사진" />
            {taken && !reading && <p className="form-hint">촬영 시각 {kstText(taken.at)} ({TIME_TEXT[taken.source]})</p>}
            {photoNote && !loc && <p className="form-hint-information">{photoNote}</p>}
          </div>
        )}
        {fileError && <p className="form-hint-invalid" role="alert">{fileError}</p>}
      </section>

      <div className="fieldset">
        <div className="form-group">
          <div className="form-tit"><h2 className="rp-h2">막힌 곳 위치</h2></div>
          <div className="form-conts">
            <LocationMap loc={loc} onPick={(lat, lng) => { autoLoc.current = false; setLoc({ lat, lng, source: 'manual' }); setError(''); }} onFail={setMapFailed} />
            <button type="button" className="krds-btn medium secondary rp-locbtn" onClick={() => useMyLocation()} disabled={locating}>
              {locating ? '현재 위치를 찾는 중' : loc?.source === 'device' ? '현재 위치 수정' : '현재 위치 사용'}
            </button>
          </div>
          {/* 지도를 못 불러왔으면 지도를 누르라는 말은 빼고, 위치를 정했을 때 어디로 접수되는지만 */}
          {/* 지도를 못 불러왔으면 좌표만, 지도가 있으면 동 이름까지 (지도를 누르라는 말은 지도가 있을 때만) */}
          {/* 첫 줄은 위치, 둘째 줄은 고치는 방법 (동 이름을 아직 못 받았으면 좌표) */}
          {mapFailed ? loc && <p className="form-hint">{LOC_TEXT[loc.source]}: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p> : <p className="form-hint">{loc ? <>
            {LOC_TEXT[loc.source]}: {dong ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}<br />
            {LOC_TEXT[loc.source]}와 다르면 지도를 누르거나 핀을 옮겨 주세요.
          </> : '지도를 눌러 막힌 곳을 고르거나 현재 위치를 사용하세요.'}</p>}
          {loc && near && <p className="form-hint-information">근처에 이미 제보된 지점이 있어 같은 곳으로 접수합니다.</p>}
        </div>

        {/* 선택 입력: 사진만으로 알기 어려운 상황 (KRDS 텍스트 영역) */}
        <div className="form-group">
          <div className="form-tit"><label htmlFor={`${uid}-note`}>상황 설명 <span className="rp-opt">(선택)</span></label></div>
          <div className="form-conts">
            <div className="textarea-wrap">
              <textarea className="krds-input" id={`${uid}-note`} rows={3} maxLength={NOTE_MAX} value={note}
                placeholder="예: 공사 펜스가 보도 전체를 막아 차도로 걸어야 합니다" aria-describedby={`${uid}-note-count`}
                onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="textarea-bottom">
              <p className="textarea-count" id={`${uid}-note-count`}><span className="count-now">{note.length}</span>/{NOTE_MAX}자</p>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="form-hint-invalid rp-error" role="alert">{error}</p>}

      <div className="btn-wrap rp-actions">
        {/* 빠진 것은 미리 띄우지 않고, 눌렀을 때 알린다 */}
        <button type="button" className="krds-btn large primary" disabled={reading || !!sending || !API_BASE || !online} onClick={() => (missing ? setError(missing) : send())}>
          {sending === 'shrink' ? '사진 준비 중' : sending ? (sentPct >= 100 ? '접수 확인 중' : `보내는 중 ${sentPct}%`) : '제보하기'}
        </button>
      </div>
      {!API_BASE ? <p className="form-hint rp-missing">제보 서버에 연결되지 않아 지금은 접수할 수 없습니다.</p>
        : !online && <p className="form-hint rp-missing" role="status">인터넷에 연결되어 있지 않습니다. 연결되면 바로 제보할 수 있습니다.</p>}
    </main>
  );
}
