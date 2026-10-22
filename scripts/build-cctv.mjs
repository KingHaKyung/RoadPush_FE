// UTIC(도시교통정보센터) 개방데이터 CCTV 좌표(전국, 고속도로·국도·하천 제외) → public/cctv/utic.json
// .env의 UTIC_API_KEY로 좌표 엑셀을 한 번 받아(등록한 IP에서만 응답) 키 없이 저장한다.
// UTIC 안내: 목록은 수시로 바뀌니 하루 1회 정도 다시 받을 것. 같은 주소를 1초에 5번 넘게 부르면 IP 차단.
// 사용: node scripts/build-cctv.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 대한민국 범위 (좌표가 비었거나 잘못된 행을 거른다) */
const BOUNDS = { south: 33, west: 124, north: 39, east: 132 };
const OUT = 'public/cctv/utic.json';

const key = fs.readFileSync('.env', 'utf8').match(/^UTIC_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error('.env에 UTIC_API_KEY가 없습니다');

const res = await fetch(`https://www.utic.go.kr/excel/download/OpenDataCCTV?key=${encodeURIComponent(key)}`);
const buf = Buffer.from(await res.arrayBuffer());
if (!res.ok || buf.subarray(0, 2).toString() !== 'PK') throw new Error(`UTIC 좌표 파일을 받지 못했습니다 (${res.status}). 등록한 IP인지 확인하세요`);

// xlsx(zip)를 임시 폴더에 풀어 첫 시트를 읽는다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'utic-'));
fs.writeFileSync(path.join(tmp, 'cctv.xlsx'), buf);
const r = spawnSync('unzip', ['-q', '-o', path.join(tmp, 'cctv.xlsx'), 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', '-d', tmp]);
if (r.status !== 0) throw new Error('엑셀 파일을 풀지 못했습니다');
const strs = [...fs.readFileSync(path.join(tmp, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
const rows = [...fs.readFileSync(path.join(tmp, 'xl/worksheets/sheet1.xml'), 'utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
  .map((row) => [...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
    const v = (c[3] ?? '').match(/<v>([\s\S]*?)<\/v>/);
    return v ? (/t="s"/.test(c[2]) ? strs[+v[1]] : v[1]) : '';
  }));
fs.rmSync(tmp, { recursive: true, force: true });
const head = rows[0];
const col = (n) => head.indexOf(n);
const [iId, iName, iCenter, iX, iY] = ['CCTVID', 'CCTVNAME', 'CENTERNAME', 'XCOORD', 'YCOORD'].map(col);
if ([iId, iName, iX, iY].some((i) => i < 0)) throw new Error(`좌표 파일 형식이 바뀌었습니다: ${head.join(', ')}`);

const cctvs = rows.slice(1)
  .map((x) => ({ id: x[iId], name: x[iName], center: x[iCenter] ?? '', lng: +(+x[iX]).toFixed(6), lat: +(+x[iY]).toFixed(6) }))
  .filter((c) => c.lat >= BOUNDS.south && c.lat <= BOUNDS.north && c.lng >= BOUNDS.west && c.lng <= BOUNDS.east)
  // 고속도로·국도(국가교통정보센터)는 ITS가 같은 카메라를 IP 제한 없이 주므로, 홍수통제소는 도로가 아니라 하천을 비추므로 저장하지 않는다
  .filter((c) => !/^국가교통정보센터|홍수통제소/.test(c.center));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: '도시교통정보센터(UTIC) 개방데이터', fetched: new Date().toISOString().slice(0, 10), cctvs }));
const by = cctvs.reduce((m, c) => ((m[c.center] = (m[c.center] ?? 0) + 1), m), {});
console.log(`전체 ${rows.length - 1}대 중 좌표가 있는 ${cctvs.length}대 → ${OUT}`, by);
