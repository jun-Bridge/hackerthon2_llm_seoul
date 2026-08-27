# UniVoice — 프론트·백엔드 연결 규약

_2026-08-27 · 상태: 합의 대기_

**프론트(JS)와 백엔드(FastAPI)가 서로를 기다리지 않고 각자 만들기 위한 계약서다.**
여기 적힌 것이 두 쪽의 유일한 접점이다. 프론트는 이 함수들을 호출해 화면을 만들고,
백엔드는 이 규약대로 응답한다. **한쪽이 이 문서를 어기면 그건 버그다.**

기능 정의의 출처는 `.kiro/specs/complaint-assistant/`(정본)이고, 이 문서는 그것을
HTTP 경계로 옮긴 것이다. 기능 자체가 궁금하면 그쪽을 본다.

화면 감각은 `docs/anonymous_complain_assistant.html`(시안)을 참고하되,
**시안은 정본보다 앞선 버전이라 상태값·기능이 다르다.** 어긋나는 지점은 8장에 정리했다.
시안을 그대로 옮기면 안 된다.

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

## 1. 연결부 한눈에

22개다. 프론트는 `src/api/`, 백엔드 라우터는 `app/api/routes/`.

| # | 프론트 함수 | HTTP | 백엔드 함수 | 무엇을 하나 | 건드리는 테이블 |
|---|---|---|---|---|---|
| 1 | `lookupSchool` | `POST /auth/school-lookup` | `lookup_school` | 이메일 도메인으로 학교 확인 | `schools` R |
| 2 | `signup` | `POST /auth/signup` | `signup` | 가입 + 자동 로그인 | `schools` R · `admin_codes` R · `users` W |
| 3 | `login` | `POST /auth/login` | `login` | 로그인 | `users` R |
| 4 | `logout` | `POST /auth/logout` | `logout` | 세션 삭제 | — |
| 5 | `getMe` | `GET /auth/me` | `get_me` | 내 정보·역할 | `users` R · `schools` R |
| 6 | `changePassword` | `PATCH /auth/password` | `change_password` | 비밀번호 변경 | `users` R/W |
| 7 | `deleteAccount` | `DELETE /auth/me` | `delete_account` | 탈퇴 | `users` D · `complaints` W(SET NULL) |
| 8 | `startDraft` | `POST /drafts` | `create_draft` | 작성용 키 발급 | — |
| 9 | `sendMessage` | `POST /drafts/{k}/messages` | `send_message` | **AI 되묻기·정제** | `complaint_conversations` W ×2 |
| 10 | `getDraftConversation` | `GET /drafts/{k}/conversation` | `get_draft_conversation` | 대화 복구 | `complaint_conversations` R |
| 11 | `submitDraft` | `POST /drafts/{k}/submit` | `submit_draft` | **정식 접수** | `complaints` W · `complaint_conversations` W |
| 12 | `listComplaints` | `GET /complaints` | `list_complaints` | 게시판 목록 | `complaints` R |
| 13 | `getComplaint` | `GET /complaints/{id}` | `get_complaint` | 상세 (상태 안 바뀜) | `complaints` R · `complaint_comments` R |
| 14 | `getComplaintConversation` | `GET /complaints/{id}/conversation` | `get_complaint_conversation` | 원문 보기 | `complaint_conversations` R |
| 15 | `withdrawComplaint` | `POST /complaints/{id}/withdraw` | `withdraw` | 철회 | `users` R · `complaints` W |
| 16 | `getStats` | `GET /admin/stats` | `get_stats` | 상태별 집계 | `complaints` R |
| 17 | `openComplaint` | `POST /admin/complaints/{id}/open` | `open_complaint` | **상세 + 확인 자동전환** | `complaints` R/W · `complaint_comments` R |
| 18 | `acceptComplaint` | `POST /admin/complaints/{id}/accept` | `accept` | 확인 → 처리중 | `complaints` W |
| 19 | `resolveComplaint` | `POST /admin/complaints/{id}/resolve` | `resolve` | 처리중 → 해결완료 | `complaints` W |
| 20 | `holdComplaint` | `POST /admin/complaints/{id}/hold` | `hold` | 확인 → 보류 **+ 사유** | `complaints` W · `complaint_comments` W |
| 21 | `rejectComplaint` | `POST /admin/complaints/{id}/reject` | `reject` | 확인 → 거절 | `complaints` W |
| 22 | `addComment` | `POST /admin/complaints/{id}/comments` | `add_comment` | 코멘트 추가 | `complaint_comments` W |

