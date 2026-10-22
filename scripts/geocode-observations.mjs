// 예시 관측 좌표 → 행정구역·주소 (브이월드 역지오코딩 getAddress)
// src/data/observations.ts의 각 관측에 area(시군구 + 법정동)와 addr(지번 주소, 행정동)를 넣는다.
// 행정동은 좌표에 따라 비어 오는 경우가 있어 정렬·검색 기준은 항상 값이 있는 법정동으로 한다.
// 사용: node scripts/geocode-observations.mjs   (.env의 VWORLD_KEY 사용, 결과는 data/geocode-cache.json에 캐시)
import fs from 'node:fs';

const OBS = 'src/data/observations.ts';
const CACHE = 'data/geocode-cache.json';
const DOMAIN = 'http://localhost:5173'; // 브이월드 인증키에 등록한 서비스 URL

const env = fs.readFileSync('.env', 'utf8');
const key = (env.match(/^VWORLD_KEY=(.+)$/m) ?? env.match(/^VITE_VWORLD_KEY=(.+)$/m))?.[1]?.trim();
if (!key) throw new Error('.env에 VWORLD_KEY가 없습니다');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

async function lookup(lat, lng) {
  const k = `${lat},${lng}`;
  if (cache[k]) return cache[k];
  const q = new URLSearchParams({
    service: 'address', request: 'getAddress', version: '2.0', crs: 'epsg:4326', point: `${lng},${lat}`,
    format: 'json', type: 'parcel', zipcode: 'false', simple: 'false', key, domain: DOMAIN,
  });
  const res = await fetch(`https://api.vworld.kr/req/address?${q}`);
  const j = await res.json();
  if (j.response?.status !== 'OK') throw new Error(`역지오코딩 실패 (${lat}, ${lng}): ${JSON.stringify(j.response?.error ?? j.response?.status)}`);
  const r = j.response.result[0], s = r.structure;
  // '성남시 분당구' → '분당구'
  const gu = s.level2.split(' ').pop();
  cache[k] = { area: `${gu} ${s.level4L}`, addr: r.text + (s.level4A ? ` (행정동 ${s.level4A})` : '') };
  return cache[k];
}

let src = fs.readFileSync(OBS, 'utf8');
const re = /(lat: ([\d.]+), lng: ([\d.]+))(, area: '[^']*', addr: '[^']*')?/g;
const found = [...src.matchAll(re)];
for (const m of found) await lookup(m[2], m[3]);
src = src.replace(re, (_, head, lat, lng) => { const a = cache[`${lat},${lng}`]; return `${head}, area: '${a.area}', addr: '${a.addr}'`; });
fs.writeFileSync(OBS, src);
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const areas = [...new Set(found.map((m) => cache[`${m[2]},${m[3]}`].area))].sort((a, b) => a.localeCompare(b, 'ko'));
console.log(`관측 ${found.length}건 → 행정구역 ${areas.length}곳: ${areas.join(', ')}`);
