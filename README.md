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

1. `.env.example`을 복사해 `.env`를 만듭니다.
2. `VITE_KAKAO_MAP_KEY=`에 카카오 **JavaScript 키**를 넣습니다.
3. [카카오 개발자](https://developers.kakao.com) → 내 애플리케이션 → 플랫폼 → **Web 사이트 도메인**에
   `http://localhost:5173`을 등록합니다. (등록하지 않으면 지도가 뜨지 않습니다)
4. `npm run dev`를 다시 실행합니다.

키가 없거나 지도를 불러오지 못하면 표준노드링크 약도(SVG)로 자동 전환됩니다.
약도는 신촌·이대 일대만 그립니다. 전국 도로망은 카카오 지도에서만 보입니다.

## 전국 표준노드링크 타일 만들기

카카오 지도는 전국 링크(약 156만 개)를 격자 타일(0.05°, 약 5km)로 나눠 화면에 보이는 곳만 불러옵니다.

1. 국토교통부 표준노드링크 zip을 `data/raw/`에 풉니다 (`MOCT_LINK.*`, `MOCT_NODE.*`).
2. `npm run nodelink` → `public/nodelink/`에 `index.json`과 타일 약 4,300개(약 200MB)가 생깁니다.
3. 축척 4 이하에서는 모든 도로를, 축척 5에서는 지방도 이상만 그립니다. 그보다 축소하면 관측 구간만 보입니다.

`data/raw/`와 `public/nodelink/`는 용량이 커서 `.gitignore`에 넣었습니다. 배포할 때는 빌드 전에 2번을 실행해야 합니다.
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
  data/nodelink.ts        표준노드링크(신촌·이대 일대) 링크 354·노드 254
  data/observations.ts    예시 관측
  lib/useObservations.ts  관측 + 사람 판단 기록 (백엔드 연결 시 여기서 API 호출)
  lib/segments.ts         구간 최신 관측·필터 계산
  api/client.ts           FastAPI 응답 타입(마스터 문서 4.4)과 호출 자리
  components/map/         RiskMap(전환) · KakaoRiskMap · SvgRiskMap
  components/             MapView · ListView · HoldView · ObservationDetail · FrameView …
data/roadpush_sinchon_nodelink.geojson   같은 범위의 GeoJSON(WGS84)
public/fonts/                            Pretendard GOV (SIL OFL)
```

## 백엔드 연결할 때

- `.env`의 `VITE_API_BASE_URL`에 FastAPI 주소를 넣습니다.
- `src/api/client.ts`의 `fetchObservations()` 응답을 `Observation`으로 바꿔
  `useObservations`의 예시 데이터 자리를 대체합니다.
- 처리 상태·담당 부서·사람 판정 변경은 `update()`에서 API로 보내면 됩니다.

## 데이터 출처

- 도로 링크·노드: 국토교통부 표준노드링크(2026-10-14 배포)에서 경도 126.930~126.952,
  위도 37.5515~37.5665 범위만 잘라 좌표계(중부원점 TM → WGS84)를 바꿨습니다.
- 서체: Pretendard GOV (KRDS 배포본, SIL Open Font License)
