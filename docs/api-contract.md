# UniVoice — 프론트·백엔드 연결 규약

_2026-08-27 · 상태: 합의 대기_

**프론트(JS)와 백엔드(FastAPI)가 서로를 기다리지 않고 각자 만들기 위한 계약서다.**
여기 적힌 것이 두 쪽의 유일한 접점이다. 프론트는 이 함수들을 호출해 화면을 만들고,
백엔드는 이 규약대로 응답한다. **한쪽이 이 문서를 어기면 그건 버그다.**

### 이 문서의 경계

**여기에 있는 것** — 주소·인증 방식·요청과 응답의 모양·오류 코드·화면 흐름.
즉 **밖에서 보이는 것**뿐이다.

**여기에 없는 것** — 어느 테이블에 무엇이 들어가는지, SQL이 어떻게 생겼는지,
Redis 키가 무엇인지, 트랜잭션 경계가 어디인지, Bedrock을 어떻게 부르는지.
전부 `backend-design.md`에 있다.

> **FastAPI 라우터는 파사드다.** 이 문서에 적힌 함수 시그니처는 그 파사드의 모양이고,
> 실제 일은 그 안에서 `services` → `repo`/`session`/`llm`으로 나뉘어 처리된다.
> **내부 구조가 바뀌어도 이 계약은 그대로여야 한다.** 그게 갈라 둔 이유다.

| 문서 | 무엇 | 누가 |
|---|---|---|
| `api-contract.md` (여기) | 연결부 | 프론트·백 공통 |
| `backend-design.md` | 서버 안쪽 모듈·흐름 | 백엔드 |
| `.kiro/specs/complaint-assistant/` | 무엇을 왜 만드나 | 전원 |

기능 정의의 출처는 `.kiro/specs/complaint-assistant/`(정본)이고, 이 문서는 그것을
HTTP 경계로 옮긴 것이다. 기능 자체가 궁금하면 그쪽을 본다.

화면 감각은 `docs/`의 시안 두 개를 참고하되, **둘 다 정본보다 앞선 버전이라
상태값·기능이 다르다.** 어긋나는 지점은 8장에 정리했다. 시안을 그대로 옮기면 안 된다.

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

**HttpOnly 쿠키 + Redis 세션.** 로그인하면 서버가 세션을 Redis에 만들고 `Set-Cookie`로
세션 id를 내려준다. 이후 모든 요청에 자동으로 실린다. 프론트는 토큰을 저장하지도 붙이지도 않는다.

**세션 실체가 Redis에 있어야 하는 이유**: 워커가 여럿이다. 프로세스 메모리에 두면 다음 요청이
다른 워커로 갈 때 로그인이 풀린다. Redis에 있으면 어느 워커가 받든 같고, 새로고침해도 유지된다.

```
Redis   sess:{session_id}          → { user_id, school_id, role }
        draft:{draft_key}:owner    → user_id
        draft:{draft_key}:running  → 진행 중인 턴 표시 (SET NX)
```

**세션 TTL은 요청마다 연장한다(sliding).** 고정 만료면 민원을 길게 쓰는 도중 로그아웃된다.
활동이 있는 한 유지되고, 손을 놓으면 만료된다.

**초안 TTL은 연장하지 않는다.** 발급 시점부터 고정이다. 미접수 초안은 버려도 되는 데이터라
오래 붙들 이유가 없다. 만료된 키로 접근하면 **404 `DRAFT_NOT_FOUND`** —
프론트는 이걸 받으면 새 초안을 시작한다.

