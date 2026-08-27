# UniVoice — 백엔드 설계

_2026-08-27 · 상태: 검토 중_

**서버 안쪽이 어떻게 나뉘고 무엇이 무엇을 부르는지**를 정하는 문서다.

- **밖에서 보이는 것**(엔드포인트·요청/응답·오류 코드)은 `api-contract.md`에 있다. 프론트가 볼 문서다.
- **무엇을 왜 만드는지**는 `.kiro/specs/complaint-assistant/`에 있다.
- 이 문서는 **백엔드 안에서만** 통한다. 여기 적힌 함수 이름이 바뀌어도 계약은 그대로다.

---

## 1. 라우터는 파사드다

`app/api/routes/*.py`에는 **로직이 없다.**

```python
@router.post("/complaints/{cid}/withdraw", status_code=204)
def withdraw(cid: int, body: WithdrawIn, user = Depends(current_user)):
    complaint_service.withdraw(cid, user.id, body.password)
```

라우터가 하는 일은 셋뿐이다.

1. 요청을 파싱하고 (Pydantic이 한다)
2. 세션에서 사용자를 꺼내 (`Depends`가 한다)
3. 서비스를 부르고 결과를 직렬화한다

**판단하지 않는다.** 상태 전이가 가능한지, 소유자가 맞는지, 코드가 유효한지 —
전부 아래 계층이 정한다. 라우터에 `if`가 늘어나면 그건 서비스로 내려가야 할 로직이다.

**예외를 HTTP로 바꾸는 것도 라우터가 아니다.** 서비스가 도메인 예외를 던지고
`app/core/errors.py`의 핸들러가 한 곳에서 `{error: {code, message}}`로 변환한다.
그래야 같은 오류가 어디서 나든 같은 모양으로 나간다.

---

## 2. 모듈 구성

```
app/
├─ main.py                 FastAPI 인스턴스. 라우터 등록 → 정적 파일 mount (순서 중요)
│
├─ api/
│  ├─ deps.py              Depends 제공자 — current_user, require_admin, require_session_owner
│  └─ routes/
│     ├─ health.py         GET /health
│     ├─ schools.py        GET /schools
│     ├─ auth.py           가입·로그인·로그아웃·비밀번호·탈퇴·검증
│     ├─ session.py        대화 세션 4개
│     ├─ board.py          게시판 4개
│     └─ admin.py          관리자 8개
│
├─ schemas/                Pydantic 요청·응답 모델. 계약의 타입이 여기 산다
│  ├─ auth.py  ├─ complaint.py  ├─ session.py  └─ common.py
│
├─ services/               ★ 판단이 사는 곳
│  ├─ auth_service.py      가입 규칙, 역할 결정, 비밀번호
│  ├─ session_service.py   대화 왕복, 확정안 보관, 압축, 접수
│  ├─ complaint_service.py 조회, 상태 전이, 철회, 코멘트
│  └─ errors.py            도메인 예외 (ConflictError, NotOwnerError …)
│
├─ repo/                   ★ SQL이 사는 곳. 여기 밖에는 SQL이 없다
│  ├─ pool.py              커넥션 풀
│  ├─ school_repo.py  ├─ user_repo.py  ├─ complaint_repo.py
│  ├─ chat_session_repo.py
│  ├─ conversation_repo.py ├─ comment_repo.py  └─ bedrock_log_repo.py
│
├─ session/                ★ Redis가 사는 곳
│  ├─ client.py            연결
│  ├─ login_session.py     sess:{id}
│  └─ session_state.py     turn:{sid}:running · compact:{sid} · step
│
├─ llm/                    ★ Bedrock이 사는 곳
│  ├─ client.py            invoke_model 호출
│  ├─ tools.py             classify_and_refine_complaint 스키마
│  └─ prompts.py           시스템 프롬프트
│
└─ core/
   ├─ config.py            환경변수. 여기 한 곳에서만 읽는다
   ├─ errors.py            도메인 예외 → HTTP 변환 핸들러
   └─ logging.py
```

### 계층 규칙 — 위에서 아래로만 부른다

```
routes  →  services  →  repo / session / llm
              ↑
           schemas (계약 타입)   core (설정·예외)
```

| 규칙 | 왜 |
|---|---|
| **라우터가 `repo`·`session`·`llm`을 직접 부르지 않는다** | 그러면 판단이 라우터로 샌다 |
| **`repo`가 `services`를 부르지 않는다** | 순환이 생기고 트랜잭션 경계가 흐려진다 |
| **SQL은 `repo/`에만 있다** | `school_id` 필터를 강제할 곳이 한 군데여야 한다 |
| **Redis 키 문자열은 `session/`에만 있다** | 키 이름이 흩어지면 지울 때 빠뜨린다 |
| **Bedrock 호출은 `llm/`에만 있다** | 모델 교체가 이 폴더 안에서 끝나야 한다 |
| **환경변수는 `core/config.py`에서만 읽는다** | `os.environ`이 흩어지면 무엇이 필요한지 알 수 없다 |

테스트로 강제한다 — import 그래프를 훑어 역방향 참조가 있으면 실패시킨다.

---

## 3. `school_id` 격리를 어디서 강제하나

**`repo/` 계층이다.** 학교 격리는 이 서비스의 가장 중요한 보안 경계인데,
서비스마다 `WHERE school_id`를 손으로 붙이면 언젠가 하나를 빠뜨린다.

```python
# repo/complaint_repo.py — school_id 없이 부를 수 있는 함수를 만들지 않는다
def get(conn, complaint_id: int, school_id: int) -> dict | None: ...
def list(conn, school_id: int, status: str | None) -> list[dict]: ...
def update_status(conn, complaint_id: int, school_id: int, frm: str, to: str) -> int: ...
```

**모든 함수가 `school_id`를 필수 인자로 받는다.** 넘기지 않으면 호출 자체가 안 된다.
서비스는 세션에서 꺼낸 값을 그대로 넘기고, 그 값은 로그인할 때 서버가 정한 것이다.

같은 이유로 **철회 제외도 `repo`가 한다.** `status <> '철회'`를 조회 함수 안에 넣어두면
서비스가 잊어도 새지 않는다.

---

## 4. 상태 전이 — 조회하고 판단하지 않는다

워커가 여럿이므로 "읽어서 보고 정하기"는 동시에 두 관리자가 누르면 **둘 다 통과한다.**

```python
# repo/complaint_repo.py
def update_status(conn, complaint_id, school_id, frm, to) -> int:
    """전제 상태에서만 바꾼다. 바뀐 행 수를 돌려준다."""
    return conn.execute(
        "UPDATE complaints SET status = %s "
        "WHERE id = %s AND school_id = %s AND status = %s",
        (to, complaint_id, school_id, frm)
    ).rowcount
```

