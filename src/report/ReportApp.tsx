import { useEffect, useId, useRef, useState } from 'react';
import { API_BASE } from '../api/client';
import { addReportNote, inspectPhoto, siteCandidates, submitReport, type SiteCandidates, type Source } from './api';
import { LocationMap } from './LocationMap';
import '../styles/report.css';

type Loc = { lat: number; lng: number; source: Source };

/** 한국 시간 ISO 8601 ('YYYY-MM-DDTHH:mm:ss+09:00') */
const kstIso = (d: Date) => `${new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 19)}+09:00`;
/** 백엔드가 읽은 사진 촬영 시각. 시간대가 없으면 한국 시간으로 본다 */
const withTz = (s: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.slice(0, 19)}+09:00`);
/** '2026년 10월 26일 17:00' */
const kstText = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 36e5);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const sizeText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const NOTE_MAX = 300;
const LOC_TEXT: Record<Source, string> = { exif: '사진에 담긴 위치', device: '현재 내 위치', manual: '지도에서 고른 위치' };
const TIME_TEXT: Record<Source, string> = { exif: '사진에 담긴 시각', device: '사진 파일 시각', manual: '직접 고른 시각' };

/**
 * 도보 통행 단절 제보 (시민용 웹앱). 한 화면에서 사진과 위치를 받아 바로 보낸다.
 * 촬영 시각은 묻지 않는다: 사진 메타데이터(EXIF) 시각, 없으면 사진 파일 시각
 */
export function ReportApp() {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [taken, setTaken] = useState<{ at: string; source: Source } | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [cands, setCands] = useState<SiteCandidates | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ id: string; at: string; noteLost?: boolean } | null>(null);

  useEffect(() => { document.title = '보행 통로 제보 · RoadPush'; }, []);
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

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setFile(f); setPreview(URL.createObjectURL(f));
    // 사진 위치로 정한 곳은 새 사진에 맞춰 다시 정한다. 사용자가 고른 위치는 그대로 둔다
    if (loc?.source === 'exif') { setLoc(null); setCands(null); }
    setTaken({ at: kstIso(new Date(f.lastModified || Date.now())), source: 'device' });
    if (!API_BASE) return;
    setReading(true);
    try {
      const r = await inspectPhoto(f);
      if (r.captured_at) setTaken({ at: withTz(r.captured_at), source: 'exif' });
      if (r.lat != null && r.lng != null) { setLoc({ lat: r.lat, lng: r.lng, source: 'exif' }); setCands(r.candidates); }
    } catch {
      // 사진 정보를 못 읽으면 파일 시각을 쓰고, 위치는 지도에서 고른다
    } finally { setReading(false); }
  };
  const removePhoto = () => {
    setFile(null); setPreview(''); setTaken(null);
    if (loc?.source === 'exif') { setLoc(null); setCands(null); }
    // 같은 사진을 다시 골라도 change가 일어나게 비운다
    if (fileRef.current) fileRef.current.value = '';
  };

  const useMyLocation = () => {
    // 브라우저는 https 주소(또는 localhost)에서만 위치를 내준다
    if (!window.isSecureContext) { setError('현재 위치는 https 주소에서만 쓸 수 있습니다. 지도를 눌러 위치를 골라 주세요.'); return; }
    if (!navigator.geolocation) { setError('이 브라우저는 현재 위치를 지원하지 않습니다. 지도를 눌러 위치를 골라 주세요.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'device' }); setLocating(false); },
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
    setSending(true); setError('');
    try {
      const r = await submitReport({
        file, capturedAt: taken?.at ?? kstIso(new Date()), capturedAtSource: taken?.source ?? 'device',
        lat: loc.lat, lng: loc.lng, locationSource: loc.source,
        ...(near ? { siteId: near.site.id } : { newSiteName: road ? `${road} 시민 제보` : '시민 제보 지점' }),
      });
      // 설명은 관측 메모로 따로 붙인다. 실패해도 제보 자체는 접수된 상태라 완료 화면에서 알린다
      const text = note.trim();
      const noteLost = text ? await addReportNote(r.observation_id, text).then(() => false, () => true) : false;
      setDone({ id: r.observation_id, at: kstIso(new Date()), noteLost });
    } catch (e) {
      setError((e as Error).message);
    } finally { setSending(false); }
  };

  const restart = () => { removePhoto(); setLoc(null); setCands(null); setNote(''); setDone(null); setError(''); };
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
          </div>
        </div>
        {/* capture를 넣지 않는다: 넣으면 휴대폰이 바로 카메라를 열어 앨범을 고를 수 없다. 없으면 촬영·앨범 중에서 고르게 한다 */}
        <input ref={fileRef} id={`${uid}-file`} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
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
          </div>
        )}
      </section>

      <div className="fieldset">
        <div className="form-group">
          <div className="form-tit"><h2 className="rp-h2">막힌 곳 위치</h2></div>
          <div className="form-conts">
            <LocationMap loc={loc} onPick={(lat, lng) => { setLoc({ lat, lng, source: 'manual' }); setError(''); }} />
            <button type="button" className="krds-btn medium secondary rp-locbtn" onClick={useMyLocation} disabled={locating}>
              {locating ? '현재 위치를 찾는 중' : '현재 위치 사용'}
            </button>
          </div>
          <p className="form-hint">{loc
            ? `${LOC_TEXT[loc.source]}${near ? ` (${near.site.name})` : road ? ` (${road} 부근)` : ''}입니다. 다르면 지도를 누르거나 핀을 옮겨 주세요.`
            : '지도를 눌러 막힌 곳을 고르거나 현재 위치를 사용하세요.'}</p>
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
        <button type="button" className="krds-btn large primary" disabled={reading || sending || !API_BASE} onClick={() => (missing ? setError(missing) : send())}>
          {sending ? '보내는 중' : '제보하기'}
        </button>
      </div>
      {!API_BASE && <p className="form-hint rp-missing">제보 서버에 연결되지 않아 지금은 접수할 수 없습니다.</p>}
    </main>
  );
}
