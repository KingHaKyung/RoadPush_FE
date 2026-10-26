import { useEffect, useMemo, useState } from 'react';
import { fmtTime } from '../lib/format';

type Row = { name: string; center: string; road: string; lat: number; lng: number; hls: string };
type Data = { fetchedAt: string; cctvs: Row[] };

/** 화면에 그리는 최대 줄 수 (전국 1만여 대). 복사·내려받기는 검색 결과 전체 */
const SHOW = 300;
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (rows: Row[]) => [['이름', '관리기관', '도로', '위도', '경도', 'HLS 주소'], ...rows.map((c) => [c.name, c.center, c.road, c.lat, c.lng, c.hls])]
  .map((r) => r.map(csvCell).join(',')).join('\n');

/** ITS 고속도로·국도 CCTV 영상 주소 전체 목록 (분석용). 열 때 한 번만 받는다 */
export function CctvUrlList() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch('/api/its/urls').then((r) => r.json())
      .then((j: Data & { error?: string }) => (j.error ? setErr(j.error) : setData(j)))
      .catch(() => setErr('영상 주소 목록을 받지 못했습니다'));
  }, []);

  const rows = useMemo(() => {
    const t = q.trim();
    return !data ? [] : t ? data.cctvs.filter((c) => c.name.includes(t) || c.center.includes(t) || c.road === t) : data.cctvs;
  }, [data, q]);

  const copy = () => navigator.clipboard.writeText(toCsv(rows)).then(() => setCopied(true), () => setCopied(false));
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'its-cctv-urls.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="url-list">
      <div className="dh">
        <h3>CCTV 영상 주소 목록</h3>
        <p className="meta">
          <span>국가교통정보센터(ITS) 고속도로·국도</span>
          {data && <span>{fmtTime(data.fetchedAt)} 기준</span>}
          <span>주소는 시간이 지나면 만료됩니다</span>
        </p>
      </div>
      {err ? <p className="cctv-err-inline" role="alert">{err}</p> : !data ? <p className="small">불러오는 중…</p> : (
        <>
          <div className="url-tools">
            <label className="vh" htmlFor="url-q">이름·관리기관 검색</label>
            <input id="url-q" className="krds-input small" type="search" placeholder="이름·관리기관 검색 (예: 분당, 경부선)" value={q} onChange={(e) => { setQ(e.target.value); setCopied(false); }} />
            <span className="small">{rows.length.toLocaleString()}대</span>
            <button type="button" className="krds-btn small secondary" onClick={copy} disabled={!rows.length}>{copied ? '복사됨' : 'CSV 복사'}</button>
            <button type="button" className="krds-btn small primary" onClick={download} disabled={!rows.length}>CSV 내려받기</button>
          </div>
          <div className="url-table">
            <table className="tbl col data">
              <thead><tr><th>이름</th><th>도로</th><th>좌표</th><th>HLS 주소</th></tr></thead>
              <tbody>
                {rows.slice(0, SHOW).map((c) => (
                  <tr key={`${c.road}-${c.lat}-${c.lng}-${c.name}`}>
                    <td>{c.name}<span className="small">{c.center}</span></td>
                    <td>{c.road}</td>
                    <td className="small">{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</td>
                    <td><code>{c.hls}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > SHOW && <p className="small">화면에는 {SHOW}대만 보입니다. 복사·내려받기에는 {rows.length.toLocaleString()}대 전부 들어갑니다.</p>}
        </>
      )}
    </div>
  );
}