```python
# services/complaint_service.py
def accept(complaint_id, school_id):
    if complaint_repo.update_status(conn, complaint_id, school_id, '확인', '처리중') == 0:
        raise InvalidTransition()        # → 409
```

**`WHERE`가 곧 검증이다.** DB가 직렬화하므로 하나만 1행을 바꾸고 나머지는 0행이다.

전이표는 서비스가 갖는다.

| 함수 | 전제 | 결과 |
|---|---|---|
| `open_detail` | `미확인` | `확인` (아니면 아무 일 없음 — 멱등) |
| `accept` | `확인` | `처리중` |
| `resolve` | `처리중` | `해결완료` |
| `hold` | `확인` | `보류` + 코멘트 (한 트랜잭션) |
| `reject` | `확인` | `거절` |
| `withdraw` | 무관 | `철회` (소유자만) |

`open_detail`만 0행이어도 오류가 아니다. 이미 확인 이후라는 뜻이고,
여러 번 열어도 안전해야 하기 때문이다.

---

## 5. 트랜잭션 경계는 서비스가 잡는다

`repo` 함수는 커넥션을 받기만 하고 커밋하지 않는다. 그래야 여러 개를 묶을 수 있다.

```python
# services/complaint_service.py — 보류는 상태와 코멘트가 함께 성립한다
def hold(complaint_id, school_id, admin_id, reason):
    if not reason.strip():
        raise HoldReasonRequired()                    # → 422
    with pool.transaction() as conn:
        if complaint_repo.update_status(conn, complaint_id, school_id, '확인', '보류') == 0:
            raise InvalidTransition()                 # → 409, 롤백
        comment_repo.add(conn, complaint_id, admin_id, reason, is_hold_reason=True)
```

**사유 없는 보류가 남지 않는다.** 둘 중 하나라도 실패하면 둘 다 없던 일이 된다.

접수도 같다 — `complaints` 삽입과 `complaint_conversations`의 `complaint_id` 채우기가
한 트랜잭션이다. 중간에 끊기면 주인 없는 대화가 남는다.

---

## 6. 계정 — 저장부터 요청 처리까지

### 6.1 가입 시 무엇이 어디에 저장되나

```
POST /auth/signup  { email, password, admin_code? }
  │
  ├ 도메인 추출          email.split('@')[-1] → 'chosun.ac.kr'
  ├ school_repo.find_by_domain()      없으면 400 UNSUPPORTED_DOMAIN
  ├ user_repo.exists(email)           있으면 409 EMAIL_TAKEN
  ├ 역할 결정 (§9.2)                  코드 하나로 판정
  ├ 비밀번호 해시                     bcrypt(password) — 평문은 어디에도 남기지 않는다
  ├ user_repo.create(school_id, email, hash, role)   → PostgreSQL
  └ login_session.create(...)         → Redis, Set-Cookie
```

`users` 행에 남는 것은 `password_hash`뿐이다. **평문은 메모리에서만 잠깐 존재하고
로그에도 남기지 않는다** — 요청 본문을 통째로 로깅하는 미들웨어를 두지 않는다.

### 6.2 로그인 검증

```
POST /auth/login  { email, password }
  │
  ├ user_repo.find_by_email(email)        소문자로 정규화해 조회
  │    └ 없으면 → bcrypt 더미 해시를 한 번 대조하고 401
  │              (계정이 없을 때 응답이 빨라지면 이메일 존재 여부가 새어나간다)
  ├ bcrypt.checkpw(password, row.password_hash)
  │    └ 불일치 → 401 INVALID_CREDENTIALS
  └ login_session.create(user_id, school_id, role) → Redis
       Set-Cookie: sid=<랜덤 32바이트>; HttpOnly; SameSite=Lax
```

**"이메일이 없음"과 "비밀번호가 틀림"을 구분하지 않는다.** 둘 다 `INVALID_CREDENTIALS`다.
구분하면 가입 여부를 확인하는 수단이 된다.

### 6.3 요청마다 세션이 복원되는 경로

```
아무 API 요청
  │  Cookie: sid=abc123...
  ├ deps.current_user
  │    ├ login_session.get('abc123')      Redis GET sess:abc123
  │    │    ├ 없음 → 401 UNAUTHENTICATED
  │    │    └ 있음 → { user_id, school_id, role }  + TTL 연장 (sliding)
  │    └ 이 셋이 이후 모든 판단의 근거다
  └ 라우터 → 서비스
```

**PostgreSQL을 건드리지 않는다.** `school_id`·`role`을 세션에 함께 넣어두기 때문에
매 요청 `users`를 조회할 필요가 없다.

**대가**: 권한이나 소속이 바뀌어도 기존 세션에는 옛 값이 남는다.
역할 변경 기능이 없으므로 지금은 문제되지 않지만, 생기면 그때 해당 사용자 세션을 지워야 한다.

### 6.4 이메일이 진짜 그 사람 것인지는 확인하지 않는다

**지금 설계로는 `student1@chosun.ac.kr`을 아무나 칠 수 있다.**
도메인이 등록된 학교인지만 보고, 그 주소의 주인인지는 묻지 않는다.

| 무엇을 보장하나 | 보장 |
|---|---|
| 소속 학교가 등록된 곳인가 | ○ 도메인으로 확인 |
| 교직원인가 | ○ 학교 코드로 확인 |
| **그 이메일의 주인인가** | **✗ 확인하지 않는다** |

**대회 데모 범위에서는 이대로 간다.** 심사위원이 계정을 만들어 바로 써야 하는데
메일 왕복을 넣으면 시연이 끊긴다.

**실서비스로 가려면 이메일 인증이 필요하다.** 가입 시 `users.email_verified`를 `false`로 두고,
6자리 코드를 메일로 보내 확인될 때까지 민원 접수를 막는 형태다.
읽기는 허용해도 되지만 **쓰기는 막아야** 익명 게시판이 남의 이름으로 오염되지 않는다.
메일 발송 의존(SES 등)이 붙으므로 범위를 늘리는 결정이다.

**교직원 코드는 이 문제를 부분적으로만 덮는다.** 코드를 모르면 관리자가 될 수 없으므로
상태 변경 권한은 안전하다. 학생 계정은 도메인만 알면 만들 수 있다.

### 6.5 비밀번호 재확인 (`verifyPassword`)

철회·탈퇴 앞에 붙는다. **아무것도 바꾸지 않고** 해시만 대조한다.

