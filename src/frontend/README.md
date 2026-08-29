# src/frontend/ — 다듬이 웹 화면

React 19 + Vite. **TypeScript가 아니라 JavaScript(JSX)다.**

```bash
npm install
npm run dev     # 5173. /api 요청은 vite.config.js가 localhost:8501로 프록시한다
npm run build   # → dist/. 배포는 이 산출물을 백엔드가 8501에서 함께 서빙한다
```

**API 주소를 환경변수로 두지 않는다.** 배포 시 프론트와 API가 같은 출처(8501)라
경로가 `/api`로 고정이고, 개발 중에는 vite 프록시가 같은 모양을 만들어 준다.

## 폴더

| 폴더 | 무엇 |
|---|---|
| `src/api/` | 백엔드 호출. **여기만 `fetch`를 안다.** `client.js` + 도메인 4개 |
| `src/store/` | `AppContext` — 로그인 사용자·민원 목록·통계. 서버 응답을 화면 형태로 정규화 |
| `src/pages/` | 화면 단위. `MainPage`가 탭으로 나머지를 렌더 |
| `src/components/` | `chat/`(챗봇) · `common/`(상세·헤더·토스트 등) |
| `src/styles/` | 전역 CSS. 화면별 스타일은 대부분 인라인 |
| `public/` | 로고·페르소나·지도 이미지. `dist/`로 그대로 복사돼 `/파일명`으로 서빙된다 |

이미지를 새로 넣을 곳은 `public/`이다. `resource/`는 원본 보관소일 뿐 **빌드에 포함되지 않는다.**

## 지켜야 하는 것

- **컴포넌트에서 `fetch`를 직접 쓰지 않는다.** 엔드포인트가 바뀌면 `src/api/` 안에서 끝나야 한다.
- **칩·카테고리·단계를 브라우저가 만들지 않는다.** 전부 서버가 `sendMessage` 응답으로 준다.
  몇 번 되물을지는 모델이 정한다.
- **데이터가 없을 때 가짜로 채우지 않는다.** 목록이 비면 "민원이 없다"가 사실이다.
  데모로 채우면 빈 게시판과 장애를 구분할 수 없다 — 실제로 그 때문에 크게 한 번 깨졌다
  (`docs/postmortem-frontend-integration.md`).
- **필드명은 서버가 정본이다.** `created_at`·`body`·`school_name`. `AppContext`가
  화면용 별칭(`timestamp`·`rawText`)을 덧붙이지만 원본 필드를 지우지 않는다.

## 빌드가 잡아주지 않는 것

`npm run build`는 번들링만 하고 **스코프를 검사하지 않는다.** 정의되지 않은 변수를 참조해도
빌드는 성공하고 화면만 렌더 중에 죽는다(실제로 챗봇이 이렇게 통째로 죽은 적이 있다).
컴포넌트를 크게 손댔으면 브라우저에서 그 화면을 실제로 열어보고 콘솔을 확인한다.

## 계약

`docs/api-contract.md`가 정본이다. 프론트 함수 이름과 HTTP 경로의 대응표가 거기 있다.