`R` 읽기 · `W` 쓰기 · `D` 삭제. 16~22는 `role == 'admin'` 필수, 아니면 403.
**모든 `complaints` 접근에는 `WHERE school_id = <세션값>`이 붙는다.** 아래 개별 항목에서 반복하지 않는다.

---

## 2. 함수별 상세

### 2.1 인증 — `api/auth.js` ↔ `routes/auth.py`

---

#### 1. `lookupSchool` — 이메일로 학교 확인

```js
// src/api/auth.js
/** 가입 화면에서 이메일 입력이 끝나면 호출. 학교명을 미리 보여주고 관리자 코드칸 노출을 정한다. */
export async function lookupSchool(email) { ... }   // → { supported, school_name? }
```
```python
# app/api/routes/auth.py
@router.post("/auth/school-lookup")
def lookup_school(body: SchoolLookupIn) -> SchoolLookupOut:
    school = db.find_school_by_email(body.email)     # schools 조회
    return SchoolLookupOut(supported=school is not None,
                           school_name=school["name"] if school else None)
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `email` | `str` | `@` 뒤를 잘라 `schools.email_domain`과 대조 |

**하는 일** — 오타로 엉뚱한 학교에 민원이 올라가는 사고를 가입 단계에서 막는다.
학교 선택 드롭다운이 없는 이유가 이것이다. **인증 불필요** (가입 전에 부른다).

**반환** `{ "supported": true, "school_name": "조선대학교" }` / `{ "supported": false }`

---

#### 2. `signup` — 가입

```js
export async function signup(email, password, role, adminCode = null) { ... }   // → { user_id }
```
```python
@router.post("/auth/signup", status_code=201)
def signup(body: SignupIn, response: Response) -> SignupOut:
    school = db.find_school_by_email(body.email)        # 없으면 400 UNSUPPORTED_DOMAIN
    if body.role == "admin":
        db.verify_admin_code(school["id"], body.admin_code)   # 불일치면 400
    user_id = db.create_user(school["id"], body.email, body.password, body.role)
    response.set_cookie(...)                            # 가입 즉시 로그인
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `email` | `str` | ✓ | 도메인으로 학교가 정해진다 |
| `password` | `str` | ✓ | 서버에서 해시. 평문 저장 안 함 |
| `role` | `'student' \| 'admin'` | ✓ | |
| `admin_code` | `str` | `role='admin'`일 때만 | `admin_codes.code`와 대조 |

**건드리는 것** — `schools` 조회 → `admin_codes` 조회 → `users` INSERT → 세션 생성

**하는 일** — `school_id`를 **요청에서 받지 않는다.** 이메일 도메인으로 서버가 정한다.
같은 학교 이메일이라는 사실만으로 관리자가 되지는 못한다 — 코드가 따로 필요하다.

**오류** `400 UNSUPPORTED_DOMAIN` · `400 EMAIL_TAKEN` · `400 INVALID_ADMIN_CODE`

---

#### 3. `login` / 4. `logout` / 5. `getMe`

```js
export async function login(email, password) { ... }   // → Me
export async function logout() { ... }                  // → void
export async function getMe() { ... }                   // → Me | null (401이면 null)
```
```python
@router.post("/auth/login")
def login(body: LoginIn, response: Response) -> Me:
    user = db.authenticate_user(body.email, body.password)   # None이면 401
    response.set_cookie(...)                                  # user_id·school_id·role을 세션에

@router.post("/auth/logout", status_code=204)
def logout(response: Response) -> None: ...                   # Redis 세션 삭제 + 쿠키 만료

@router.get("/auth/me")
def get_me(user = Depends(current_user)) -> Me: ...           # 미로그인 401
```

**세션에 담기는 것** — `user_id` · `school_id` · `role`.
**이 셋이 이후 모든 요청의 권한과 격리 범위를 정한다.** 프론트는 이걸 보내지 않는다.

**`getMe`가 특별한 이유** — 앱을 열 때 **가장 먼저** 부른다. 반환된 `role`로 학생 화면과
관리자 화면이 갈린다. 시안의 전환 버튼(`switchView`)은 만들지 않는다.

**오류** `401 INVALID_CREDENTIALS` — 이메일이 없는 건지 비밀번호가 틀린 건지 구분하지 않는다(계정 존재 여부 노출 방지)

