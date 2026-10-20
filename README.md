# RoadPush 관제 대시보드 (프론트엔드)

CCTV·불법주정차 단속차량에서 들어온 관측을 AI가 판정한 결과를
**국토교통부 표준노드링크 구간 단위**로 보여주는 지자체용 대시보드입니다.
화면 스타일은 KRDS(대한민국 정부 디자인 시스템) 토큰과 Pretendard GOV 서체를 따릅니다.

> 지금은 **예시 관측 20건**으로 동작합니다. 판정·사진은 실제 데이터가 아닙니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입 검사 + 배포용 빌드(dist/)
```

Node.js 18 이상이 필요합니다.

## 지도 API 키 넣기

배경지도는 [브이월드](https://www.vworld.kr) 회색 지도(white)를 Leaflet으로 띄웁니다.

1. 브이월드 → 오픈API → 인증키 발급에서 서비스 URL을 `http://localhost:5173`으로 등록하고 키를 받습니다.
2. 프로젝트 폴더에 `.env` 파일을 만들고 아래처럼 적습니다. (`VITE_`로 시작해야 브라우저 코드에서 읽힙니다)

   ```
   VITE_VWORLD_KEY=브이월드_인증키
   # 백엔드(FastAPI) 주소. 비워 두면 예시 데이터를 씁니다
   VITE_API_BASE_URL=
   ```
3. `npm run dev`를 다시 실행합니다.

키가 없거나 배경지도를 불러오지 못하면 표준노드링크 약도(SVG)로 자동 전환됩니다.
약도는 예시 지역(성남시 분당구 서현·수내 일대)만 그립니다. 전국 도로망은 브이월드 지도에서만 보입니다.

## 표준노드링크 데이터 만들기

국토교통부 표준노드링크 zip을 `data/raw/`에 풉니다 (`MOCT_LINK.*`, `MOCT_NODE.*`).

- **전국 타일**: `npm run nodelink` → `public/nodelink/`에 `index.json`과 타일 약 4,300개(약 200MB).
  전국 링크(약 156만 개)를 격자(0.05°, 약 5km)로 나눠 화면에 보이는 곳만 불러옵니다.
  줌 15 이상은 모든 도로, 줌 14는 지방도 이상만 그리고, 더 축소하면 관측 구간만 보입니다.
- **예시 지역**: `npm run demo-area` → `src/data/nodelink.ts`와 GeoJSON을 다시 만들고
  예시 관측을 그 지역 링크에 다시 배정합니다. 범위는 `scripts/build-demo-area.mjs`의 `BOUNDS`.

- **실제 도로폭(연속수치지형도)**: 국토정보플랫폼에서 받은 `(연속수치지형도)도로중심선_*.zip`을 프로젝트 폴더나 다운로드 폴더에 두고
  `npm run centerline` → `public/centerline/demo.json`(약 140KB). 예시 지역 도로를 실제 도로폭(RVWD)으로 그리고,
  표준노드링크 링크에 도로폭을 붙입니다. 도로를 누르면 가까운 표준노드링크 링크가 선택되고, 링크가 없는 골목은
  도로중심선 정보(폭·차로·일방통행·포장)를 보여 줍니다. 항목 코드는 연속수치지형도 데이터 설명서(v5.1.1)를 따릅니다.

- **관측 행정구역**: `npm run geocode` → 예시 관측 좌표를 브이월드 역지오코딩으로 조회해 `area`(시군구 + 법정동)와
  `addr`(지번 주소, 행정동)를 넣습니다. 정렬·검색은 항상 값이 있는 법정동 기준입니다. 결과는 `data/geocode-cache.json`에 캐시됩니다.
  `npm run demo-area`로 좌표를 다시 만들었다면 이것도 다시 실행하세요.

`data/raw/`와 `public/nodelink/`는 용량이 커서 `.gitignore`에 넣었습니다. 배포할 때는 빌드 전에 `npm run nodelink`를 실행해야 합니다.
`.env`는 `.gitignore`에 들어 있어 Git에 올라가지 않습니다.

## 화면

| 화면 | 내용 |
|---|---|
| 위험 지도 | 링크(구간)별 최신 관측 판정 색, 우선 점검 구간, 링크 속성·관측 이력·처리 |
| 관측 목록 | 필터·정렬, 처리 상태 변경, 여러 건 일괄 처리, 엑셀용 표 복사 |
| 판단 유보 | AI가 확정하지 못한 관측을 사람이 판정하거나 재분석 요청 |

AI 판정과 사람 판정·처리 기록은 따로 저장합니다(지금은 브라우저 localStorage).

## 폴더 구조

```
src/
  App.tsx                 화면 전환(#map #list #hold)·전역 상태
  types.ts                관측·구간·필터 타입
  data/nodelink.ts        표준노드링크(성남시 분당구 서현·수내 일대) 링크 759·노드 493
  data/observations.ts    예시 관측
  lib/useObservations.ts  관측 + 사람 판단 기록 (백엔드 연결 시 여기서 API 호출)
  lib/segments.ts         구간 최신 관측·필터 계산
  api/client.ts           FastAPI 응답 타입(마스터 문서 4.4)과 호출 자리
  components/map/         RiskMap(전환) · VWorldRiskMap · SvgRiskMap
  components/             MapView · ListView · HoldView · ObservationDetail · FrameView …
data/roadpush_seongnam_nodelink.geojson  같은 범위의 GeoJSON(WGS84)
public/centerline/demo.json              예시 지역 연속수치지형도 도로중심선
scripts/                                 표준노드링크 SHP → 타일·예시 지역 변환, 도로중심선 변환
public/fonts/                            Pretendard GOV (SIL OFL)
```

## 백엔드 연결할 때

- `.env`의 `VITE_API_BASE_URL`에 FastAPI 주소를 넣습니다.
- `src/api/client.ts`의 `fetchObservations()` 응답을 `Observation`으로 바꿔
  `useObservations`의 예시 데이터 자리를 대체합니다.
- 처리 상태·담당 부서·사람 판정 변경은 `update()`에서 API로 보내면 됩니다.

## 데이터 출처

- 도로 링크·노드: 국토교통부 표준노드링크(2026-10-14 배포). 좌표계를 중부원점 TM에서 WGS84로 바꿨고,
  예시 지역은 경도 127.108~127.134, 위도 37.3745~37.3905 범위입니다.
- 배경지도: 브이월드(국토교통부 공간정보 오픈플랫폼) WMTS
- 도로폭·골목: 국토지리정보원 전국 연속수치지형도 1:5,000 도로중심선(N3L_A0020000, UTM-K)
- 서체: Pretendard GOV (KRDS 배포본, SIL Open Font License)