**`draft:{key}:owner`가 초안 소유권을 만든다.** `complaint_conversations`에 작성자 컬럼이 없어서
이게 없으면 남의 `draft_key`를 아는 사람이 그 대화를 읽고 이어 쓸 수 있다.
draft 엔드포인트(#8~#11)는 전부 이 값을 세션의 `user_id`와 대조하고, 어긋나면 403.

**그 외에는 아무것도 캐시하지 않는다.** 민원 목록·통계·코멘트는 매번 PostgreSQL에서 다시 읽는다.
다른 사용자가 계속 바꾸는 데이터라 캐시하면 누군가는 낡은 것을 본다.

```js
fetch(url, { credentials: 'include', ... })   // 모든 요청에 이것만 붙이면 된다
```

- 상태를 바꾸는 요청(POST/PATCH/DELETE)에는 `X-Requested-With: fetch` 헤더를 붙인다. CSRF 대비.
- 세션이 없거나 만료면 **401**. 프론트는 401을 받으면 로그인 화면으로 보낸다.
- **프론트를 같은 서버(8501)가 서빙하므로 동일 출처다. CORS 설정이 필요 없다.**
- HTTPS가 없으면 쿠키에 `Secure`를 달 수 없다. EC2 IP로 http 접속이면 `SameSite=Lax`로 간다.

### 학교 격리 — 프론트가 신경 쓰지 않는다

**모든 조회·변경은 서버가 로그인 세션의 `school_id`로 자동 필터링한다.**
프론트는 `school_id`를 보내지 않고, 보내도 무시된다.
다른 학교 데이터는 존재 여부조차 알 수 없다(404).

이 규칙이 있어서 프론트 코드에 학교 관련 분기가 하나도 없다.

### 오류 형식

모든 오류는 같은 모양이다.

```json
{ "error": { "code": "INVALID_TRANSITION", "message": "먼저 상세를 열람해야 합니다." } }
```

| HTTP | 언제 |
|---|---|
| 400 | 입력 형식 오류 (빈 값, 길이 초과, 이메일 형식 아님, 비밀번호 규칙 위반) |
| 401 | 로그인 안 됨 / 세션 만료 |
| 403 | 로그인했으나 권한 없음 (학생이 관리자 API 호출 등) |
| 404 | 없거나 볼 권한 없음 — **다른 학교 것도 404** (존재 여부를 흘리지 않는다) |
| 409 | 상태 충돌 (확인 안 된 민원에 수락 시도 등) |
| 422 | 비즈니스 규칙 위반 (보류인데 사유 없음 등) |
| 502 | Bedrock 호출 실패 |

프론트는 **`error.code`로 분기하고 `error.message`를 그대로 보여준다.**
메시지 문구를 프론트가 만들지 않는다 — 문구가 두 곳에 흩어지면 관리가 안 된다.

### 오류 코드 전체

프론트가 분기에 쓸 수 있는 코드는 이것뿐이다. **여기 없는 코드를 서버가 보내지 않는다.**

| 코드 | HTTP | 언제 | 프론트가 할 일 |
|---|---|---|---|
| `UNSUPPORTED_DOMAIN` | 400 | 등록되지 않은 이메일 도메인 | 가입 버튼 비활성 + 안내 |
| `EMAIL_TAKEN` | 409 | 이미 가입된 이메일 | **이메일 칸에 경고** + 로그인 링크 |
| `INVALID_ADMIN_CODE` | 400 | 코드를 넣었는데 안 맞음 | **코드 칸에 경고.** 비우면 학생이 된다고 안내 |
| `VALIDATION_FAILED` | 400 | 형식·길이 규칙 위반 | 해당 입력칸에 표시 |
| `INVALID_CREDENTIALS` | 401 | 로그인 실패 | 폼에 표시 (계정 존재 여부는 구분하지 않는다) |
| `UNAUTHENTICATED` | 401 | 미로그인·세션 만료 | **`client.js`가 처리.** 로그인 화면으로 |
| `WRONG_PASSWORD` | 401 | 비밀번호 재확인 실패 (변경·탈퇴·철회) | **비밀번호 칸에 경고.** 창을 유지하고 다시 입력받는다. **다음 단계로 넘어가지 않는다** |
| `FORBIDDEN_ROLE` | 403 | 역할에 없는 API 호출 | 일어나면 안 되는 일. 화면 분기 버그 |
| `NOT_OWNER` | 403 | 내 것이 아닌 초안·민원 | 목록 새로고침 |
| `NOT_FOUND` | 404 | 없거나 볼 권한 없음 (철회 포함) | 목록으로 돌려보냄 |
| `DRAFT_NOT_FOUND` | 404 | 초안 TTL 만료 | 새 초안 시작 |
| `DRAFT_NOT_COMPLETE` | 409 | 확정안 없이 접수 시도 | 접수 버튼을 감췄어야 한다 |
| `TURN_IN_PROGRESS` | 409 | 이전 턴이 아직 진행 중 | 입력창을 잠갔어야 한다 |
| `INVALID_TRANSITION` | 409 | 현재 상태에서 갈 수 없는 전이 | 상세를 다시 받아 버튼 재계산 |
| `HOLD_REASON_REQUIRED` | 422 | 보류인데 사유가 비었다 | 모달에서 미리 막았어야 한다 |
| `BEDROCK_ERROR` | 502 | 모델 호출 실패 | 재시도 버튼. 대화는 남아 있다 |

**"일어나면 안 되는 일"로 적힌 것들**(`FORBIDDEN_ROLE`·`DRAFT_NOT_COMPLETE`·`TURN_IN_PROGRESS`·
`HOLD_REASON_REQUIRED`)은 프론트가 이미 막았어야 하는 경우다.
받았다면 화면 상태가 서버와 어긋난 것이므로, 조용히 삼키지 말고 상태를 다시 받아온다.

### 입력 검증

서버가 정본이다. 프론트는 같은 규칙으로 미리 걸러 경험을 좋게 할 뿐이고, **막는 것은 서버다.**

| 필드 | 규칙 |
|---|---|
| `email` | 형식 검사 + 등록된 도메인. 소문자로 정규화해 저장 |
| `password` | 8자 이상 |
| `admin_code` | 공백 제거 후 대조 |
| `message` (초안) | 1자 이상, 2000자 이하 |
| `reason` (보류) | 공백 제거 후 1자 이상 |
| `content` (코멘트) | 공백 제거 후 1자 이상, 1000자 이하 |

길이 상한은 요청 본문 크기 제한(413)과 별개다 — 여기 걸리면 400이다.

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
  comments: Comment[];      // ★ 목록과 상세에서 내용이 다르다 — 아래 참조
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

> **`comments`는 어디서 왔느냐에 따라 내용이 다르다.**
>
> | 어디서 | 담기는 것 |
> |---|---|
> | 목록 (#12) | **보류 사유만** (`is_hold_reason=true`) |
> | 상세 (#13 · #17) | **전부** |
>
> 목록에 전부 실으면 응답이 무거워지는데, 게시판 카드에 보류 사유는 보여야 해서(US-3.6)
> 그것만 골라 싣는다. **타입이 같으므로 프론트가 헷갈리기 쉽다** — 카드에서 "코멘트 N개"를
> 세면 안 된다. 개수는 상세를 열어야 정확하다.

---

## 1. 연결부 한눈에

> **아키텍처 전제** — FastAPI(uvicorn) 워커 여러 개가 8501 포트에 뜨고,
> **PostgreSQL**(확정 데이터)과 **Redis**(세션·초안 소유권)를 공유한다.
> 프론트 정적 파일도 같은 서버가 서빙하므로 CORS가 없다.
>
> 워커가 여럿이라는 사실이 이 계약의 여러 곳을 정한다 — 세션이 Redis에 있어야 하는 이유,
> 전이 검증이 `UPDATE ... WHERE`인 이유, 목록·통계를 캐시하지 않는 이유가 전부 여기서 나온다.

24개다. 프론트는 `src/api/`, 백엔드 라우터는 `app/api/routes/`.

| # | 프론트 함수 | HTTP | 백엔드 함수 | 무엇을 하나 | 건드리는 테이블 |
|---|---|---|---|---|---|
| 1 | `listSchools` | `GET /schools` | `list_schools` | 지원 학교 목록 (가입 드롭다운) | `schools` R |
| 2 | `signup` | `POST /auth/signup` | `signup` | 가입 + 자동 로그인 | `schools` R · `admin_codes` R · `users` W |
| 3 | `login` | `POST /auth/login` | `login` | 로그인 | `users` R |
| 4 | `logout` | `POST /auth/logout` | `logout` | 세션 삭제 | — |
| 5 | `getMe` | `GET /auth/me` | `get_me` | 내 정보·역할 | `users` R · `schools` R |
| 6 | `changePassword` | `PATCH /auth/password` | `change_password` | 비밀번호 변경 | `users` R/W |
| 7 | `deleteAccount` | `DELETE /auth/me` | `delete_account` | 탈퇴 | `users` D · `complaints` W(SET NULL) |
| 7-1 | `verifyPassword` | `POST /auth/verify-password` | `verify_password` | 비밀번호 확인만 | `users` R |
| 8 | `startDraft` | `POST /drafts` | `create_draft` | 작성용 키 발급 | Redis W |
| 9 | `sendMessage` | `POST /drafts/{k}/messages` | `send_message` | **AI 되묻기·정제** | `complaint_conversations` W ×2 · `bedrock_logs` W · Redis R/W |
| 10 | `getDraftConversation` | `GET /drafts/{k}/conversation` | `get_draft_conversation` | 대화 복구 | `complaint_conversations` R · Redis R |
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
| 23 | `getBedrockLogs` | `GET /admin/bedrock-logs` | `get_bedrock_logs` | 호출 로그 (심사용) | `bedrock_logs` R |

`R` 읽기 · `W` 쓰기 · `D` 삭제. 16~23은 `role == 'admin'` 필수, 아니면 403.
**모든 `complaints` 접근에는 `WHERE school_id = <세션값>`이 붙는다.** 아래 개별 항목에서 반복하지 않는다.

---

## 2. 함수별 상세

### 2.1 인증 — `api/auth.js` ↔ `routes/auth.py`

---

#### 1. `listSchools` — 지원 학교 목록

```js
/** 가입 화면에서 지원 학교를 보여준다. 인증 불필요. */
export async function listSchools() { ... }   // → School[]
```
```python
@router.get("/schools")
def list_schools() -> list[SchoolOut]:
```

```ts
interface School {
  name: string;          // '조선대학교'
  email_domain: string;  // 'chosun.ac.kr'
  aliases: string[];     // ['조선대', '조대'] — 검색용
}
```

**가입 화면이 이걸로 돌아간다.** 사용자가 학교를 고르면 **도메인이 잠기고** 이메일 아이디만
입력한다. 프론트가 `아이디 + '@' + email_domain`으로 이메일을 완성해 `signup`에 보낸다.

**이 방식이 도메인 오타를 원천 차단한다.** 고를 수만 있으므로 존재하지 않는 도메인을 쓸 수 없고,
다른 학교 도메인을 자기 학교에 붙일 수도 없다. 서버는 여전히 도메인으로 학교를 정하므로
**학교를 정하는 근거는 하나(도메인)뿐이다** — 프론트가 보낸 학교 이름을 믿지 않는다.

**`aliases`가 있는 이유**: 한국 학교 이름은 줄여 부르는 쪽이 자연스럽다.
"조대"·"전북대"·"지스트"로 찾을 수 있어야 목록이 쓸모가 있다.
`schools` 테이블에 별칭 컬럼이 필요하다 — **정본 스키마에 없다.**

```sql
ALTER TABLE schools ADD COLUMN aliases TEXT[];   -- PostgreSQL 배열
```

**인증이 필요 없다.** 가입 전에 부르기 때문이다. 학교 목록은 공개 정보다.

---

#### 2. `signup` — 가입

```js
/**
 * 가입 화면: 학교 드롭다운 · 이메일 아이디 · 비밀번호 · 학교 코드(선택)
 * @param {string}  email     프론트가 `아이디 + '@' + 고른학교.email_domain`으로 조립
 * @param {?string} adminCode  비우면 학생. 채우면 검증해서 교직원 — 틀리면 400
 */
export async function signup(email, password, adminCode = null) { ... }   // → { user_id, role }
```
```python
@router.post("/auth/signup", status_code=201)
def signup(body: SignupIn, response: Response) -> SignupOut:
    # 역할은 admin_code가 정한다 — 클라이언트가 "나 교직원"이라 주장할 방법이 없다
    if not code:
        role = "student"
        role = "admin"
    else:
    response.set_cookie(...)                            # 가입 즉시 로그인
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `email` | `str` | ✓ | 프론트가 `아이디@고른학교도메인`으로 조립. 도메인으로 학교가 정해진다 |
| `password` | `str` | ✓ | 서버에서 해시. 평문 저장 안 함 |
| `admin_code` | `str?` | ✗ | **비우면 학생.** 채우면 그 학교의 `admin_codes.code`와 대조 |

**역할을 코드가 정한다.**

| 코드 칸 | 결과 |
|---|---|
| 비어 있음 (공백만 있어도) | `student`로 가입 |
| 채워졌고 그 학교 코드와 일치 | `admin`으로 가입 |
| 채워졌는데 안 맞음 | **`400 INVALID_ADMIN_CODE`** — 가입되지 않는다 |

**"교직원입니다" 같은 불린을 받지 않는다.** 받으면 클라이언트가 스스로 관리자라고 주장할 수 있다.
코드는 서버만 아는 값이라 그것 하나로 판정하면 주장할 여지가 없다.

**틀린 코드를 조용히 학생으로 강등시키지 않는다.** 그러면 관리자로 가입된 줄 알고
관리자 화면을 찾다 헤맨다. 막고 알린다.

**응답에 `role`을 함께 준다.** 가입 직후 어느 화면으로 갈지 프론트가 알아야 한다.

**효과** — 계정이 만들어지고 **바로 로그인 상태가 된다**(쿠키가 함께 내려온다).

**하는 일** — `school_id`를 **요청에서 받지 않는다.** 이메일 도메인으로 서버가 정한다.
프론트가 드롭다운으로 도메인을 붙여줬더라도 **서버는 그 문자열을 다시 도메인으로 조회한다** —
화면이 무엇을 보여줬든 학교를 정하는 근거는 도메인 하나다.

같은 학교 이메일이라는 사실만으로 교직원이 되지는 못한다 — 코드가 따로 필요하다.
토글은 화면의 편의일 뿐이고 **실제 판정은 코드 대조다.** 토글만 켜고 코드가 틀리면 400이다.

**오류와 화면 표시**

**되돌릴 수 없는 동작의 공통 흐름** (철회 · 탈퇴)

| 단계 | 화면 | API |
|---|---|---|
| 1 | 경고 + 비밀번호 | `verifyPassword(pw)` (#7-1) |
| | 틀림 | 창 유지 + 경고. **실행 API를 부르지 않는다** |
| 2 | "정말 삭제하시겠습니까?" | 없음 (화면 상태) |
| 3 | 삭제 실행 | `withdrawComplaint` (#15) 또는 `deleteAccount` (#7) |
| | 완료 | "삭제되었습니다" 알림 |

**가입 화면 경고**

| 코드 | HTTP | 어디에 무엇을 |
|---|---|---|
| `UNSUPPORTED_DOMAIN` | 400 | 이메일 칸 아래 — "지원하지 않는 학교입니다" + 지원 학교 보기(#1) |
| `EMAIL_TAKEN` | 409 | 이메일 칸 아래 — "이미 가입된 이메일입니다" + 로그인 화면 링크 |
| `INVALID_ADMIN_CODE` | 400 | 코드 칸 아래 — "유효하지 않은 코드입니다. 비워두면 학생으로 가입됩니다" |

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

@router.delete("/auth/me", status_code=204)
def delete_account(body: DeleteAccountIn, user = Depends(current_user)) -> None:
```

**탈퇴도 철회와 같은 세 단계를 탄다** — 경고 + 비밀번호(`verifyPassword`) → 최종 확인 → 실행.
되돌릴 수 없는 정도가 철회보다 크므로 경고 문구를 더 분명히 한다.

**탈퇴가 건드리는 것** — `users` 행 삭제, `complaints.submitted_by_user_id`가 `NULL`로.
**민원 자체는 남는다.** 학교의 공공 기록이고 게시판은 이미 익명이라 표시에 영향이 없다.
`complaint_conversations`·`complaint_comments`는 민원에 딸려 있으므로 함께 남는다.

프론트는 탈퇴 확인 문구에 "작성한 민원은 익명으로 남습니다"를 적는다.

---

#### 7-1. `verifyPassword` — 비밀번호만 확인

```js
/** 되돌릴 수 없는 동작 전에 본인 확인만 한다. 아무것도 바꾸지 않는다. */
export async function verifyPassword(password) { ... }   // → void (틀리면 throw)
```
```python
@router.post("/auth/verify-password", status_code=204)
def verify_password(body: VerifyIn, user = Depends(current_user)) -> None:
```

**왜 따로 있나** — 철회·탈퇴는 **본인 확인 → 최종 확인 → 실행** 세 단계다.
비밀번호가 틀렸다는 것을 "정말 삭제하시겠습니까?"를 지나기 **전에** 알려야 하는데,
실행 API 하나뿐이면 확인창을 지난 뒤에야 알게 된다. 순서가 뒤집힌다.

**아무것도 바꾸지 않는다.** 조회만 하고 204나 401을 돌려준다.

**실행 API도 비밀번호를 다시 받아 검증한다.** 이 호출은 화면 흐름을 위한 것이지
실행 권한을 주는 것이 아니다. 여기를 건너뛰고 철회를 직접 불러도 서버가 막는다.

**남용 방지**: 실패 횟수를 세어 제한한다(값은 7장).

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
    key = str(uuid4())
    return DraftOut(draft_key=key)                          # PostgreSQL에는 아직 안 쓴다
```

**"새 민원 작성"을 누를 때 한 번.** 이 키가 이후 대화 전체를 묶는다.
행은 첫 메시지에서 생기므로 여기서는 키만 발급한다.

**소유권은 Redis가 쥔다.** 키를 발급하면서 `draft:{draft_key}:owner = user_id`를 함께 쓴다.
이후 draft 엔드포인트는 전부 이 값을 세션의 `user_id`와 대조하고, 어긋나면 **403**이다.

`complaint_conversations`에 작성자 컬럼이 없어 DB만으로는 검증이 안 되는데, 초안은 접수 전
임시 데이터라 영속 컬럼을 늘리기보다 Redis에 수명을 맞추는 편이 맞다.
접수되는 순간 소유권은 `complaints.submitted_by_user_id`로 넘어간다.

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
    require_draft_owner(draft_key, user.id)      # Redis 대조, 어긋나면 403

def send_message(self, draft_key: str, student_message: str) -> dict:
    result = self.bedrock.refine_complaint(conversation)                   # ③ 도구 호출
    ai_message = (f"[정리 완료] {result['refined_title']}" if result.get("is_complete")
                  else result["follow_up_question"])
    return result
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `draft_key` | `str` (경로) | `startDraft`가 준 키 |
| `message` | `str` (본문) | 학생이 친 구어체 문장 |

**효과** — 학생 발화와 AI 응답이 대화 기록에 남는다. **민원이 만들어지지는 않는다** —
접수는 #11에서만 일어난다. 확정안은 서버가 보관하고, 접수 때 그것을 쓴다.

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

**한 초안에서 턴은 하나만 돈다.** 응답이 오기 전에 또 보내면 Bedrock 호출이 둘 다 돌고
대화 순서가 꼬인다. Redis에 진행 표시를 세워 막는다.

```python
try:
finally:
```

`nx=True`가 핵심이다 — 워커가 여럿이라 "있는지 보고 세우기"로 하면 두 워커가 동시에 통과한다.
`SET NX`는 Redis가 원자적으로 처리해 하나만 성공한다. `ex`를 주는 이유는 워커가 죽어도
표시가 영원히 남지 않게 하기 위해서다.

**프론트는 응답이 올 때까지 입력창을 잠근다.** 409를 받을 일이 없어야 정상이고,
받았다면 이중 클릭이나 재시도가 겹친 것이다.

**오류**
`409 TURN_IN_PROGRESS` — 이전 턴이 아직 돌고 있다
`502 BEDROCK_ERROR` — 학생 발화는 ①에서 이미 저장됐으므로 다시 보내면 이어진다

---

#### 10. `getDraftConversation` — 새로고침 복구

```js
export async function getDraftConversation(draftKey) { ... }   // → ConversationTurn[]
```
```python
@router.get("/drafts/{draft_key}/conversation")
def get_draft_conversation(draft_key: str, user = Depends(current_user)) -> list[TurnOut]:
    require_draft_owner(draft_key, user.id)    # 읽기도 소유권을 본다
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
    require_draft_owner(draft_key, user.id)
    next_key = str(uuid4())
    return SubmitOut(complaint_id=cid, next_draft_key=next_key)

```

> **확정안은 서버가 보관한다.** 프론트가 들고 있다가 접수 때 되돌려보내지 않는다.
> 보관 방식은 `backend-design.md` §7-1.3.

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
    for r in rows:
        r["is_mine"] = (r.pop("submitted_by_user_id") == user.id)      # 목록에서도 계산
    return rows

@router.get("/complaints/{cid}")
def get_complaint(cid: int, user = Depends(current_user)) -> ComplaintOut:
    c["is_mine"] = (c.pop("submitted_by_user_id") == user.id)   # ★ 여기서 계산하고 원본은 버린다
    return c

@router.get("/complaints/{cid}/conversation")
def get_complaint_conversation(cid: int, user = Depends(current_user)) -> list[TurnOut]:
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `status` | `Status?` (쿼리) | 생략하면 **철회를 뺀 전체** |
| `id` | `int` (경로) | 다른 학교 것이면 404 |

**`is_mine` 계산이 중요한 곳** — `submitted_by_user_id`를 세션과 대조해 불린으로 바꾸고
**원본 id는 응답에서 지운다.** 익명성이 여기서 지켜진다. 프론트는 이 값으로 철회 버튼만 그린다.

**목록의 `comments`에는 보류 사유만 담는다.** 정본 US-3.6이 "관리자가 남긴 코멘트, 특히 보류 사유를
게시판에서도 확인할 수 있어야 한다"고 요구하는데, 학생 화면은 카드 목록이라 상세를 따로 열지 않는다.
그래서 **`is_hold_reason=1`인 것만** 목록에 실어 보낸다. 전부 실으면 응답이 무거워진다.
상세(`getComplaint`)에서는 전부 채운다.

**`is_mine`은 목록에서도 계산한다.** 철회 버튼이 게시판 카드에 붙기 때문이다.

**학생이 상세를 열어도 상태가 안 바뀐다.** 확인 전환은 관리자 전용(#17)에서만 일어난다.

**철회된 민원은 id로 직접 조회해도 404다.** 목록에서만 빼면 링크를 아는 사람에게는 계속 보인다.
목록·상세·원문·관리자 상세가 전부 같다 — 철회된 것은 어느 경로로도 보이지 않는다.

---

#### 15. `withdrawComplaint` — 철회

```js
export async function withdrawComplaint(id, password) { ... }   // → void
```
```python
@router.post("/complaints/{cid}/withdraw", status_code=204)
def withdraw(cid: int, body: WithdrawIn, user = Depends(current_user)) -> None:
    #      0행이면 403 NOT_OWNER
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `id` | `int` (경로) | |
| `password` | `str` (본문) | 본인 확인 |

**철회 흐름 — 세 단계**

```
철회 버튼
  │
  ├─[1] 경고 + 비밀번호 창
  │     "철회하면 게시판과 관리자 목록 양쪽에서 즉시 사라지고 되돌릴 수 없습니다."
  │     + 비밀번호 입력칸
  │       [취소] → 아무것도 부르지 않는다
  │       [확인] → verifyPassword(pw)   (#7-1)
  │                 ├─ 401 WRONG_PASSWORD
  │                 │    → **창을 닫지 않는다.** "비밀번호가 일치하지 않습니다" 경고,
  │                 │      칸을 비우고 포커스를 되돌린다
  │                 └─ 204 → 2단계로
  │
  └─[2] 최종 확인창
        "정말 삭제하시겠습니까? 이 동작은 되돌릴 수 없습니다."
          [취소] → 아무것도 부르지 않는다. 민원은 그대로
          [삭제] → withdrawComplaint(id, pw)
                     └─ 204 → 창을 닫고 **"삭제되었습니다"** 알림 → 목록에서 사라진다
```

**왜 비밀번호가 먼저인가** — 순서를 바꾸면 "정말 삭제하시겠습니까?"에 확인을 누른 뒤에야
비밀번호가 틀렸다는 걸 알게 된다. 결심을 두 번 하게 만드는 셈이다.

**비밀번호가 틀렸을 때 창을 닫지 않는다.** 처음부터 다시 여는 건 사고에 가깝다.

**서버는 두 번 다 검증한다.** 1단계를 건너뛰고 철회를 직접 불러도 막힌다 —
1단계는 화면 흐름을 위한 것이지 실행 권한을 주는 것이 아니다.

**하드 삭제가 아니라 상태 전환이다.** 레코드는 남고 조회에서만 빠진다.
게시판·관리자 목록 양쪽에서 즉시 사라진다.

**어느 상태에서든 된다.** 관리자가 이미 처리중·해결완료로 바꿨어도 학생은 철회할 수 있다.

프론트는 `is_mine === true`일 때만 버튼을 그린다. **서버는 그것과 무관하게 다시 검사한다.**

---

### 2.4 관리자 — `api/admin.js` ↔ `routes/admin.py`

이 절의 모든 함수는 `role == 'admin'`을 통과해야 한다. 학생이 부르면 **403**.

**역할 경계 전체**

| 묶음 | 학생 | 관리자 |
|---|---|---|
| 인증 #1~7 | ○ | ○ |
| 초안·작성 #8~11 | ○ | **✗ 403** — 민원을 넣는 것은 학생의 일이다 |
| 게시판 조회 #12~14 | ○ | ○ (같은 엔드포인트. 응답이 같으므로 나누지 않는다) |
| 철회 #15 | 본인 것만 | ✗ 403 |
| 관리자 #16~23 | **✗ 403** | ○ |

관리자가 민원을 넣을 일이 생기면 학생 계정을 따로 쓴다. 한 계정이 두 역할을 겸하지 않는다.

---

#### 16. `getStats` — 통계 카드

```js
export async function getStats() { ... }   // → { total, by_status }
```
```python
@router.get("/admin/stats")
def get_stats(user = Depends(require_admin)) -> StatsOut:
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
    #     SET status='확인', confirmed_at=CURRENT_TIMESTAMP
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

@router.post("/admin/complaints/{cid}/resolve")     # ... AND status='처리중'
@router.post("/admin/complaints/{cid}/reject")      # ... AND status='확인'

@router.post("/admin/complaints/{cid}/hold")
def hold(cid: int, body: HoldIn, user = Depends(require_admin)) -> ComplaintOut:
    if not body.reason.strip():
```

| 함수 | 파라미터 | 전제 상태 | 결과 상태 | 추가로 건드리는 것 |
|---|---|---|---|---|
| `accept` | `id` | `확인` | `처리중` | — |
| `resolve` | `id` | `처리중` | `해결완료` | — |
| `hold` | `id`, `reason` | `확인` | `보류` | 사유가 코멘트로 함께 남는다 |
| `reject` | `id` | `확인` | `거절` | — |

**전부 `200 Complaint`(갱신된 상태)를 돌려준다.** 프론트는 응답으로 화면을 다시 그린다.

**`WHERE status=<전제>`가 전이 검증이다.** 별도 조회 후 판정하지 않는다.

워커가 여럿이라 이게 중요하다. 조회해서 상태를 보고 판정하면 두 관리자가 동시에 눌렀을 때
**둘 다 통과한다** — 각자 다른 워커에서 같은 값을 읽기 때문이다.
`UPDATE`의 `WHERE`에 조건을 넣으면 DB가 직렬화해 하나만 1행을 바꾸고 나머지는 0행 → `409`.

**보류는 상태와 사유가 함께 성립한다.** 하나만 반영되는 일이 없다 —
사유 없는 보류도, 보류 아닌 사유도 남지 않는다.

**오류** `409 INVALID_TRANSITION`(전제 상태 불일치) · `422 HOLD_REASON_REQUIRED`(사유 공백)

---

#### 23. `getBedrockLogs` — 호출 로그 (대회 심사용)

```js
export async function getBedrockLogs(limit = 50) { ... }   // → BedrockLog[]
```
```python
@router.get("/admin/bedrock-logs")
def get_bedrock_logs(limit: int = 50, user = Depends(require_admin)) -> list[BedrockLogOut]:
```

```ts
interface BedrockLog {
  id: number;
  called_at: string;
  model_id: string;          // 'global.anthropic.claude-sonnet-5'
  is_complete: boolean;      // 도구 호출 성사 여부
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
}
```

정본 **US-5.1**("심사위원으로서 Bedrock 호출 로그를 확인하고 싶다")을 위한 것이다.
**대회 심사 기준에 들어 있는데 계약서 초안에 빠져 있었다.**

> **저장 범위** — 호출 시각·모델 id·도구 호출 성사 여부·지연·토큰·오류.
> **프롬프트와 응답 본문은 저장하지 않는다** — 민원 내용이 두 곳에 중복 보관되면
> 익명성 관리 대상이 늘어난다. 심사에 필요한 것은 호출이 일어났다는 사실과 지연·토큰이다.
>
> 테이블 정의는 `.kiro` 스키마, 적재 시점은 `backend-design.md` §8.5.

정본 **US-5.1**("심사위원으로서 Bedrock 호출 로그를 확인하고 싶다")을 위한 것이다.
**대회 심사 기준에 들어 있는데 계약서 초안에 빠져 있었다.**

> **저장 범위** — 호출 시각 · 모델 id · 도구 호출 성사 여부 · 지연 · 토큰 · 오류.
> **프롬프트와 응답 본문은 저장하지 않는다** — 민원 내용이 두 곳에 중복 보관되면
> 익명성 관리 대상이 늘어난다.
>
> 테이블 정의는 `.kiro` 스키마, 적재 시점은 `backend-design.md` §8.5.
>
> `BedrockClient.refine_complaint()`가 호출할 때마다 1행씩 남긴다.
> **프롬프트와 응답 본문은 저장하지 않는다** — 민원 내용이 로그에 중복 보관되면
> 익명성 관리 대상이 두 곳으로 늘어난다. 심사에 필요한 것은 "호출이 실제로 일어났다"는
> 사실과 지연·토큰이지 내용이 아니다.

---

#### 22. `addComment` — 코멘트 추가

```js
export async function addComment(id, content) { ... }   // → Comment
```
```python
@router.post("/admin/complaints/{cid}/comments", status_code=201)
def add_comment(cid: int, body: CommentIn, user = Depends(require_admin)) -> CommentOut:
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

## 3-1. 무엇이 바뀌면 무엇을 다시 받나

목록·통계를 캐시하지 않는다는 원칙이 있어도, **언제 다시 받을지**는 정해야 한다.
안 그러면 상태를 바꾼 뒤 화면에 옛 숫자가 남는다.

| 한 일 | 다시 받을 것 |
|---|---|
| 로그인 · 앱 진입 | `getMe` → 역할에 맞는 첫 화면 데이터 |
| 민원 접수 (#11) | `listComplaints` (내 글이 목록에 뜬다) |
| 철회 (#15) | `listComplaints` (+ 관리자 화면이면 `getStats`) |
| 상세 열람 (#17) | 응답이 갱신된 `Complaint`다. **목록의 그 행도 갱신한다** — 미확인→확인으로 바뀌었다. `getStats`도 다시 받는다 |
| 수락·해결·보류·거절 (#18~21) | 응답이 갱신된 `Complaint`. 목록 행 교체 + `getStats` |
| 코멘트 추가 (#22) | 응답이 새 `Comment`. 상세에 덧붙인다. 목록·통계는 그대로 |

**응답을 쓰는 것과 다시 받는 것을 구분한다.** 상태 변경 API는 갱신된 `Complaint`를 돌려주므로
상세는 그것으로 갈아끼우면 되고, **목록과 통계만 따로 받는다.** 전체를 다시 받을 필요가 없다.

**`getStats`는 상태가 바뀔 때만 받는다.** 상태별 집계라 상태 전이가 없으면 변할 일이 없다.

### 다른 사람의 변경

관리자가 상태를 바꿔도 학생 화면은 저절로 바뀌지 않는다. 서버가 밀어주지 않기 때문이다.
**갱신 방식(수동 새로고침 / 주기 폴링)은 아직 정해지지 않았다** — 7장 참조.
정해지기 전까지 프론트는 위 표대로 **자기 행동에 대해서만** 다시 받는다.

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

## 4-0. 화면과 API 대응

| 화면 | 요소 | 무엇을 부르나 |
|---|---|---|
| **로딩** | — | `getMe()` (#5). role을 알기 전에는 아무 화면도 못 그린다 |
| **로그인** | 이메일 · 비밀번호 | `login(email, password)` (#3) |
| | 회원가입 버튼 | 화면 전환만. API 없음 |
| **회원가입** | 학교 드롭다운 (검색·별칭) | `listSchools()` (#1) — 화면 진입 시 한 번 |
| | 이메일 아이디 + 도메인(잠김) | 프론트가 조립해 `signup`에 넘긴다 |
| | 비밀번호 | 〃 |
| | **학교 코드 (선택)** | 비우면 학생, 채우면 검증. 가입 시 함께 보낸다 |
| | 가입 버튼 | `signup(email, pw, adminCode)` (#2) → 성공하면 **바로 로그인 상태** |

**가입 성공 시 다시 로그인하지 않는다.** 서버가 `Set-Cookie`를 함께 내려주므로
`login`을 부를 필요 없이 곧장 `getMe()` 이후 흐름으로 들어간다.

---

## 4-1. 앱이 시작하고 끝나는 흐름

**진입**
```
1. 로딩 화면
2. getMe()
   ├─ 401 → 로그인 화면
   └─ 성공 → role로 갈린다
              student → listComplaints() + 작성 화면 (startDraft는 "새 민원"을 누를 때)
              admin   → getStats() + listComplaints()
3. 첫 화면 데이터가 오면 로딩을 걷는다
```

`getMe()`를 가장 먼저 부른다. **role이 화면 전체를 정하므로 그 전에는 아무것도 그리지 않는다.**
전환 버튼은 만들지 않는다 — 계정이 곧 역할이다.

**로그아웃**
```
logout()  →  서버가 Redis 세션 삭제 + 쿠키 만료
          →  프론트는 메모리에 들고 있던 것을 전부 버린다
             (getMe 결과, 목록, 통계, draft_key, 입력 중이던 텍스트)
          →  로그인 화면
```

**남은 `draft_key`를 다시 쓰지 않는다.** 로그아웃 후 다시 로그인하면 새로 발급받는다.
이전 키는 Redis에 소유자가 남아 있어 다른 계정으로는 403이고, 같은 계정이어도
접수 안 된 초안을 이어쓰는 것은 범위 밖이다(TTL로 사라진다).

**탈퇴**도 같다. 세션이 지워지므로 로그아웃과 같은 정리를 하고 로그인 화면으로 보낸다.

---

## 5. 프론트 모듈 배치

```
src/api/
├─ client.js      fetch 래퍼 — credentials·헤더·오류 정규화. 여기만 fetch를 안다
├─ auth.js        8개
├─ draft.js       4개
├─ board.js       4개
└─ admin.js       8개
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

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    // WRONG_PASSWORD·INVALID_CREDENTIALS는 화면에서 처리한다. 세션 만료만 여기서 가로챈다
    if (data.error?.code === 'UNAUTHENTICATED') { redirectToLogin(); }
    throw new ApiError(401, data.error?.code ?? 'UNAUTHENTICATED', data.error?.message ?? '');
  }
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
| **`UNAUTHENTICATED`면 로그인 화면으로** | 세션 만료는 어느 함수에서든 나므로 한 곳에서 처리한다. 같은 401이라도 `WRONG_PASSWORD`·`INVALID_CREDENTIALS`는 화면이 처리해야 하므로 코드로 가른다 |

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
app/main.py         FastAPI 인스턴스. 정적 파일 서빙도 여기서 mount
app/api/routes/     요청 파싱 → 서비스 호출 → 응답 직렬화. 로직 금지
app/services/       ComplaintService — 상태 전이 판정, 대화 왕복 조율
app/db/             PostgreSQL 커넥션 풀 + 쿼리. school_id 필터를 여기서 강제
app/session/        Redis 세션 · 초안 소유권
app/llm/            BedrockClient — 도구 호출로 분류·정제
```

```python
# app/main.py — 프론트를 같은 서버가 서빙한다
app.include_router(api_router, prefix="/api")
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
```

**API 라우터를 정적 파일보다 먼저 등록한다.** 순서가 바뀌면 `/api/...`가 정적 핸들러에 먹힌다.

**프론트가 자체 라우팅을 쓴다면** `/board/12` 같은 주소에서 새로고침하면 404가 난다.
서버에 그 경로의 파일이 없기 때문이다. `html=True`가 디렉토리마다 `index.html`을 찾아주지만
없는 경로까지 덮지는 않는다. 둘 중 하나를 고른다.

- **해시 라우팅**(`/#/board/12`) — 서버가 볼 일이 없다. 설정이 필요 없어 데모에 맞는다
- **catch-all fallback** — 매칭 안 된 GET을 전부 `index.html`로 보낸다. API 경로는 이미
  위에서 잡혔으므로 안전하다

**커넥션 풀은 워커마다 따로다.** 풀 크기 × 워커 수가 PostgreSQL의 `max_connections`를
넘지 않게 잡는다.

- 라우터는 얇게. 상태 전이 판정을 라우터에 쓰지 않는다
- **`school_id` 필터는 DB 계층에서 강제한다.** 라우터가 빠뜨려도 새지 않도록
- Bedrock 호출은 `app/llm/` 뒤에 가둔다. 모델 교체가 그 안에서 끝나야 한다

---

## 7. 합의가 필요한 것

- **정본 스키마 반영** — `complaint_conversations.refined_json` 컬럼과 `bedrock_logs` 테이블.
  둘 다 없으면 접수와 심사용 로그가 구현되지 않는다. `.kiro`를 고쳐야 한다
- **`GET /api/complaints` 페이지네이션** — 민원이 쌓이면 필요하다. 데모 규모에서 미룰지
- **폴링 주기** — "실시간 반영"을 새로고침으로 할지, 몇 초 간격 폴링으로 할지.
  SSE·WebSocket은 1차 범위 밖으로 본다
- **`is_complete=true` 이후 재대화의 미리보기 교체** — 새 확정안이 이전 것을 덮는 게 맞는지
- **`verifyPassword` 실패 횟수 제한** — 몇 번 틀리면 얼마나 막을지
- **`send_message` 타임아웃** — Bedrock이 느릴 때 프론트가 얼마나 기다릴지
- **워커 수와 커넥션 풀 크기** — LLM 호출이 수 초라 동시 사용자 수에 맞춰 정한다.
  EC2 인스턴스 크기, PostgreSQL `max_connections`와 함께 본다
- **세션·초안 TTL** — 로그인 유지 시간, 미접수 초안 보존 시간
- **`Secure` 쿠키** — HTTPS를 붙일지. 안 붙이면 `SameSite=Lax`만으로 간다

---

## 8. UI 시안과의 차이

시안이 둘 있다. **둘 다 정본보다 앞선 버전이라 상태 모델이 다르다.**

| 파일 | 성격 |
|---|---|
| `anonymous_complain_assistant.html` | 초기 시안. 관리자 표 중심 |
| `anonymous_complain_assistant_full_schools.html` | 최신 시안. 학교 선택·챗 중심·드로어 피드 |

**두 시안 모두 상태가 `접수/수락/보류/거절` 넷뿐이다.** 정본은 일곱이다(8.1 참조).
최신 시안에도 **철회·코멘트·해결완료·처리중·미확인이 없다.** 그대로 옮기면 정본을 못 채운다.

또 최신 시안의 `parseNaturalInput()`·`guessCategory()`는 **브라우저에서 문자열을 뜯어
카테고리를 추측한다.** 실제로는 Bedrock이 도구 호출로 정한다 — 카테고리는 서버가 주는 값이지
프론트가 만드는 값이 아니다.

### 8.0 가입 방식 — 시안을 따른다 (결정됨)

**학교를 먼저 고르고**(검색 + 별칭) 도메인이 자동으로 붙은 뒤 **이메일 아이디만** 입력한다.
초기 정본은 이메일 전체를 입력해 도메인으로 학교를 추론하는 방식이었으나, 시안 쪽으로 정했다.

| | 정본 방식 | 최신 시안 방식 |
|---|---|---|
| 입력 | `student1@chosun.ac.kr` | 학교 고르기 → `student1` + `@chosun.ac.kr`(고정) |
| 칸 수 | 1 | 2 |
| 도메인 오타 | 가능 (미등록이면 막힘) | 불가능 (고를 수만 있다) |
| 지원 학교 확인 | 다 치고 나서 | 처음부터 목록으로 |
| 다른 학교로 잘못 등록 | 불가능 (도메인이 증명) | 불가능 (도메인이 잠긴다) |

**정본이 학교 드롭다운을 배제한 근거**("목록에서 실수로 다른 학교를 고르면 민원이 잘못된
게시판에 올라간다")는 최신 시안에는 해당하지 않는다. 학교를 고르면 **도메인이 잠기므로**
다른 학교 이메일을 넣을 수 없기 때문이다.

**결정 근거**: 도메인이 잠기므로 오타도, 다른 학교로 잘못 등록되는 일도 불가능하다.
지원 학교를 처음부터 볼 수 있어 "다 치고 나서야 막히는" 좌절이 없다.
칸이 하나 늘지만 각 칸이 더 단순해진다.

**서버 쪽은 바뀌지 않는다.** 프론트가 이메일을 조립해 보내고 서버는 도메인으로 학교를 정한다 —
화면이 무엇을 보여줬든 근거는 도메인 하나다. 그래서 `signup` 계약이 그대로다.

`lookupSchool`은 없앴다. 드롭다운이 이미 학교를 알려주므로 이메일에서 역추론할 이유가 없다.



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

---

## 9. 정본 User Story 커버리지

`.kiro/specs/complaint-assistant/requirements.md`의 34개를 전부 대조했다.

| US | 내용 | 어디서 |
|---|---|---|
| 1.1 | 학교 소속 결정 | #1 `listSchools`(드롭다운) · #2 `signup`(도메인으로 서버가 확정) |
| 1.2 | 학교 코드로 역할 결정 | #2 `admin_code` — 비면 학생, 틀리면 400 |
| 1.3 | 미등록 도메인 차단 | 드롭다운에 없는 학교는 고를 수 없다 · #2 `400 UNSUPPORTED_DOMAIN` |
| 1.4 | 내 학교 데이터만 | 0장 학교 격리 — 세션 `school_id`로 전부 필터 |
| 1.5 | 비밀번호 변경 | #6 |
| 1.6 | 탈퇴 시 데이터 정리 | #7 (민원은 익명으로 남고 소유자만 `NULL`) |
| 2.1~2.2 | 자연어 입력 → AI 변환 | #9 `sendMessage` |
| 2.3~2.4 | 되묻기 · 이전 답변 반영 | #9 `is_complete=false` · 대화 전체를 매번 로드 |
| 2.5 | 미리보기 확인 후 결정 | #9 `preview` |
| 2.6 | 대화로 수정 요청 | #9 재호출 (수정 전용 API 없음) |
| 2.7 | 버튼을 눌러야 접수 | #11 `submitDraft` |
| 2.8 | 원문 보기 | #14 `getComplaintConversation` |
| 2.9 | 철회 + 비밀번호 확인 | #15 `withdrawComplaint` |
| 2.10 | 본인 것만 철회 | `is_mine` + 서버 `submitted_by_user_id` 대조 |
| 3.1~3.2 | 목록과 표시 필드 | #12 · `Complaint` 타입 |
| 3.3 | 익명 | 응답에서 작성자 id 제거, `is_mine`만 |
| 3.4 | 원문 토글 | #14 |
| 3.5 | 상태 배지 | `status` |
| 3.6 | **게시판에서 코멘트(보류 사유) 확인** | #12 목록 응답에 `is_hold_reason` 코멘트 포함 |
| 3.7 | 철회된 것은 안 보임 | #12 (철회 항상 제외) |
| 4.1 | 통계 | #16 `getStats` |
| 4.2 | 상태별 필터 | #12 `?status=` |
| 4.3 | 표 컬럼 | `Complaint` 타입 |
| 4.4 | 미확인 구분 | `status` |
| 4.5 | **클릭 시 자동 확인 전환** | #17 `openComplaint` (POST인 이유 포함) |
| 4.6 | 확인 상태에서만 결정 버튼 | 3장 전이 규칙 · #18~21 |
| 4.7 | 언제든 코멘트 추가 | #22 |
| 4.8 | 학생 게시판에 즉시 반영 | ⚠ **7장 미결** — 새로고침 vs 폴링 |
| 4.9 | 철회된 것 목록에서 사라짐 | #12 |
| 5.1 | **Bedrock 호출 로그** | #23 `getBedrockLogs` |
| 5.2 | EC2 배포 | 인프라. API 아님 |

**API로 덮이지 않은 것은 US-4.8 하나**이고, 그건 갱신 방식을 정하지 않아서다(7장).
