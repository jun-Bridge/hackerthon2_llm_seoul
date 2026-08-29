# api/ — 백엔드 클라이언트

컴포넌트가 `fetch`를 직접 부르지 않는다. 엔드포인트 변경이 이 폴더에서 끝나야 한다.

정본: `docs/api-contract.md` (프론트-백엔드 계약). 백엔드 짝은 `src/backend/app/api/routes/`.

## 파일

| 파일 | 담당 | 백엔드 짝 |
|---|---|---|
| `client.js` | fetch 래퍼 — credentials·CSRF 헤더·오류 정규화. **여기만 fetch를 안다** | — |
| `auth.js` | 학교 목록·가입·로그인·로그아웃·내 정보·비밀번호·탈퇴·비밀번호 확인·교직원 인증 (9개) | `routes/auth.py`, `routes/schools.py` |
| `session.js` | 대화 세션 — 생성·목록·조회·메시지·접수 (5개) | `routes/session.py` |
| `board.js` | 게시판 — 목록·상세·원문·철회 (4개) | `routes/board.py` |
| `admin.js` | 관리자 — 통계·열람·상태전이·코멘트·로그 (8개) | `routes/admin.py` |

## 계약에서 놓치기 쉬운 것 (전부 api-contract.md에 근거)

- **`school_id`를 보내지 않는다.** 서버가 로그인 세션에서 꺼내 자동 필터링한다. 프론트 코드에 학교 분기가 하나도 없어야 정상.
- **`is_mine`은 서버가 계산해 내려준다.** 익명이라 작성자 id가 응답에 없으므로, 철회 버튼은 이 불린으로만 판단한다.
- **`openComplaint`(상세 열람)는 POST다.** 조회처럼 보이지만 `미확인→확인` 부작용이 있다.
- **상태 전이 API는 갱신된 `Complaint`를 돌려준다.** 상세는 응답으로 갈아끼우고, 목록·통계만 따로 다시 받는다 (전체 재조회 금지).
- **오류는 `error.code`로 분기하고 `error.message`를 그대로 표시한다.** 문구를 프론트가 만들지 않는다. 코드 목록은 api-contract.md의 오류 코드 표가 정본.
- **칩/카테고리를 브라우저에서 추측하지 않는다.** 시안(`docs/anonymous_complain_assistant*.html`)의 `guessCategory`·`parseNaturalInput`은 데모 시뮬레이터일 뿐, 실제로는 서버가 `sendMessage` 응답의 `choices`로 준다.

## 시안과의 차이

`docs/api-contract.md` 8장이 정본. 시안은 상태가 4종(정본은 7종)이고 로그인·학교격리·철회·코멘트·대화세션이 없다. **시안 코드를 그대로 베끼지 않는다** — 화면 구성과 톤만 참고한다.

## 타입

`types/`에 `docs/api-contract.md`의 TS 인터페이스(`Me`, `Complaint`, `Comment`, `ConversationTurn`, `RefineResult` 등)를 옮겨두고, 각 API 함수의 반환 타입으로 쓴다. 백엔드 `app/schemas/`와 짝을 맞춘다 — 한쪽을 고치면 다른 쪽도.
