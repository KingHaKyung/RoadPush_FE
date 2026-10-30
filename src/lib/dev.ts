/**
 * 개발 서버에서만: 주소의 ?이름=값 으로 오류·빈 화면을 일부러 띄워 본다 (배포 빌드에서는 항상 null).
 *   /dashboard?api=fail   백엔드 연결 실패      /dashboard?api=slow   처음 불러오는 중(4초)
 *   /dashboard?api=sample 예시 데이터로 보기     ?img=fail             사진을 못 불러옴
 *   ?map=fail             배경지도를 못 불러옴   ?crash=1              화면 코드 오류
 *   /report?offline=1     인터넷 끊김
 */
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;

export const devFlag = (name: string): string | null => params?.get(name) ?? null;
