# UniVoice — 프론트·백엔드 연결 규약

_2026-08-27 · 상태: 합의 대기_

**프론트(JS)와 백엔드(FastAPI)가 서로를 기다리지 않고 각자 만들기 위한 계약서다.**
여기 적힌 것이 두 쪽의 유일한 접점이다. 프론트는 이 함수들을 호출해 화면을 만들고,
백엔드는 이 규약대로 응답한다. **한쪽이 이 문서를 어기면 그건 버그다.**

기능 정의의 출처는 `.kiro/specs/complaint-assistant/`(정본)이고, 이 문서는 그것을
HTTP 경계로 옮긴 것이다. 기능 자체가 궁금하면 그쪽을 본다.

---

## 0. 공통 규약

### 주소와 형식

| 항목 | 값 |
|---|---|
| Base URL | `/api` |
| 형식 | JSON (요청·응답 모두) |
| 인코딩 | UTF-8 |
| 시각 | ISO 8601 문자열 (`2026-08-27T14:03:00+09:00`) |

### 인증

**HttpOnly 쿠키 세션.** 로그인하면 서버가 `Set-Cookie`로 세션 id를 내려주고,
이후 모든 요청에 자동으로 실린다. 프론트는 토큰을 저장하지도 붙이지도 않는다.

```js
fetch(url, { credentials: 'include', ... })   // 모든 요청에 이것만 붙이면 된다
```

- 상태를 바꾸는 요청(POST/PATCH/DELETE)에는 `X-Requested-With: fetch` 헤더를 붙인다. CSRF 대비.
- 세션이 없거나 만료면 **401**. 프론트는 401을 받으면 로그인 화면으로 보낸다.

### 학교 격리 — 프론트가 신경 쓰지 않는다

**모든 조회·변경은 서버가 로그인 세션의 `school_id`로 자동 필터링한다.**
프론트는 `school_id`를 보내지 않고, 보내도 무시된다.
다른 학교 데이터는 존재 여부조차 알 수 없다(404).

이 규칙이 있어서 프론트 코드에 학교 관련 분기가 하나도 없다.

### 오류 형식

모든 오류는 같은 모양이다.

```json
{ "error": { "code": "COMPLAINT_NOT_CONFIRMED", "message": "먼저 상세를 열람해야 합니다." } }
```

| HTTP | 언제 |
|---|---|
| 400 | 입력 형식 오류 (빈 값, 길이 초과) |
| 401 | 로그인 안 됨 / 세션 만료 |
| 403 | 로그인했으나 권한 없음 (학생이 관리자 API 호출 등) |
| 404 | 없거나 볼 권한 없음 — **다른 학교 것도 404** (존재 여부를 흘리지 않는다) |
| 409 | 상태 충돌 (확인 안 된 민원에 수락 시도 등) |
| 422 | 비즈니스 규칙 위반 (보류인데 사유 없음 등) |
| 502 | Bedrock 호출 실패 |

프론트는 **`error.code`로 분기하고 `error.message`를 그대로 보여준다.**
메시지 문구를 프론트가 만들지 않는다 — 문구가 두 곳에 흩어지면 관리가 안 된다.

### 공통 타입

```ts
type Role = 'student' | 'admin';

type Status = '미확인' | '확인' | '처리중' | '해결완료' | '보류' | '거절' | '철회';

type Category =
  | '냉난방 / 공조' | '위생 / 배관' | '전기 / 설비'
  | '영상 / 기자재' | '공간 / 편의' | '안전 / 보안' | '기타';

interface Me {
  user_id: number;
  email: string;
  role: Role;
  school_name: string;      // school_id는 내려주지 않는다 — 프론트가 쓸 일이 없다
}

interface Complaint {
  id: number;
  category: Category;
  location: string;
  title: string;            // refined_title
  body: string;             // refined_body
  status: Status;
  created_at: string;
  confirmed_at: string | null;
  is_mine: boolean;         // 철회 버튼 노출 판단용. 서버가 세션과 대조해 계산
  comments: Comment[];      // 상세에서만 채워짐. 목록에서는 []
}

interface Comment {
  id: number;
  content: string;
  is_hold_reason: boolean;
  created_at: string;
  // 작성자는 내려주지 않는다 — 화면에는 "관리자"로만 표시
}

interface ConversationTurn {
  role: 'student' | 'assistant';
  content: string;
  created_at: string;
}
```

> **`is_mine`을 서버가 계산하는 이유**: 익명 게시판이라 작성자 id를 내려보낼 수 없다.
> 그렇다고 프론트가 판단할 근거도 없다. 서버만 아는 사실이므로 서버가 불린 하나로 답한다.