```python
def verify_password(user_id, password) -> None:
    if not bcrypt.checkpw(password, user_repo.get_hash(conn, user_id)):
        rate_limit.hit(f"verify:{user_id}")     # 실패 횟수 누적
        raise WrongPassword()                    # → 401
```

**실행 API가 비밀번호를 다시 받아 또 검증한다.** 이 호출은 화면 순서를 위한 것이지
실행 권한을 주는 티켓이 아니다. 건너뛰고 철회를 직접 불러도 막힌다.

---

## 7. 대화 세션 컨테이너

> `requirements_v1.md` §7.5에 정의된 로직이다. UniVoice에 그대로 옮긴다.
> **`.kiro` 정본에는 아직 없다** — 반영이 필요하다.

### 7.1 세 겹으로 흐른다

```
        새 발화
           │
           ▼
   ┌───────────────┐
   │  현재 대화     │  최근 N턴. LLM에 원문 그대로 들어간다
   │  (버퍼)        │
   └───────┬───────┘
           │  버퍼가 차면 밀려난다
           ▼
   ┌───────────────┐
   │  과거 대화     │  버퍼에서 밀려난 것들. 아직 원문
   └───────┬───────┘
           │  일정량 쌓이면 — 이전 세션주제와 함께 압축
           ▼
   ┌───────────────┐
   │  세션 주제     │  요약 문자열 하나 + 제목
   │  (압축)        │  LLM에는 이것만 들어간다
   └───────────────┘
```

**압축이 누적된다는 것이 요점이다.** 과거 대화를 요약할 때 **이전 세션주제를 함께 넣어**
새 세션주제를 만든다. 그래야 세션이 길어져도 맨 처음 맥락이 사라지지 않는다.

```
새 세션주제 = 압축( 이전 세션주제 + 밀려난 과거 대화 )
```

이전 요약을 버리고 최근 것만 요약하면 세 번째 압축쯤에서 초반 내용이 증발한다.

### 7.2 LLM에 실제로 들어가는 것

```
system    : 시스템 프롬프트
            + 세션주제(있으면)      ← 압축된 맥락
messages  : 과거 대화(원문, 아직 압축 안 된 것)
            + 현재 대화(버퍼)
            + 이번 발화
```

**길이가 일정하게 유지된다.** 대화가 길어져도 세션주제는 문자열 하나이고,
버퍼와 과거 대화에는 상한이 있다.

> **화면에 보이는 대화와 LLM이 읽는 맥락은 다르다.**
> 화면에는 PostgreSQL의 **전체 메시지**를 처음부터 보여준다.
> LLM에는 **세션주제 + 과거 대화 + 버퍼**만 넣는다.
> **이 둘을 같은 것으로 만들면 안 된다.**

### 7.3 어디에 저장되나

| 층 | 어디 | 왜 |
|---|---|---|
| 전체 메시지 (화면용) | PostgreSQL `complaint_conversations` | 잃으면 학생이 다시 설명해야 한다 |
| 세션 주제 · 제목 | PostgreSQL `chat_sessions.context` · `.title` | 목록에 제목이 필요하고, 잃으면 맥락이 통째로 날아간다 |
| 버퍼 경계 · 압축 지점 | PostgreSQL `chat_sessions.compacted_upto` | 어디까지 압축했는지. 잃으면 중복 압축된다 |
| 압축 진행 표시 | Redis `compact:{sid}` | 잃어도 다음 턴에 다시 시도한다 |

**세션주제를 Redis에 두지 않는다.** 압축은 LLM을 태워 만든 값이라
잃으면 그 비용을 다시 치러야 하고, 그 사이 맥락이 없는 채로 대화가 진행된다.

```sql
CREATE TABLE chat_sessions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL,
    school_id      INTEGER NOT NULL,  -- users에서 유도 가능하지만, 접수 시 조인을 없애려 복제
    title          VARCHAR(255),      -- 압축이 갱신한다. NULL이면 "새 대화"
    is_manual_title BOOLEAN NOT NULL DEFAULT FALSE,
    context        TEXT,              -- ★ 세션 주제 (압축된 맥락)
    compacted_upto INTEGER,           -- ★ 메시지 id. 이 id 이하는 context에 녹아 있다
    category       VARCHAR(32),
    complaint_id   INTEGER,           -- 접수되면 연결. NULL이면 초안
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id)      REFERENCES users(id)       ON DELETE CASCADE,
    FOREIGN KEY (school_id)    REFERENCES schools(id)     ON DELETE CASCADE,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)  ON DELETE SET NULL
);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id, updated_at DESC);
```

`compacted_upto`가 **버퍼의 시작점**이다. 그 이후 메시지만 원문으로 싣는다.
별도 버퍼 저장소가 필요 없다 — 대화는 어차피 전부 DB에 있으므로 **경계만 기억하면 된다.**

**개수가 아니라 메시지 id다.** 개수로 두면 중간 삭제가 생기는 순간 경계가 어긋난다.
id는 단조 증가하므로 `WHERE id > compacted_upto ORDER BY id`로 버퍼가 정확히 나온다.

### 7.4 압축은 언제 도나

```
턴 종료 (응답을 이미 보낸 뒤)
  │
  ├ 미압축 메시지 수 = 전체 − compacted_upto
  │
  └ 임계치를 넘었나?
       ├ 아니오 → 아무것도 하지 않는다
       └ 예 → 백그라운드로 압축
                ├ ★ 대상 구간을 이 시점에 고정한다
                │     from = compacted_upto,  to = (최근 N턴 직전 메시지의 id)
                │     압축이 도는 동안 새 턴이 들어와도 to는 움직이지 않는다
                ├ 입력: 이전 context + (from, to] 구간
                ├ LLM 호출 (요약 전용, 도구 없음) — 이것도 bedrock_logs에 남긴다
                ├ 결과: 새 context · 새 title
                └ 트랜잭션으로 갱신
                      SET context=?, title=?, compacted_upto=?
                      WHERE id=? AND compacted_upto=?      ← from과 같을 때만
```

**`WHERE compacted_upto = from`이 안전장치다.** 압축이 도는 사이 다른 압축이 먼저 끝났다면
0행이 되어 이번 결과를 버린다. 두 번 압축해 구간이 겹치는 일이 없다.

**압축 중에도 새 턴은 정상 진행된다.** 그 턴은 옛 `context`와 조금 긴 버퍼를 읽는데,
맥락이 빠지는 게 아니라 원문이 더 실릴 뿐이라 품질 문제가 없다.
**턴 락과 압축 락을 따로 두는 이유가 이것이다** — 압축이 대화를 막지 않는다.