---

#### 6. `changePassword` / 7. `deleteAccount`

```js
export async function changePassword(currentPassword, newPassword) { ... }   // → void
export async function deleteAccount(password) { ... }                         // → void
```
```python
@router.patch("/auth/password", status_code=204)
def change_password(body: ChangePasswordIn, user = Depends(current_user)) -> None:
    db.verify_password(user.id, body.current_password)   # 틀리면 401 WRONG_PASSWORD
    db.change_password(user.id, body.new_password)

@router.delete("/auth/me", status_code=204)
def delete_account(body: DeleteAccountIn, user = Depends(current_user)) -> None:
    db.verify_password(user.id, body.password)
    db.delete_user(user.id)        # users DELETE → complaints.submitted_by_user_id = NULL
```

**탈퇴가 건드리는 것** — `users` 행 삭제, `complaints.submitted_by_user_id`가 `NULL`로.
**민원 자체는 남는다.** 학교의 공공 기록이고 게시판은 이미 익명이라 표시에 영향이 없다.
`complaint_conversations`·`complaint_comments`는 민원에 딸려 있으므로 함께 남는다.

프론트는 탈퇴 확인 문구에 "작성한 민원은 익명으로 남습니다"를 적는다.

---

### 2.2 민원 작성 — `api/draft.js` ↔ `routes/draft.py`

---

#### 8. `startDraft` — 작성 시작

```js
export async function startDraft() { ... }   // → { draft_key }
```
```python
@router.post("/drafts", status_code=201)
def create_draft(user = Depends(current_user)) -> DraftOut:
    return DraftOut(draft_key=str(uuid4()))   # DB에 아무것도 안 쓴다
```

**"새 민원 작성"을 누를 때 한 번.** 이 키가 이후 대화 전체를 묶는다.
행은 첫 메시지에서 생기므로 여기서는 키만 발급한다.

---

#### 9. `sendMessage` — **이 서비스의 핵심**

```js
/** 학생 메시지를 보내고 AI 응답을 받는다. 되묻는 중이면 is_complete=false. */
export async function sendMessage(draftKey, message) { ... }   // → RefineResult
```
```python
@router.post("/drafts/{draft_key}/messages")
def send_message(draft_key: str, body: SendMessageIn,
                 user = Depends(current_user)) -> RefineResultOut:
    return service.send_message(draft_key, body.message)

# app/services/complaint_service.py
def send_message(self, draft_key: str, student_message: str) -> dict:
    self.db.add_conversation_turn(draft_key, 'student', student_message)   # ① 학생 발화 저장
    conversation = self.db.get_conversation(draft_key)                     # ② 왕복 전체 로드
    result = self.bedrock.refine_complaint(conversation)                   # ③ 도구 호출
    ai_message = (f"[정리 완료] {result['refined_title']}" if result.get("is_complete")
                  else result["follow_up_question"])
    self.db.add_conversation_turn(draft_key, 'assistant', ai_message)      # ④ AI 발화 저장
    return result
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `draft_key` | `str` (경로) | `startDraft`가 준 키 |
| `message` | `str` (본문) | 학생이 친 구어체 문장 |

**건드리는 것** — `complaint_conversations` INSERT **2행**(학생·AI). Bedrock 호출 1회.
**`complaints`는 건드리지 않는다** — 아직 접수 전이다.

**하는 일** — Bedrock이 도구(`classify_and_refine_complaint`)를 호출할 만큼 정보가 모였는지
스스로 판단한다. 부족하면 도구를 안 부르고 일반 텍스트로 되묻는다.

```jsonc
// 되묻는 경우
{ "is_complete": false, "follow_up_question": "어느 건물 3층인지 알려주시겠어요?" }

// 확정안이 나온 경우
{ "is_complete": true,
  "preview": { "category": "위생 / 배관", "location": "본관 3층 남자화장실",
               "refined_title": "본관 3층 화장실 배수 불량 조치 요청",
               "refined_body": "현상: ...\n영향: ...\n요청: ..." } }