---

## 1. 연결부 전체 목록

프론트 함수는 `src/api/` 아래 도메인별 모듈에, 백엔드 라우터는 `app/api/routes/` 아래에 둔다.

### 인증 (`api/auth.js` ↔ `routes/auth.py`)

| 기능 | 프론트 함수 | HTTP | 백엔드 함수 | 서비스 계층 |
|---|---|---|---|---|
| 이메일로 학교 확인 | `lookupSchool(email)` | `POST /api/auth/school-lookup` | `lookup_school()` | `db.find_school_by_email()` |
| 가입 | `signup(email, pw, role, adminCode?)` | `POST /api/auth/signup` | `signup()` | `db.verify_admin_code()` → `db.create_user()` |
| 로그인 | `login(email, pw)` | `POST /api/auth/login` | `login()` | `db.authenticate_user()` |
| 로그아웃 | `logout()` | `POST /api/auth/logout` | `logout()` | 세션 삭제 |
| 내 정보 | `getMe()` | `GET /api/auth/me` | `get_me()` | 세션 조회 |
| 비밀번호 변경 | `changePassword(current, next)` | `PATCH /api/auth/password` | `change_password()` | `db.verify_password()` → `db.change_password()` |
| 탈퇴 | `deleteAccount(pw)` | `DELETE /api/auth/me` | `delete_account()` | `db.verify_password()` → `db.delete_user()` |

### 민원 작성 — 학생 (`api/draft.js` ↔ `routes/draft.py`)

| 기능 | 프론트 함수 | HTTP | 백엔드 함수 | 서비스 계층 |
|---|---|---|---|---|
| 새 작성 시작 | `startDraft()` | `POST /api/drafts` | `create_draft()` | `draft_key` 발급 |
| 메시지 보내기 | `sendMessage(draftKey, text)` | `POST /api/drafts/{draft_key}/messages` | `send_message()` | `ComplaintService.send_message()` |
| 대화 다시 읽기 | `getDraftConversation(draftKey)` | `GET /api/drafts/{draft_key}/conversation` | `get_conversation()` | `db.get_conversation()` |
| 정식 접수 | `submitDraft(draftKey)` | `POST /api/drafts/{draft_key}/submit` | `submit_draft()` | `ComplaintService.submit()` |

### 게시판 — 학생 (`api/board.js` ↔ `routes/board.py`)

| 기능 | 프론트 함수 | HTTP | 백엔드 함수 | 서비스 계층 |
|---|---|---|---|---|
| 목록 | `listComplaints(status?)` | `GET /api/complaints` | `list_complaints()` | `db.list_complaints()` |
| 상세 | `getComplaint(id)` | `GET /api/complaints/{id}` | `get_complaint()` | `db.get_complaint()` + `db.get_comments()` |
| 원문 대화 | `getComplaintConversation(id)` | `GET /api/complaints/{id}/conversation` | `get_complaint_conversation()` | `db.get_conversation_by_complaint()` |
| 철회 | `withdrawComplaint(id, pw)` | `POST /api/complaints/{id}/withdraw` | `withdraw()` | `ComplaintService.withdraw()` |

### 관리자 (`api/admin.js` ↔ `routes/admin.py`)

| 기능 | 프론트 함수 | HTTP | 백엔드 함수 | 서비스 계층 |
|---|---|---|---|---|
| 통계 | `getStats()` | `GET /api/admin/stats` | `get_stats()` | `db.get_complaint_stats()` |
| 상세 열람 **(확인 전환)** | `openComplaint(id)` | `POST /api/admin/complaints/{id}/open` | `open_complaint()` | `ComplaintService.open_detail()` |
| 수락 → 처리중 | `acceptComplaint(id)` | `POST /api/admin/complaints/{id}/accept` | `accept()` | `ComplaintService.accept()` |
| 해결 완료 | `resolveComplaint(id)` | `POST /api/admin/complaints/{id}/resolve` | `resolve()` | `ComplaintService.resolve()` |
| 보류 (사유 필수) | `holdComplaint(id, reason)` | `POST /api/admin/complaints/{id}/hold` | `hold()` | `ComplaintService.hold()` |
| 거절 | `rejectComplaint(id)` | `POST /api/admin/complaints/{id}/reject` | `reject()` | `ComplaintService.reject()` |
| 코멘트 추가 | `addComment(id, text)` | `POST /api/admin/complaints/{id}/comments` | `add_comment()` | `ComplaintService.add_comment()` |