**뒤에서 돈다.** 턴 응답을 먼저 끝내고 실행하므로 사용자를 기다리게 하지 않는다.

**최근 N턴은 압축하지 않는다.** 방금 오간 말이 요약으로 뭉개지면 되묻기가 이상해진다.
버퍼는 항상 원문으로 남는다.

**확정안이 압축 구간에 들어가면 요약이 그것을 반드시 담아야 한다.** 학생이 확정안을 받고도
더 고치다가 그 턴이 밀려나면, 요약이 "카테고리·위치·제목이 이렇게 확정됐다"를 빠뜨릴 경우
모델이 처음부터 다시 묻는다. 압축 프롬프트에 **"확정된 항목이 있으면 그대로 옮겨 적어라"**를 넣는다.

접수 자체는 영향을 받지 않는다 — `refined_json`은 DB에서 직접 읽으므로 요약과 무관하다.

**실패해도 대화는 멀쩡해야 한다.** 기존 `context`·`title`·`compacted_upto`를 그대로 두고
다음 턴에 다시 시도한다. **압축은 부가 작업이지 필수 경로가 아니다.**

**세션 단위로 직렬화한다.** 압축이 도는 중에 다음 턴이 시작될 수 있는데,
둘이 동시에 `compacted_upto`를 옮기면 구간이 겹치거나 빈다.

```python
# session/session_state.py
def acquire_compact(sid) -> bool:
    return redis.set(f"compact:{sid}", "1", nx=True, ex=COMPACT_TTL)
```

`SET NX`인 이유는 턴 락과 같다 — 워커가 여럿이라 "보고 세우기"는 둘 다 통과한다.

### 7.5 제목

**압축이 제목도 함께 만든다.** 제목만 뽑으려고 모델을 따로 부르지 않는다.

| 시점 | title |
|---|---|
| 세션 생성 | `NULL` → 화면에는 "새 대화" |
| 첫 확정안(`classify_and_refine`) | 도구가 준 `session_title` |
| 압축이 돌 때마다 | 새로 뽑은 제목으로 갱신 |
| 사용자가 직접 바꾸면 | `is_manual_title = TRUE` → **이후 자동 갱신이 덮어쓰지 않는다** |

사람이 정한 이름을 기계가 뒤엎으면 안 된다.

### 7.6 세션 하나 열기

```
GET /chat-sessions/{sid}                 메타 (제목·카테고리·접수 여부)
GET /chat-sessions/{sid}/conversation    대화 전체 (화면용 — 압축 전 원문 그대로)
```

**화면에는 전체를 보여준다.** `context`·`compacted_upto`는 LLM 맥락을 줄이는 장치이지
사용자에게 보일 것을 줄이는 장치가 아니다.

### 7.7 세션 목록 — "과거 대화"

```
GET /chat-sessions
  → id · title · category · complaint_id · updated_at   (최신순)
```

**`user_id`로 거른다.** 게시판은 익명 공개지만 **초안 대화는 개인 것이다.**

**접수는 `POST /chat-sessions/{sid}/submit`이다.** 그 세션의 마지막 `refined_json`을 꺼내
`complaints`를 만들고, `chat_sessions.complaint_id`를 채우고, 새 세션을 하나 열어 함께 돌려준다.
셋이 한 트랜잭션이다.

**접수된 세션은 이어서 대화할 수 없다.** `complaint_id`가 차면 읽기 전용이 되고,
새로 쓰려면 새 세션을 연다. 이미 게시판에 올라간 민원의 근거 대화를 뒤에서
바꿀 수 있으면 안 되기 때문이다.

## 7-1. 챗봇이 도는 단계

### 7-1.1 '부족하다'를 어떻게 판정하나

**모델이 어느 도구를 불렀는지로 읽는다.** 서버가 문장을 뜯거나 길이를 재지 않는다.

도구를 **둘** 준다. 모델은 매 턴 반드시 하나를 부른다.

```python
# llm/tools.py
ASK_FOLLOWUP = {
  "name": "ask_followup",
  "description": "카테고리·위치·상황 중 하나라도 확정할 수 없으면 이 도구를 부른다.",
  "input_schema": {
    "type": "object",
    "properties": {
      "missing":  {"type": "string", "enum": ["category", "location", "detail"]},
      "question": {"type": "string", "description": "학생에게 물을 한 문장"},
      "choices":  {"type": "array", "items": {"type": "string"},
                   "description": "고르기 쉽게 제시할 선택지 3~5개. 마지막은 직접 입력"}
    },
    "required": ["missing", "question", "choices"]
  }
}

CLASSIFY_AND_REFINE = {
  "name": "classify_and_refine_complaint",
  "description": "셋이 모두 확정될 때만 부른다.",
  "input_schema": { ... category(enum) · location · refined_title · refined_body · session_title ... }
}
```

| 모델이 부른 것 | 뜻 | 서버가 하는 일 |
|---|---|---|
| `ask_followup` | **부족하다** | 질문과 선택지를 프론트에 그대로 내려보낸다 |
| `classify_and_refine_complaint` | 충분하다 | 확정안을 `refined_json`에 저장하고 미리보기로 |
| 아무것도 안 부름 (텍스트만) | 규격 위반 | 한 번 재시도, 또 실패하면 `ask_followup` 기본값으로 대체 |

**이 구조가 이전 설계보다 나은 점**: 예전에는 "도구를 안 불렀다"는 **부재**로 부족을 읽었다.
그러면 되묻는 문장만 얻고 **선택지를 만들 수 없다.** 이제 부족도 구조화된 신호다.

`missing` 필드는 서버가 **지금 어느 단계인지 아는 근거**가 된다.

### 7-1.2 카테고리 선택지는 어디서 오나

두 곳이 합쳐진다.

| 출처 | 무엇 | 왜 |
|---|---|---|
| **고정 목록** (`llm/choices.py`) | 카테고리 7종, 카테고리별 흔한 증상 | 모델이 매번 다른 문구를 내면 화면이 흔들린다 |
| **모델** (`ask_followup.choices`) | 맥락에 맞춘 선택지 | 고정 목록에 없는 상황을 덮는다 |

```python
# services/session_service.py
def _merge_choices(missing: str, model_choices: list[str], category: str | None):
    if missing == "category":
        return CATEGORIES                      # 7종 고정. 모델 것을 쓰지 않는다
    fixed = DETAIL_CHIPS.get(category, [])
    merged = fixed + [c for c in model_choices if c not in fixed]
    return merged[:5] + ["직접 입력"]
```