```

**프론트가 `is_complete`로 화면을 가른다.** `false`면 질문을 말풍선으로 띄우고 입력창 유지,
`true`면 미리보기 카드 + "정식 접수" 버튼.

**미리보기가 뜬 뒤에도 같은 함수를 그대로 부른다.** "위치를 4층으로 바꿔줘"도 메시지다 —
**수정 전용 API가 없다.** 대화가 곧 수정 수단이고, 새 결과가 이전 미리보기를 덮는다.

**오류** `502 BEDROCK_ERROR` — 학생 발화는 ①에서 이미 저장됐으므로 다시 보내면 이어진다

---

#### 10. `getDraftConversation` — 새로고침 복구

```js
export async function getDraftConversation(draftKey) { ... }   // → ConversationTurn[]
```
```python
@router.get("/drafts/{draft_key}/conversation")
def get_draft_conversation(draft_key: str, user = Depends(current_user)) -> list[TurnOut]:
    return db.get_conversation(draft_key)      # complaint_id IS NULL, 시간순
```

**프론트는 대화 배열을 자기 상태에만 들고 있지 않는다.** 화면을 다시 그릴 때 이걸 읽는다.
매 턴 DB에 저장되므로 새로고침해도 대화가 살아 있다.

---

#### 11. `submitDraft` — 정식 접수

```js
export async function submitDraft(draftKey) { ... }   // → { complaint_id, next_draft_key }
```
```python
@router.post("/drafts/{draft_key}/submit", status_code=201)
def submit_draft(draft_key: str, user = Depends(current_user)) -> SubmitOut:
    refined = service.last_refined(draft_key)     # 없으면 409 DRAFT_NOT_COMPLETE
    cid = service.submit(user.school_id, user.id, draft_key, refined)
    return SubmitOut(complaint_id=cid, next_draft_key=str(uuid4()))

# service.submit → db.create_complaint
#   ① complaints INSERT (status='미확인', confirmed_at=NULL)
#   ② complaint_conversations UPDATE — 그 draft_key의 모든 행에 complaint_id 채움
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `draft_key` | `str` (경로) | 본문은 비어 있다 |

**본문에 확정안을 싣지 않는 이유** — 프론트가 보낸 값을 그대로 저장하면 화면에서 값을 바꿔
보낼 수 있다. **AI가 확정한 것과 접수된 것이 달라질 여지를 없앤다.**
서버가 그 draft의 마지막 결과를 쓴다.

**`next_draft_key`를 함께 주는 이유** — 접수되면 그 draft는 닫힌다. 다음 민원이 앞 대화와
섞이지 않도록 서버가 새 키를 바로 발급한다. 프론트는 받아서 교체만 하면 되고
`startDraft()`를 다시 부르지 않는다.

**오류** `409 DRAFT_NOT_COMPLETE` — 아직 되묻는 중이라 확정안이 없다

---

### 2.3 게시판 — `api/board.js` ↔ `routes/board.py`

---

#### 12. `listComplaints` / 13. `getComplaint` / 14. `getComplaintConversation`

```js
export async function listComplaints(status = null) { ... }        // → Complaint[]
export async function getComplaint(id) { ... }                     // → Complaint
export async function getComplaintConversation(id) { ... }         // → ConversationTurn[]
```
```python
@router.get("/complaints")
def list_complaints(status: Status | None = None,
                    user = Depends(current_user)) -> list[ComplaintOut]:
    return db.list_complaints(user.school_id, status)   # 철회 제외, 최신순

@router.get("/complaints/{cid}")
def get_complaint(cid: int, user = Depends(current_user)) -> ComplaintOut:
    c = db.get_complaint(cid, user.school_id)           # None이면 404
    c["comments"] = db.get_comments(cid)
    c["is_mine"] = (c.pop("submitted_by_user_id") == user.id)   # ★ 여기서 계산하고 원본은 버린다
    return c

@router.get("/complaints/{cid}/conversation")
def get_complaint_conversation(cid: int, user = Depends(current_user)) -> list[TurnOut]:
    db.get_complaint(cid, user.school_id)               # 소유 학교 확인용, 없으면 404
    return db.get_conversation_by_complaint(cid)
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `status` | `Status?` (쿼리) | 생략하면 **철회를 뺀 전체** |
| `id` | `int` (경로) | 다른 학교 것이면 404 |

**`is_mine` 계산이 중요한 곳** — `submitted_by_user_id`를 세션과 대조해 불린으로 바꾸고
**원본 id는 응답에서 지운다.** 익명성이 여기서 지켜진다. 프론트는 이 값으로 철회 버튼만 그린다.

**목록에서 `comments`는 빈 배열이다.** 상세에서만 채운다.

**학생이 상세를 열어도 상태가 안 바뀐다.** 확인 전환은 관리자 전용(#17)에서만 일어난다.

---

#### 15. `withdrawComplaint` — 철회

```js
export async function withdrawComplaint(id, password) { ... }   // → void
```
```python
@router.post("/complaints/{cid}/withdraw", status_code=204)
def withdraw(cid: int, body: WithdrawIn, user = Depends(current_user)) -> None:
    service.withdraw(cid, user.id, body.password)
    #   ① db.verify_password(user_id, password)   틀리면 401
    #   ② complaints UPDATE status='철회' WHERE id=? AND submitted_by_user_id=?
    #      0행이면 403 NOT_OWNER
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `id` | `int` (경로) | |
| `password` | `str` (본문) | 본인 확인. 잘못 누르는 사고 방지 |