관리자 API는 전부 `role == 'admin'` 검사를 통과해야 한다. 학생이 부르면 **403**.
목록·상세 조회는 학생과 같은 `/api/complaints`를 쓴다 — 응답이 같기 때문에 나눌 이유가 없다.

---

## 2. 엔드포인트 상세

### 2.1 인증

**`POST /api/auth/school-lookup`** — 가입 화면에서 이메일을 다 치면 호출한다.
학교 이름을 미리 보여줘 오타를 잡고, 관리자 코드 입력칸을 띄울지 결정한다.

```
요청   { "email": "student1@chosun.ac.kr" }
응답   { "school_name": "조선대학교", "supported": true }
       { "supported": false }                        ← 미등록 도메인. 가입 버튼 비활성화
```

**`POST /api/auth/signup`**

```
요청   { "email": "...", "password": "...", "role": "student" }
       { "email": "...", "password": "...", "role": "admin", "admin_code": "CSU-ADM-01" }
응답   201  { "user_id": 12 }   + Set-Cookie (가입 후 바로 로그인 상태)
오류   400 UNSUPPORTED_DOMAIN   미등록 이메일 도메인
       400 EMAIL_TAKEN          이미 가입된 이메일
       400 INVALID_ADMIN_CODE   관리자 코드 불일치
```

학교는 **이메일 도메인으로 서버가 정한다.** 요청에 `school_id`가 없는 이유다.

**`POST /api/auth/login`**

```
요청   { "email": "...", "password": "..." }
응답   200  Me  + Set-Cookie
오류   401 INVALID_CREDENTIALS   (이메일이 없는 건지 비밀번호가 틀린 건지 구분하지 않는다)
```

**`GET /api/auth/me`** → `Me` · 미로그인이면 401
앱을 열 때 가장 먼저 호출해 로그인 상태와 역할을 판정한다. 역할에 따라 화면이 갈린다.

**`PATCH /api/auth/password`**

```
요청   { "current_password": "...", "new_password": "..." }
응답   204
오류   401 WRONG_PASSWORD
```

**`DELETE /api/auth/me`**

```
요청   { "password": "..." }
응답   204  + 세션 삭제
```

작성한 민원은 **남고 소유자만 지워진다**(`submitted_by_user_id = NULL`).
게시판이 이미 익명이라 표시에 영향이 없고, 학교의 기록은 보존되어야 하기 때문이다.
프론트는 탈퇴 확인 문구에 이 점을 적는다.

### 2.2 민원 작성

**`POST /api/drafts`** → `{ "draft_key": "3f9a..." }`

"새 민원 작성"을 누를 때 한 번 호출한다. 이후 대화는 이 키로 묶인다.

**`POST /api/drafts/{draft_key}/messages`** — 이 서비스의 핵심이다.

```
요청   { "message": "3층 화장실 물이 안 내려가요" }

응답 A — 정보가 부족해 AI가 되묻는 경우
{
  "is_complete": false,
  "follow_up_question": "어느 건물 3층인지 알려주시겠어요?"
}

응답 B — 확정안이 나온 경우
{
  "is_complete": true,
  "preview": {
    "category": "위생 / 배관",
    "location": "본관 3층 남자화장실",
    "refined_title": "본관 3층 화장실 배수 불량 조치 요청",
    "refined_body": "현상: ...\n영향: ...\n요청: ..."
  }
}

오류   502 BEDROCK_ERROR   모델 호출 실패. 대화는 이미 저장돼 있으니 다시 보내면 된다
```

**프론트가 `is_complete`로 화면을 가른다.** `false`면 질문을 말풍선으로 띄우고 입력창을 유지한다.
`true`면 미리보기 카드와 "정식 접수" 버튼을 띄운다.
미리보기 상태에서도 사용자가 다시 메시지를 보내면(`"위치를 4층으로 바꿔줘"`) 같은 엔드포인트를
그대로 호출한다 — **수정 전용 API가 따로 없다.** 대화가 곧 수정 수단이다.

**`GET /api/drafts/{draft_key}/conversation`** → `ConversationTurn[]`

새로고침 복구용. 대화는 매 턴 DB에 저장되므로 화면을 다시 그릴 때 이걸 읽는다.
**프론트는 대화 배열을 자기 상태에만 들고 있지 않는다.**

**`POST /api/drafts/{draft_key}/submit`**

```
요청   {}     ← 확정안은 서버가 그 draft의 마지막 결과에서 가져온다
응답   201  { "complaint_id": 87, "next_draft_key": "8b2c..." }
오류   409 DRAFT_NOT_COMPLETE   아직 확정안이 없다 (되묻는 중)
```