**`missing='detail'`인데 카테고리가 아직 없으면** 고정 칩을 붙일 근거가 없다.
그때는 모델이 준 선택지만 쓴다. 순서를 서버가 강제하지 않기 때문에 생길 수 있는 상황이다.

**카테고리만은 모델 선택지를 무시하고 고정 7종을 쓴다.** `complaints.category`가
그 7개 중 하나여야 하는데, 모델이 "냉난방 문제"처럼 살짝 다른 문구를 주면 매칭이 깨진다.

**나머지 단계는 고정 칩을 앞에 두고 모델 것을 뒤에 붙인다.** 자주 쓰는 것이 먼저 보이고,
드문 상황은 모델이 채운다. 마지막은 항상 "직접 입력"이다 — 선택지가 다 안 맞을 수 있다.

### 7-1.3 한 턴의 전체 경로

```
POST /chat-sessions/{sid}/messages   { message | choice }
  │
  ├ deps.current_user
  ├ 소유 확인            chat_session_repo.get(sid, user_id)  아니면 404
  ├ 접수 여부 확인       complaint_id가 있으면 409 SESSION_CLOSED
  ├ session.acquire_turn(sid)                       이미 돌면 409
  │
  ├ [커넥션 획득]
  │    conversation_repo.add(conn, sid, 'student', text)
  │    context, buffer = chat_session_repo.load_context(conn, sid)
  │       context = 세션주제(압축된 맥락) · buffer = compacted_upto 이후 원문
  ├ [커넥션 반납] ★ LLM을 부르는 동안 붙들지 않는다
  │
  ├ llm.refine(context, buffer)                     ← 세션주제 + 버퍼만. 도구 둘을 붙여 호출
  │    └ bedrock_log_repo.add(...)
  │
  ├─ ask_followup 인 경우
  │    ├ choices = _merge_choices(missing, model_choices, 지금까지의 category)
  │    ├ [커넥션 재획득]
  │    ├ conversation_repo.add(conn, sid, 'assistant', question, choices=choices)
  │    ├ state.set(sid, step=missing)                → Redis (빠른 조회용)
  │    └ return { is_complete:false, question, choices, step }
  │
  └─ classify_and_refine 인 경우
       ├ conversation_repo.add(conn, sid, 'assistant', "[정리 완료] …", refined_json=결과)
       ├ chat_session_repo.update_meta(conn, sid, title=…, category=…)
       ├ state.set(sid, step='confirm')
       └ return { is_complete:true, preview }
  │
  ├ session.release_turn(sid)      finally — 실패로 끝나도 반드시
  │
  └ (백그라운드) 미압축 분량이 임계치를 넘었으면 압축 (§7.4)
       실패해도 응답에는 영향이 없다
```

### 7-1.4 "다음"으로 넘어간다는 것

화면은 단계별로 보이지만 **서버에 "다음 단계로" 같은 엔드포인트는 없다.**
선택지를 누르는 것도 **메시지를 보내는 것**이다.

```
[냉난방 / 공조] 칩 클릭
  → POST .../messages { "message": "냉난방 / 공조" }
```

**단계를 서버가 고정된 순서로 몰지 않는다.** 학생이 첫 문장에 위치와 증상을 한꺼번에 쓰면
되묻기 없이 바로 확정안이 나온다. 시안이 `idle → location → detail → confirm`을
브라우저에서 강제하는 것과 다른 점이다 — **몇 단계가 될지는 모델이 정한다.**

`state.set(sid, step=…)`은 빠른 조회용이고 **진행을 통제하는 값이 아니다.**

**칩은 대화 기록에도 함께 저장한다.** `complaint_conversations`에 `choices JSONB` 컬럼을 두고
assistant 발화와 같은 행에 넣는다. Redis만 믿으면 **TTL이 만료된 뒤 새로고침했을 때
칩이 사라진다** — 대화는 멀쩡한데 선택지만 없는 상태가 되어 사용자가 무엇을 골라야 할지 모른다.

Redis는 없으면 DB에서 읽는 캐시일 뿐이다.

### 7-1.5 답변이 질문에 맞지 않을 때

"직접 입력"에 `asdf`를 치면 어떻게 되나. **그냥 통과시키면 안 된다.**

**판정은 모델이 한다.** 서버가 문자열을 검사해 "위치인지 아닌지"를 알 방법이 없다.
모델은 자기가 무엇을 물었는지 알고 있으므로, 답이 그 질문을 채우지 못하면
**같은 `missing`으로 `ask_followup`을 다시 부른다.**

그래서 서버는 **같은 단계가 반복되는지**만 세면 된다.

```python
# services/session_service.py
same = state.bump_if_same(sid, result.missing)     # Redis에서 연속 횟수 누적

if same >= 2:
    # 두 번째부터는 안내를 바꾼다 — 같은 질문을 그대로 반복하면 사람이 지친다
    result.question = f"{result.question}\n(예: {', '.join(EXAMPLES[result.missing])})"

if same >= 4:
    # 네 번 같은 자리를 맴돌면 대화가 진행되지 않는 것이다
    raise StuckError(step=result.missing)          # → 409 CONVERSATION_STUCK
```

`409 CONVERSATION_STUCK`을 받으면 프론트는 **"처음부터 다시 쓰기"와 "그대로 두고
직접 채우기"를 제시한다.** 모델에게 계속 맡기지 않는다.

**서버가 먼저 걸러내는 것도 있다.** 모델을 부르기 전에 명백한 것만 막는다.

| 조건 | 처리 |
|---|---|
| 공백만 / 빈 문자열 | 400 `VALIDATION_FAILED` — 모델을 부르지 않는다 |
| 2000자 초과 | 400 `VALIDATION_FAILED` |
| 직전 발화와 완전히 동일 | 모델을 부르지 않고 이전 질문을 그대로 다시 내려보낸다 |

**그 이상은 서버가 판단하지 않는다.** "3층"이 위치로 충분한지, "고장남"이 상황 설명으로
충분한지는 맥락에 달렸고 그건 모델의 일이다. 서버가 규칙을 만들면 반드시 정상 입력을 막는다.

**루프에는 상한이 있다.** 위의 `same >= 4`와 별개로, **한 세션의 총 턴 수**에도 상한을 둔다.
넘으면 더 받지 않는다 — LLM 호출은 비용이고, 끝나지 않는 대화는 버그다.

### 7-1.6 되돌아가기

시안의 `goBackStep`·`rechoseCategory`에 해당한다.

```
POST /chat-sessions/{sid}/messages { "message": "카테고리를 다시 고를게요" }
```

**별도 API를 만들지 않는다.** 대화로 표현되고, 모델이 그것을 읽어 다시 `ask_followup`을 낸다.
"수정 전용 경로"를 두면 대화 기록과 실제 상태가 갈라진다.