**하드 삭제가 아니라 상태 전환이다.** 레코드는 남고 조회에서만 빠진다.
게시판·관리자 목록 양쪽에서 즉시 사라진다.

**어느 상태에서든 된다.** 관리자가 이미 처리중·해결완료로 바꿨어도 학생은 철회할 수 있다.

프론트는 `is_mine === true`일 때만 버튼을 그린다. **서버는 그것과 무관하게 다시 검사한다.**

---

### 2.4 관리자 — `api/admin.js` ↔ `routes/admin.py`

이 절의 모든 함수는 `role == 'admin'`을 통과해야 한다. 학생이 부르면 **403**.

---

#### 16. `getStats` — 통계 카드

```js
export async function getStats() { ... }   // → { total, by_status }
```
```python
@router.get("/admin/stats")
def get_stats(user = Depends(require_admin)) -> StatsOut:
    return db.get_complaint_stats(user.school_id)   # GROUP BY status, 철회 제외
```

```json
{ "total": 42, "by_status": { "미확인": 5, "확인": 3, "처리중": 8,
                              "해결완료": 20, "보류": 4, "거절": 2 } }
```

**목록 길이로 대신할 수 없어서 따로 있다.** 상태별 집계라 전체를 받아 세지 않으려면 필요하다.
학생 게시판의 건수는 `listComplaints()` 결과 길이를 쓰므로 별도 API가 없다.

---

#### 17. `openComplaint` — **상세 열람 + 확인 자동전환**

```js
/** 목록 행을 클릭할 때 부른다. 상세를 받아오면서 미확인이면 확인으로 바꾼다. */
export async function openComplaint(id) { ... }   // → Complaint
```
```python
@router.post("/admin/complaints/{cid}/open")
def open_complaint(cid: int, user = Depends(require_admin)) -> ComplaintOut:
    service.open_detail(cid, user.school_id)
    #   db.confirm_complaint → UPDATE complaints
    #     SET status='확인', confirmed_at=CURRENT_TIMESTAMP
    #     WHERE id=? AND school_id=? AND status='미확인'      ← 이 조건이 멱등성을 만든다
    return get_complaint(cid, user)     # 갱신된 상세 + 코멘트
```

**건드리는 것** — `complaints` UPDATE(조건부) · `complaint_comments` 조회

**`WHERE status='미확인'`이 핵심이다.** 이미 확인 이후면 0행이 바뀌고 아무 일도 없다.
여러 번 눌러도 안전하고, `confirmed_at`은 **처음 열람한 시각**으로 고정된다.

> **`GET`이 아니라 `POST`인 이유** — 상태를 바꾸기 때문이다. 조회처럼 생겼지만 부작용이 있어서
> `GET`으로 두면 브라우저 프리페치나 프록시 캐시가 **열지도 않은 민원을 확인 처리한다.**

**확인 버튼은 존재하지 않는다.** 열람 자체가 확인 행위다.

---

#### 18~21. 결정 버튼 넷

```js
export async function acceptComplaint(id) { ... }          // 확인   → 처리중
export async function resolveComplaint(id) { ... }         // 처리중 → 해결완료
export async function holdComplaint(id, reason) { ... }    // 확인   → 보류 (사유 필수)
export async function rejectComplaint(id) { ... }          // 확인   → 거절
```
```python
@router.post("/admin/complaints/{cid}/accept")
def accept(cid: int, user = Depends(require_admin)) -> ComplaintOut:
    ok, msg = service.accept(cid, user.school_id)
    #   UPDATE complaints SET status='처리중'
    #   WHERE id=? AND school_id=? AND status='확인'     ← 0행이면 409

@router.post("/admin/complaints/{cid}/resolve")     # ... AND status='처리중'
@router.post("/admin/complaints/{cid}/reject")      # ... AND status='확인'

@router.post("/admin/complaints/{cid}/hold")
def hold(cid: int, body: HoldIn, user = Depends(require_admin)) -> ComplaintOut:
    if not body.reason.strip():
        raise Conflict("HOLD_REASON_REQUIRED", 422)
    ok, msg = service.hold(cid, user.school_id, user.id, body.reason)
    #   ① UPDATE complaints SET status='보류' WHERE ... AND status='확인'
    #   ② complaint_comments INSERT (is_hold_reason=1)   ← 같은 트랜잭션
```