> **본문에 `refined`를 실어 보내지 않는 이유**: 프론트가 보낸 값을 그대로 저장하면
> 화면에서 값을 바꿔 보낼 수 있게 된다. AI가 확정한 것과 접수된 것이 달라질 여지를 없앤다.
>
> **`next_draft_key`를 함께 주는 이유**: 접수가 끝나면 이전 draft는 닫힌다.
> 다음 민원이 앞 대화와 섞이지 않도록 서버가 새 키를 바로 발급한다.
> 프론트는 이걸 받아 그대로 교체하면 되고, 별도로 `POST /api/drafts`를 다시 부르지 않는다.

### 2.3 게시판

**`GET /api/complaints?status=처리중`** → `Complaint[]` (`comments`는 빈 배열)

- `status` 생략 시 **철회를 뺀 전체**
- 최신순
- 철회된 민원은 어떤 조건에서도 나오지 않는다

**`GET /api/complaints/{id}`** → `Complaint` (`comments` 채워짐)

**학생이 이걸 불러도 상태는 바뀌지 않는다.** 확인 전환은 관리자 전용 엔드포인트에서만 일어난다.

**`GET /api/complaints/{id}/conversation`** → `ConversationTurn[]` — "원문 보기" 토글

**`POST /api/complaints/{id}/withdraw`**

```
요청   { "password": "..." }
응답   204
오류   401 WRONG_PASSWORD
       403 NOT_OWNER        내 민원이 아님
```

프론트는 `is_mine`이 `true`일 때만 철회 버튼을 그린다. 서버는 그것과 무관하게 다시 검사한다.
**화면에서 감추는 것은 편의이고, 막는 것은 서버다.**

### 2.4 관리자

**`GET /api/admin/stats`**

```json
{ "total": 42, "by_status": { "미확인": 5, "확인": 3, "처리중": 8,
                              "해결완료": 20, "보류": 4, "거절": 2 } }
```

**`POST /api/admin/complaints/{id}/open`** → `Complaint`

**목록에서 행을 클릭하면 이걸 부른다.** 상세 데이터를 돌려주면서
`미확인`이면 `확인`으로 **자동 전환한다.** 이미 확인 이후면 아무 일도 일어나지 않는다.

> `GET`이 아니라 `POST`인 이유: 상태를 바꾸기 때문이다.
> 조회처럼 생겼지만 부작용이 있어서 `GET`으로 두면 브라우저·프록시가 미리 불러
> 열지도 않은 민원이 확인 처리될 수 있다.

**결정 버튼 네 개**

| 프론트 | 엔드포인트 | 요청 | 전이 |
|---|---|---|---|
| `acceptComplaint(id)` | `.../accept` | `{}` | 확인 → 처리중 |
| `resolveComplaint(id)` | `.../resolve` | `{}` | 처리중 → 해결완료 |
| `holdComplaint(id, reason)` | `.../hold` | `{ "reason": "..." }` | 확인 → 보류 |
| `rejectComplaint(id)` | `.../reject` | `{}` | 확인 → 거절 |

전부 성공 시 `200 Complaint`(갱신된 상태). 오류는 아래.

```
409 INVALID_TRANSITION    현재 상태에서 갈 수 없는 곳
                          예: 미확인에 accept, 확인 상태에 resolve
422 HOLD_REASON_REQUIRED  보류인데 reason이 비었다
```

**`POST /api/admin/complaints/{id}/comments`**

```
요청   { "content": "관리팀에 전달했습니다" }
응답   201  Comment
```

**상태와 무관하게 언제든 가능하다.** 보류로 전환할 때만 사유가 필수일 뿐,
코멘트 자체는 상시 추가되고 누적된다.

---

## 3. 상태 전이 — 누가 무엇을 부를 수 있나

```
        [학생] submit
             ↓
         ┌────────┐
         │ 미확인  │
         └───┬────┘
             │ [관리자] open          ← 버튼이 아니라 열람의 부작용
             ↓
         ┌────────┐
         │  확인   │ ← 여기서만 결정 버튼 세 개가 보인다
         └───┬────┘
       ┌─────┼─────┐
       │     │     │
   accept  hold  reject
       │     │     │
       ↓     ↓     ↓
   ┌──────┐ ┌────┐ ┌────┐
   │처리중 │ │보류│ │거절│
   └──┬───┘ └────┘ └────┘
      │ resolve
      ↓
   ┌────────┐
   │해결완료 │
   └────────┘

   [학생] withdraw — 어느 상태에서든, 본인 것만 → 철회
```