---

## 7-2. Redis와 PostgreSQL — 무엇을 언제 읽고 쓰나

### 7-2.1 나누는 기준 하나

> **잃으면 사용자가 다시 만들어야 하는 것은 PostgreSQL.
> 잃어도 다시 계산되거나 없어도 되는 것은 Redis.**

| 데이터 | 어디 | 잃으면 |
|---|---|---|
| 계정·학교·코드 | PostgreSQL | 서비스가 죽는다 |
| 접수된 민원·상태·코멘트 | PostgreSQL | 학교의 기록이 사라진다 |
| **대화 기록** | PostgreSQL | 학생이 처음부터 다시 설명해야 한다 |
| **확정안** (`refined_json`) | PostgreSQL | 접수를 못 한다 |
| 세션 목록·제목 | PostgreSQL | 과거 대화를 못 찾는다 |
| **세션주제**(압축된 맥락) | PostgreSQL | LLM 비용을 다시 치러야 하고, 그 사이 맥락 없이 대화가 돈다 |
| 압축 경계 (`compacted_upto`) | PostgreSQL | 어디까지 압축했는지 몰라 중복 압축된다 |
| 로그인 세션 | Redis | 다시 로그인하면 된다 |
| 초안 소유권 | Redis | 초안을 못 이어 쓴다 (새로 시작) |
| 턴 진행 표시 | Redis | 중복 호출이 한 번 날 수 있다 |
| 단계·반복 횟수 | Redis | 칩이 안 보인다. 대화는 멀쩡하다 |
| 압축 진행 표시 | Redis | 압축이 두 번 돌 수 있다. 다음 턴에 정리된다 |

**작업본(working copy) 방식을 쓰지 않는다.** 문서를 편집하는 서비스라면 Redis에 사본을 두고
나중에 내려쓰는 게 맞지만, 여기서 쌓이는 것은 **append-only 대화**다.
한 턴이 곧 확정이라 미룰 이유가 없고, 미루면 새로고침에 사라진다.

### 7-2.2 언제 쓰나 — 매 턴 즉시

```
학생 발화 도착
  └ conversation_repo.add(...)          ← 즉시 PostgreSQL. 여기서 미루지 않는다
       (LLM 호출이 실패해도 학생이 쓴 것은 남는다)

LLM 응답 도착
  └ conversation_repo.add(...)          ← 즉시
       확정안이면 refined_json도 같은 행에
  └ chat_session_repo.update_meta(...)  ← 제목·카테고리
```

**LLM 호출 전에 커넥션을 반납한다.** Bedrock이 수 초 걸리는데 그동안 커넥션을 붙들면
풀이 금방 마른다. `저장 → 반납 → LLM → 다시 얻어 저장` 순서다.

### 7-2.3 언제 읽나

| 시점 | PostgreSQL | Redis |
|---|---|---|
| **접속 (앱 진입)** | — | `sess:{id}` 조회 → 로그인 여부 |
| **세션 목록 열기** | `chat_sessions` 조회 | — |
| **세션 하나 열기** | 대화 기록 전체 조회 | `sess_state:{sid}` → 현재 단계·칩 |
| **새로고침** | 위와 동일 (전부 다시 읽는다) | 동일 |
| **메시지 전송** | 대화 삽입·조회 | 턴 락 획득·해제 |
| **나가기 / 탭 닫기** | **아무것도 하지 않는다** | 아무것도 하지 않는다 |

**나갈 때 저장하는 동작이 없다.** 이미 매 턴 저장돼 있기 때문이다.
`beforeunload`로 뭔가 보내려 하지 않는다 — 그 요청은 도착이 보장되지 않는다.

**새로고침은 전부 다시 읽는다.** 캐시하지 않으므로 특별한 복원 절차가 없다.
`sess_state`가 만료됐으면 단계 정보만 없는 것이고, 대화는 DB에서 그대로 온다.
그때는 마지막 assistant 발화를 다시 보여주고 칩 없이 자유 입력을 받는다.

### 7-2.4 Redis가 통째로 죽으면

| 잃는 것 | 결과 |
|---|---|
| 로그인 세션 전부 | 모두 로그아웃. 다시 로그인하면 된다 |
| 초안 소유권 | 진행 중이던 초안을 못 이어 쓴다. **대화는 DB에 남아 있다** |
| 턴 락 | 그 순간 중복 호출 가능. 다음 턴부터 정상 |
| 단계 정보 | 칩이 안 보인다. 자유 입력으로 계속 가능 |

**민원이나 대화가 사라지지 않는다.** 이게 작업본 방식을 안 쓴 이유다.

**PostgreSQL이 죽으면** 서비스가 선다. 그건 Redis로 가릴 수 없고 가려서도 안 된다 —
접수됐다고 알린 민원이 실제로는 없는 상황이 최악이다.

### 7-2.5 Redis 키 수명

| 키 | TTL | 갱신 |
|---|---|---|
| `sess:{session_id}` | 로그인 유지 시간 | **요청마다 연장** (sliding) |
| `turn:{sid}:running` | 짧게 (한 턴 최대 시간) | — |
| `compact:{sid}` | 짧게 (압축 1회 시간) | — |
| `sess_state:{sid}` | 초안과 같게 | 턴마다 갱신 |

**모든 키에 TTL이 있다.** 없는 키를 만들지 않는다 — 지우는 것을 잊으면 영원히 남는다.
세션 삭제·탈퇴 시에도 명시적으로 지우지만, TTL이 마지막 안전망이다.

---

## 8. LLM 계층 — Bedrock 호출 규격

### 8.1 환경이 강제하는 것 세 가지

실측 코드(`connectionTest/bedrock_simple_test.py`)가 확인해준 제약이다. **어기면 무조건 실패한다.**

| 규칙 | 어기면 |
|---|---|
| **리전을 명시하지 않는다** | 팀마다 배정 리전이 다르고 IAM이 타 리전을 전부 차단한다 → `AccessDenied` |
| **`global.` 추론 프로필을 쓴다** | raw 모델 id는 `on-demand throughput isn't supported` |
| **자격증명을 코드에 넣지 않는다** | EC2 인스턴스 프로파일이 자동으로 잡힌다 |

```python
# llm/client.py
import boto3, json
from app.core.config import settings

# 리전 인자를 주지 않는다 — EC2가 자기 리전을 알려준다
_bedrock = boto3.client(service_name="bedrock-runtime")

MODEL_ID = settings.LLM_MODEL_ID      # "global.anthropic.claude-sonnet-5"
```