| 함수 | 파라미터 | 전제 상태 | 결과 상태 | 추가로 건드리는 것 |
|---|---|---|---|---|
| `accept` | `id` | `확인` | `처리중` | — |
| `resolve` | `id` | `처리중` | `해결완료` | — |
| `hold` | `id`, `reason` | `확인` | `보류` | `complaint_comments` INSERT |
| `reject` | `id` | `확인` | `거절` | — |

**전부 `200 Complaint`(갱신된 상태)를 돌려준다.** 프론트는 응답으로 화면을 다시 그린다.

**`WHERE status=<전제>`가 전이 검증이다.** 별도 조회 후 판정하지 않는다 —
동시에 두 관리자가 눌러도 하나만 성공한다.

**`hold`는 상태 변경과 코멘트 INSERT가 한 트랜잭션이다.** 사유 없는 보류가 남지 않게.

**오류** `409 INVALID_TRANSITION`(전제 상태 불일치) · `422 HOLD_REASON_REQUIRED`(사유 공백)

---

#### 22. `addComment` — 코멘트 추가

```js
export async function addComment(id, content) { ... }   // → Comment
```
```python
@router.post("/admin/complaints/{cid}/comments", status_code=201)
def add_comment(cid: int, body: CommentIn, user = Depends(require_admin)) -> CommentOut:
    db.get_complaint(cid, user.school_id)          # 학교 확인, 없으면 404
    return db.add_comment(cid, user.id, body.content)   # is_hold_reason=0
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `id` | `int` (경로) | |
| `content` | `str` (본문) | 빈 문자열이면 400 |

**상태와 무관하게 언제든 된다.** 보류로 전환할 때만 사유가 필수일 뿐,
코멘트 자체는 상시 추가되고 **누적**된다. 덮어쓰기가 아니다.

**작성자는 응답에 넣지 않는다.** `author_user_id`는 DB에만 있고 화면에는 "관리자"로만 나온다.

`is_hold_reason`으로 보류 사유와 일반 코멘트를 구분한다 — 프론트가 보류 사유를 강조 표시할 때 쓴다.

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

```js
// src/api/client.js — 여기만 fetch를 안다
const BASE = '/api';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/**
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method
 * @param {string} path            '/complaints/12' 처럼 BASE 뒤 경로
 * @param {object} [body]          있으면 JSON으로 직렬화
 * @param {object} [query]         있으면 쿼리스트링으로
 * @returns {Promise<any>}         204면 undefined
 * @throws  {ApiError}             2xx가 아니면 전부 여기로
 */
export async function request(method, path, { body, query } = {}) {
  const url = BASE + path + (query ? '?' + new URLSearchParams(query) : '');
  const res = await fetch(url, {
    method,
    credentials: 'include',                       // 쿠키 세션 — 모든 요청 필수
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'fetch',                // CSRF 대비
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) { redirectToLogin(); throw new ApiError(401, 'UNAUTHENTICATED', ''); }
  if (res.status === 204) return undefined;

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error.code, data.error.message);
  return data;
}
```

**`client.js`가 지는 책임 세 가지**

| | 왜 여기서 하나 |
|---|---|
| `credentials`·CSRF 헤더 부착 | 22개 함수가 각자 붙이면 하나는 반드시 빠뜨린다 |
| 오류를 `ApiError`로 던짐 | 호출하는 쪽이 `try/catch` 하나로 끝난다. 매번 `res.ok`를 보지 않는다 |
| **401이면 로그인 화면으로** | 세션 만료는 어느 함수에서든 나므로 한 곳에서 처리한다 |

컴포넌트에서 `fetch`를 직접 부르지 않는다. 엔드포인트가 바뀌면 `src/api/` 안에서 끝나야 한다.

**도메인 모듈은 이 위에 얇게 얹는다.**

```js
// src/api/admin.js
import { request } from './client.js';