**프론트가 지킬 것**

- `미확인`에는 결정 버튼을 그리지 않는다. 먼저 `open`을 불러 `확인`으로 만든다
- `확인`에서는 수락·보류·거절 세 개만. `해결 완료`는 안 보인다
- `처리중`에서는 `해결 완료` 하나만
- `해결완료`·`거절`은 최종이라 버튼이 없다. 코멘트는 계속 가능하다
- 보류 버튼은 사유 입력 모달을 띄우고, **빈 값이면 전송하지 않는다**

**서버가 지킬 것**

- 위 규칙을 **전부 다시 검사한다.** 프론트가 버튼을 감추는 것은 편의이고 실제 방어가 아니다
- 어긋나면 `409 INVALID_TRANSITION`

같은 규칙을 두 곳에 쓰는 게 중복처럼 보이지만, 프론트는 **보여줄 것을 고르는 것**이고
서버는 **일어날 일을 정하는 것**이라 목적이 다르다.

---

## 4. 두 쪽의 책임 경계

| | 프론트가 한다 | 백엔드가 한다 |
|---|---|---|
| 학교 격리 | 아무것도 안 한다 | 세션의 school_id로 전부 필터링 |
| 권한 | 버튼 노출 여부만 | 실제 차단 (403) |
| 상태 전이 | 어떤 버튼을 그릴지 | 전이 가능 여부 판정 (409) |
| 내 글 판별 | `is_mine`을 받아서 씀 | 세션과 대조해 계산 |
| 오류 문구 | `error.message`를 그대로 표시 | 문구를 만든다 |
| 대화 이력 | 매번 서버에서 다시 읽는다 | DB가 진실원천 |
| 익명성 | 작성자를 표시할 방법이 없다 | 작성자 id를 응답에 넣지 않는다 |

**프론트가 상태로 들고 있어도 되는 것**: 로그인 여부와 역할, 현재 `draft_key`,
열어 둔 민원 id, 입력 중인 텍스트, 모달 열림 여부.

**들고 있으면 안 되는 것**: 민원 목록, 통계, 대화 이력, 코멘트.
전부 화면을 그릴 때 다시 읽는다 — 다른 사람의 변경이 반영되지 않는 사고를 막는다.

---

## 5. 프론트 모듈 배치

```
src/api/
├─ client.js      fetch 래퍼 — credentials·헤더·오류 정규화. 여기만 fetch를 안다
├─ auth.js        7개
├─ draft.js       4개
├─ board.js       4개
└─ admin.js       7개
```

`client.js`가 하는 일

- 모든 요청에 `credentials: 'include'`와 CSRF 헤더를 붙인다
- 응답이 2xx가 아니면 `{ code, message }`를 담은 예외를 던진다 — 호출하는 쪽이 `try/catch` 하나로 처리
- **401이면 로그인 화면으로 보낸다.** 각 함수가 따로 처리하지 않는다

컴포넌트에서 `fetch`를 직접 부르지 않는다. 엔드포인트가 바뀌면 `src/api/` 안에서 끝나야 한다.

---

## 6. 백엔드 계층

```
app/api/routes/     요청 파싱 → 서비스 호출 → 응답 직렬화. 로직 금지
app/services/       ComplaintService — 상태 전이 판정, 대화 왕복 조율
app/db/             DatabaseManager — 쿼리. school_id 필터를 여기서 강제
app/llm/            BedrockClient — 도구 호출로 분류·정제
```

- 라우터는 얇게. 상태 전이 판정을 라우터에 쓰지 않는다
- **`school_id` 필터는 DB 계층에서 강제한다.** 라우터가 빠뜨려도 새지 않도록
- Bedrock 호출은 `app/llm/` 뒤에 가둔다. 모델 교체가 그 안에서 끝나야 한다

---

## 7. 합의가 필요한 것

- **`GET /api/complaints` 페이지네이션** — 민원이 쌓이면 필요하다. 데모 규모에서 미룰지
- **폴링 주기** — "실시간 반영"을 새로고침으로 할지, 몇 초 간격 폴링으로 할지.
  SSE·WebSocket은 1차 범위 밖으로 본다
- **`is_complete=true` 이후 재대화의 미리보기 교체** — 새 확정안이 이전 것을 덮는 게 맞는지
- **비밀번호 정책** — 최소 길이 등. 400 응답 조건에 들어간다
- **`send_message` 타임아웃** — Bedrock이 느릴 때 프론트가 얼마나 기다릴지