**모델 id를 `config`에서 읽는다.** 대회에서 허용 모델이 바뀌거나 더 싼 모델로 내릴 수 있다.

### 8.2 어떤 API를 쓰나

**`invoke_model` + Anthropic 네이티브 Messages 포맷.**

```python
body = json.dumps({
    "anthropic_version": "bedrock-2023-05-31",   # 고정값
    "max_tokens": 1024,
    "system": SYSTEM_PROMPT,                     # 문자열 하나
    "messages": [...],
    "tools": [ASK_FOLLOWUP, CLASSIFY_AND_REFINE],
    "tool_choice": {"type": "any"},              # ★ 반드시 도구 하나를 부르게 강제
})
resp = _bedrock.invoke_model(modelId=MODEL_ID, body=body)
data = json.loads(resp["body"].read())
```

**`tool_choice: {"type": "any"}`가 핵심이다.** 기본값(`auto`)이면 모델이 도구를 안 부르고
그냥 텍스트로 답할 수 있다. 그러면 §7-1.1의 "어느 도구를 불렀나"로 부족을 판정하는 구조가
무너진다. `any`는 **둘 중 하나는 반드시 부르게** 한다.

> 가이드 주의: Claude와 GPT는 같은 `invoke_model`을 쓰지만 **요청·응답 포맷이 다르다.**
> 모델 id만 바꿔서는 동작하지 않는다. 모델을 갈아끼우려면 `llm/client.py`의 본문 조립과
> 파싱을 함께 바꿔야 하고, **그래서 이 폴더 밖에는 Bedrock 이야기가 없어야 한다.**

### 8.3 messages 조립

**세션주제는 `system`에, 버퍼는 `messages`에.**

```python
body = {
    "system": SYSTEM_PROMPT + (f"\n\n[지금까지의 맥락]\n{context}" if context else ""),
    "messages": _to_messages(buffer),
    ...
}
```

**압축된 맥락을 `messages`에 사용자 발화처럼 끼워 넣지 않는다** —
모델이 그것을 학생이 방금 한 말로 읽는다.

버퍼를 Anthropic 포맷으로 옮긴다.

```python
# repo의 role 값 → Anthropic role 값
def _to_messages(history: list[dict]) -> list[dict]:
    return [
        {"role": "user" if h["role"] == "student" else "assistant",
         "content": h["content"]}
        for h in history
    ]
```

| DB `role` | Anthropic `role` |
|---|---|
| `student` | `user` |
| `assistant` | `assistant` |

**규칙 두 가지**

- **첫 메시지는 반드시 `user`여야 한다.** 대화는 항상 학생 발화로 시작하므로 자연히 맞지만,
  세션 복원 시 잘린 기록이 들어오면 깨질 수 있다. 조립 후 검사한다.
- **`user`와 `assistant`가 번갈아야 한다.** 우리 흐름은 한 턴에 한 쌍씩 쌓이므로 유지되지만,
  LLM 호출이 실패해 학생 발화만 저장된 경우 `user`가 연속될 수 있다.
  **그때는 연속된 것을 하나로 합쳐서 보낸다.**

```python
def _merge_consecutive(msgs):
    """user 발화가 연속되면 합친다 — 이전 턴이 LLM 실패로 끝난 경우"""
```

**시스템 프롬프트는 `messages`에 넣지 않는다.** 최상위 `system` 필드다.
`{"role": "system"}` 메시지를 넣으면 거부된다.

### 8.4 도구 두 개

```python
# llm/tools.py
CATEGORIES = ["냉난방 / 공조", "위생 / 배관", "전기 / 설비",
              "영상 / 기자재", "공간 / 편의", "안전 / 보안", "기타"]

ASK_FOLLOWUP = {
    "name": "ask_followup",
    "description": (
        "카테고리·위치·상황 중 하나라도 확정할 수 없으면 이 도구를 부른다. "
        "추측해서 채우지 말고 반드시 되물어라."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "missing":  {"type": "string", "enum": ["category", "location", "detail"]},
            "question": {"type": "string", "description": "학생에게 물을 한 문장"},
            "choices":  {"type": "array", "items": {"type": "string"},
                         "description": "고르기 쉬운 선택지 3~5개"},
        },
        "required": ["missing", "question", "choices"],
    },
}

CLASSIFY_AND_REFINE = {
    "name": "classify_and_refine_complaint",
    "description": "카테고리·위치·상황이 모두 확정될 때만 부른다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category":       {"type": "string", "enum": CATEGORIES},   # ★ enum으로 고정
            "location":       {"type": "string", "description": "건물명/층/호실"},
            "refined_title":  {"type": "string", "description": "공문서 제목, 30자 내외"},
            "refined_body":   {"type": "string", "description": "현상/영향/요청 3단 구조"},
            "session_title":  {"type": "string", "description": "사이드바용 짧은 제목"},
        },
        "required": ["category", "location", "refined_title", "refined_body", "session_title"],
    },
}
```

**`category`를 `enum`으로 묶는 이유**: 자유 문자열이면 "냉난방 문제"·"냉난방/공조"처럼
매번 미묘하게 다른 값이 온다. `complaints.category`가 정확히 7개 중 하나여야 하는데
매칭이 깨진다. **스키마로 강제하면 파싱 후 검사할 필요가 없다.**

**`session_title`을 확정 턴에 함께 받는 이유**: 제목만 뽑으려고 모델을 한 번 더 부르지 않는다.
어차피 그 대화를 읽고 있다.

### 8.5 응답 파싱

```python
def refine(history: list[dict]) -> RefineResult:
    t0 = time.monotonic()
    try:
        data = _invoke(history)
    except Exception as e:
        bedrock_log_repo.add(model_id=MODEL_ID, is_complete=False,
                             latency_ms=_ms(t0), error=str(e)[:500])
        raise BedrockError()                       # → 502

    block = next((b for b in data.get("content", []) if b.get("type") == "tool_use"), None)

    bedrock_log_repo.add(
        model_id=MODEL_ID,
        is_complete=(block or {}).get("name") == "classify_and_refine_complaint",
        latency_ms=_ms(t0),
        input_tokens=data.get("usage", {}).get("input_tokens"),
        output_tokens=data.get("usage", {}).get("output_tokens"),
    )

    if block is None:
        return _retry_once_then_default(history)   # tool_choice=any인데도 없으면 이례적

    if block["name"] == "ask_followup":
        return RefineResult.incomplete(**block["input"])
    return RefineResult.complete(**block["input"])
```

**`stop_reason`이 아니라 `content`의 `tool_use` 블록을 본다.** 도구 호출이 있으면
`content` 배열에 `{"type": "tool_use", "name": ..., "input": {...}}`가 들어온다.