export const getStats           = ()             => request('GET',  '/admin/stats');
export const openComplaint      = (id)           => request('POST', `/admin/complaints/${id}/open`);
export const acceptComplaint    = (id)           => request('POST', `/admin/complaints/${id}/accept`);
export const resolveComplaint   = (id)           => request('POST', `/admin/complaints/${id}/resolve`);
export const rejectComplaint    = (id)           => request('POST', `/admin/complaints/${id}/reject`);
export const holdComplaint      = (id, reason)   => request('POST', `/admin/complaints/${id}/hold`,     { body: { reason } });
export const addComment         = (id, content)  => request('POST', `/admin/complaints/${id}/comments`, { body: { content } });
```

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

---

## 8. UI 시안과의 차이

`docs/anonymous_complain_assistant.html`은 화면 구성과 톤을 잡는 데 쓴다.
다만 **정본(`.kiro`)보다 앞선 버전이라 그대로 옮기면 어긋난다.** 바뀐 곳은 아래와 같다.

### 8.1 상태값이 다르다 — 가장 많이 틀리는 곳

| 시안 | 정본 |
|---|---|
| `접수` | `미확인` (접수 직후) → `확인` (관리자 열람 시 자동) |
| `수락` | `처리중` → (해결 완료 버튼) → `해결완료` |
| `거절` | `거절` (같음) |
| `보류` | `보류` (같음, 단 **사유 입력이 필수**가 됐다) |
| — | `철회` (학생 전용, 시안에 없음) |

시안은 상태가 넷이고 정본은 일곱이다. 특히 **`수락`이 최종이 아니다** —
`처리중`으로 갈 뿐이고 조치가 끝나면 `해결 완료`를 한 번 더 눌러야 한다.
배지 색과 필터 탭을 시안에서 가져올 때 이 셋(`미확인`·`확인`·`처리중`)을 새로 만들어야 한다.

### 8.2 시안에 없어서 새로 만들어야 하는 것

| 없는 것 | 정본에서 |
|---|---|
| **로그인·가입** | 이메일 도메인으로 학교 자동 매칭, 관리자 코드 |
| **학교 격리** | 모든 화면이 내 학교 데이터만. 시안에는 학교 개념 자체가 없다 |
| **AI 되묻기** | `transformWithAI`가 한 번에 끝난다. 정본은 **여러 턴 왕복**이다 (`is_complete=false`) |
| **철회** | 학생이 본인 민원을 비밀번호 확인 후 철회 |
| **코멘트** | 관리자가 상시 추가, 누적. 보류 시에는 필수 |
| **자동 확인 전환** | 시안은 상세를 열어도 상태가 안 바뀐다. 정본은 여는 순간 `미확인 → 확인` |

### 8.3 시안에 있지만 실제로는 다르게 가는 것

- **`switchView()` — 학생/관리자 화면 전환 버튼**
  시안에서는 버튼으로 오간다. 실제로는 **로그인한 계정의 `role`로 갈린다.**
  전환 버튼을 만들지 않는다. `getMe()`의 `role`을 보고 어느 화면을 그릴지 정한다.

- **`fillSample()` — 예시 채우기**
  데모 편의 기능이다. 남겨도 되지만 API와 무관한 프론트 전용이다.

- **`rawText` 단일 필드**
  시안은 학생이 쓴 원문을 문자열 하나로 들고 있다. 정본은 **대화 왕복 전체**라
  `ConversationTurn[]`이고, `GET /api/complaints/{id}/conversation`으로 읽는다.
  "원문 보기" 토글은 그대로 두되 안에 그리는 것이 배열로 바뀐다.

### 8.4 시안에서 그대로 가져가는 것

관리자 표의 컬럼 구성은 정본과 맞는다 — ID · 분류/위치 · 제목 · 접수 시각 · 상태 · 관리 조치.
`Complaint` 타입이 이걸 그대로 채운다. 상세 모달, 상태 배지, 필터 탭, 통계 카드,
토스트 알림도 구조는 유지한다. **바뀌는 것은 값과 개수이지 구성이 아니다.**

게시판 건수(`feedCount`)는 별도 API를 두지 않는다. `listComplaints()` 결과의 길이를 쓴다.
관리자 통계만 `GET /api/admin/stats`로 따로 받는데, 상태별 집계라 목록만으로는 안 나오기 때문이다.