**`input`은 이미 파싱된 객체다.** JSON 문자열이 아니라 dict이므로 `json.loads`가 필요 없다.

**`tool_use` 블록이 여럿 올 수 있다.** 모델이 두 도구를 한꺼번에 부르는 경우다.
`next(...)`로 **첫 번째만 쓴다.** 둘을 합치려 들면 "부족한데 확정도 했다"는 모순 상태가 된다.
`ask_followup`과 `classify_and_refine`은 배타적이므로 먼저 나온 것을 모델의 판단으로 본다.

**압축 호출도 남긴다.** 심사에서 "호출이 몇 번 있었나"를 보는데 정제만 세면 실제보다 적다.
`is_complete`는 정제 호출에만 의미가 있으므로 압축 건은 `false`로 둔다.

**`school_id`는 요청 컨텍스트의 세션에서 가져온다.** 백그라운드 압축도 그 세션의 학교를 안다.

**로그는 성공·실패 모두 남긴다.** 실패만 안 남기면 심사 때 "호출이 몇 번 있었나"가 어긋난다.
**프롬프트와 응답 본문은 저장하지 않는다** — 민원 내용이 두 곳에 중복 보관되면
익명성 관리 대상이 늘어난다.

### 8.6 밖에서 보이는 것

```python
# llm/client.py — 이 폴더 밖에서 아는 것은 이것뿐이다
@dataclass
class RefineResult:
    is_complete: bool
    # is_complete=False
    missing: str | None          # 'category' | 'location' | 'detail'
    question: str | None
    choices: list[str] | None
    # is_complete=True
    category: str | None
    location: str | None
    refined_title: str | None
    refined_body: str | None
    session_title: str | None

def refine(context: str | None, buffer: list[dict]) -> RefineResult: ...
def compact(prev_context: str | None, messages: list[dict]) -> CompactResult: ...
    # CompactResult = { context, title } — 요약 전용. 도구를 붙이지 않는다
```

**`boto3`·`anthropic_version`·`tool_use` 같은 말이 서비스 계층에 등장하지 않는다.**
모델을 갈아끼우거나 Bedrock을 떠나도 `llm/` 안에서 끝나야 한다.

### 8.7 실패와 재시도

| 상황 | 처리 |
|---|---|
| `ThrottlingException` | 짧게 backoff 후 1회 재시도. 또 실패하면 502 |
| 타임아웃 | 재시도하지 않는다 — 이미 오래 기다린 사용자를 더 기다리게 한다 |
| 도구를 안 부름 | 1회 재시도. 또 안 부르면 `ask_followup` 기본값으로 대체 |
| `AccessDenied` | **재시도하지 않는다.** 설정 문제라 다시 불러도 같다. 로그에 남기고 502 |

**학생 발화는 호출 전에 이미 저장돼 있다.** 실패해도 다시 보내면 이어진다.

---

## 9. 인증과 세션

```python
# session/login_session.py
def create(user_id, school_id, role) -> str        # 세션 id 반환
def get(session_id) -> dict | None                 # 있으면 TTL 연장 (sliding)
def delete(session_id) -> None
def delete_all_for_user(user_id) -> None           # 탈퇴 시
```

**세션 실체가 Redis에 있어야 하는 이유**: 워커가 여럿이라 프로세스 메모리에 두면
다음 요청이 다른 워커로 갈 때 로그인이 풀린다.

**조회할 때마다 TTL을 연장한다.** 고정 만료면 민원을 길게 쓰는 도중 로그아웃된다.

### 역할은 코드가 정한다

```python
# services/auth_service.py
def signup(email, password, admin_code):
    school = school_repo.find_by_domain(conn, email.split('@')[-1])
    if not school: raise UnsupportedDomain()          # → 400
    code = (admin_code or "").strip()
    if not code:                                   role = 'student'
    elif school_repo.verify_admin_code(conn, school['id'], code):  role = 'admin'
    else:                                          raise InvalidAdminCode()   # → 400
```

**"교직원입니다" 같은 불린을 받지 않는다.** 받으면 클라이언트가 스스로 관리자라고 주장할 수 있다.
코드는 서버만 아는 값이라 그것 하나로 판정하면 주장할 여지가 없다.

**틀린 코드를 조용히 학생으로 강등시키지 않는다.** 관리자로 가입된 줄 알고 헤매게 된다.

---

## 10. 저장 계층 운영

**커넥션 풀은 워커마다 따로다.** `풀 크기 × 워커 수`가 PostgreSQL `max_connections`를 넘으면
연결을 못 얻어 요청이 대기한다. 둘을 함께 정한다.

**LLM 호출 중에는 커넥션을 잡고 있지 않는다.** Bedrock이 수 초 걸리는데 그동안 커넥션을
붙들면 풀이 금방 마른다. 저장 → 커넥션 반납 → LLM 호출 → 다시 얻어 저장 순서로 간다.

---

## 11. 계약과의 연결

`api-contract.md`의 24개 함수가 서비스의 어디로 가는지.

| 계약 | 서비스 |
|---|---|
| #1 `listSchools` | `school_service.list_all` — 얇지만 계층을 건너뛰지 않는다 |
| #2~7 인증 | `auth_service` |
| #7-1 `verifyPassword` | `auth_service.verify_password` |
| #8~11 대화 세션 | `session_service` (접수는 `POST /chat-sessions/{sid}/submit`) |
| #12~15 게시판 | `complaint_service` |
| #16~23 관리자 | `complaint_service` (+ `bedrock_log_repo`) |

**단순 조회여도 서비스를 거친다.** 위임 한 줄이 아깝다고 §2의 계층 규칙에 예외를 만들면,
"이건 간단하니까"가 쌓여 규칙이 무너진다. 예외 없는 규칙이라야 테스트로 강제할 수 있다.

---

## 12. 정할 것

- 커넥션 풀 크기와 워커 수 (PostgreSQL `max_connections`와 함께)
- **버퍼 크기 N과 압축 임계치** — 작으면 압축이 자주 돌아 비용이 늘고, 크면 맥락이 길어진다
- **압축용 모델** — 본 응답과 같은 것을 쓸지 더 싼 것을 쓸지
- 세션 TTL · 초안 TTL · 턴 TTL
- `verify_password` 실패 횟수 제한
- 마이그레이션 도구 (Alembic을 쓸지, `init_db.py` 한 장으로 갈지)
- 정리 작업(만료 초안·잠금 회수)을 어디서 돌릴지 — 별도 프로세스 vs 요청 중 기회적으로
