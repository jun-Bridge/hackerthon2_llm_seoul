# Tasks — UniVoice (학교별 익명 캠퍼스 민원 서비스)

## M0: 대회 환경 검증

### TASK-001: Bedrock API 연결 테스트
**Depends on**: -
**Status**: OPEN

**Description**:
AWS Bedrock API 호출이 성공하는지, 도구 호출을 지원하는지 검증합니다.

**Acceptance Criteria**:
- [ ] `bedrock_simple_test.py`로 `global.anthropic.claude-sonnet-5` 텍스트 응답 수신 확인
- [ ] `boto3.client('bedrock-runtime')` 호출 시 리전을 지정하지 않음 (Instance Profile이 자동 처리)
- [ ] 도구 호출(tool_choice 미지정, auto) 요청 시 `tool_use` 블록 반환 확인
- [ ] 도구를 호출하지 않고 텍스트로만 답하는 경우도 확인 (되묻기 시나리오 사전 검증)

**Files to modify**:
- `bedrock_simple_test.py` (기존 파일 존재 — 로직 유지, 모델 ID만 확인)

---

### TASK-002: EC2 인스턴스 설정 및 접속
**Depends on**: -
**Status**: OPEN

**Description**:
대회 제공 EC2 인스턴스에 SSH로 접속하고 기본 환경을 설정합니다.

**Acceptance Criteria**:
- [ ] `hackathon-e1-t01-key.pem`으로 SSH 접속 성공 (이미 확보됨 — `connectionTest/`)
- [ ] Python 3.11+, git, pip 사용 가능 확인
- [ ] 보안 그룹에서 포트 8501 개방 확인 (이미 구성됨)

---

### TASK-003: 프로젝트 구조 생성 및 PostgreSQL 스키마 초기화
**Depends on**: -
**Status**: OPEN

**Description**:
`docs/backend-design.md` §2의 모듈 구성대로 디렉토리를 만들고, 스키마를 초기화합니다.

**Acceptance Criteria**:
- [ ] 계층 구조 생성 — `app/{main.py,api/{deps.py,routes/},schemas/,services/,repo/,session/,llm/,core/}`
- [ ] `frontend/` — 정적 파일. `app/main.py`가 API 라우터 **뒤에** mount
- [ ] `requirements.txt`: `fastapi`, `uvicorn[standard]`, `psycopg[binary,pool]`, `redis`, `boto3`, `bcrypt`
- [ ] `.gitignore`에 `*.pem`, `.env` 추가
- [ ] `init_db.py` 실행 시 **7개 테이블** 생성: `schools`, `admin_codes`, `users`,
      `chat_sessions`, `complaints`, `complaint_conversations`, `complaint_comments`, `bedrock_logs`
- [ ] `complaints.status` CHECK 제약이 7종을 포함
- [ ] `complaint_conversations`의 두 FK — `chat_session_id` **SET NULL**, `complaint_id` CASCADE
- [ ] `chat_sessions.context`·`compacted_upto`·`is_manual_title` 존재
- [ ] `schools.aliases TEXT[]` 존재

**Files to create**:
- `app/` 이하 모듈, `frontend/`, `requirements.txt`, `init_db.py`

**스키마 정본**: `requirements.md`의 PostgreSQL Schema 절을 그대로 옮긴다.
여기에 다시 적지 않는다 — 두 곳에 있으면 갈라진다.

---

### TASK-004: 학교/도메인/관리자코드 시드 스크립트
**Depends on**: TASK-003
**Status**: OPEN

**Description**:
데모용 학교 여러 개, 이메일 도메인, 관리자 코드를 미리 심습니다. 가입 화면에는 학교 생성 UI가 없으므로 이 스크립트가 유일한 학교 등록 경로입니다.

**Acceptance Criteria**:
- [ ] `seed_schools.py` 실행 시 최소 2개 학교가 들어간다 (교차 격리 데모용)
- [ ] 각 학교에 이메일 도메인 1개, 관리자 코드 1~2개가 배정된다
- [ ] 재실행해도 중복 삽입되지 않는다 (`INSERT OR IGNORE` 또는 존재 체크)

**Files to create**:
- `seed_schools.py`

**Implementation**:
```python
# seed_schools.py
import os, psycopg

SCHOOLS = [
    {"name": "조선대학교", "domain": "chosun.ac.kr",
     "aliases": ["조선대", "조대"],   "codes": ["CSU-ADM-01", "CSU-ADM-02"]},
    {"name": "전북대학교", "domain": "jbnu.ac.kr",
     "aliases": ["전북대"],           "codes": ["JBNU-ADM-01"]},
    {"name": "광주과학기술원", "domain": "gist.ac.kr",
     "aliases": ["GIST", "지스트", "광주과기원"], "codes": ["GIST-ADM-01"]},
]

def seed():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for s in SCHOOLS:
            row = conn.execute(
                "INSERT INTO schools (name, email_domain, aliases) VALUES (%s,%s,%s) "
                "ON CONFLICT (email_domain) DO UPDATE SET aliases = EXCLUDED.aliases "
                "RETURNING id",
                (s["name"], s["domain"], s["aliases"])
            ).fetchone()
            for code in s["codes"]:
                conn.execute(
                    "INSERT INTO admin_codes (school_id, code) VALUES (%s,%s) "
                    "ON CONFLICT DO NOTHING",
                    (row[0], code)
                )
```

**여러 번 실행해도 안전해야 한다.** `ON CONFLICT`로 중복 삽입을 막는다 —
배포 스크립트가 매번 부르기 때문이다.


---

## M1: 계정 & 학교 시스템

### TASK-101: repo 계층 — 계정/학교

**Depends on**: TASK-004
**Status**: OPEN

**Acceptance Criteria**:
- [ ] `school_repo.find_by_domain(conn, domain)` — 없으면 `None`
- [ ] `school_repo.list_all(conn)` — 별칭 포함 (가입 드롭다운용)
- [ ] `school_repo.verify_admin_code(conn, school_id, code)`
- [ ] `user_repo.create/find_by_email/get_hash/change_password/delete`
- [ ] **모든 조회 함수가 `school_id`를 필수 인자로 받는다** (넘기지 않으면 호출 불가)
- [ ] 이메일은 소문자로 정규화해 저장·조회

**Files**: `app/repo/school_repo.py`, `app/repo/user_repo.py`

---

### TASK-102: auth_service — 가입·로그인·세션

**Depends on**: TASK-101
**Status**: OPEN

**Acceptance Criteria**:
- [ ] `signup(email, password, admin_code)` — **역할은 코드가 정한다**
      (비면 `student` · 맞으면 `admin` · 틀리면 `INVALID_ADMIN_CODE`로 가입 차단)
- [ ] 이메일 중복이면 `EMAIL_TAKEN`(409)
- [ ] bcrypt 해싱. 평문은 로그에도 남기지 않는다
- [ ] `login` — 계정이 없어도 더미 해시를 한 번 대조하고 401
      (응답 속도로 이메일 존재 여부가 새지 않게)
- [ ] "이메일 없음"과 "비밀번호 틀림"을 구분하지 않는다 — 둘 다 `INVALID_CREDENTIALS`
- [ ] `login_session.create/get/delete` — Redis. `get`은 **TTL을 연장**(sliding)
- [ ] 쿠키는 `HttpOnly` · `SameSite=Lax`
- [ ] `verify_password(user_id, password)` — 아무것도 바꾸지 않는다. 실패 횟수 제한

**Files**: `app/services/auth_service.py`, `app/session/login_session.py`, `app/api/routes/auth.py`

---

### TASK-103: deps — 인증·역할·소유권

**Depends on**: TASK-102
**Status**: OPEN

**Acceptance Criteria**:
- [ ] `current_user` — 쿠키 → Redis 조회. 없으면 401 `UNAUTHENTICATED`
- [ ] `require_admin` — 학생이 부르면 403 `FORBIDDEN_ROLE`
- [ ] `require_session_owner(sid, user_id)` — 남의 세션이면 **404**(403이 아니다)
- [ ] **초안·작성 API(#8~11)는 관리자가 부르면 403** — 민원을 넣는 것은 학생의 일이다
- [ ] 라우터에 인증 `if`를 쓰지 않는다. 전부 `Depends`로

**Files**: `app/api/deps.py`

---

## M2: AI 민원 변환 (대화형)

### TASK-201: llm 계층 — 도구 둘로 부족을 판정

**Depends on**: TASK-001
**Status**: OPEN

**Description**:
모델에게 도구 **둘**을 주고 **어느 것을 불렀는지**로 부족한지 아닌지를 읽습니다.

**Acceptance Criteria**:
- [ ] `CATEGORIES` 고정 7종 · `DETAIL_CHIPS` 카테고리별 고정 칩 (`llm/choices.py`)
- [ ] `ASK_FOLLOWUP` 스키마 — `missing`(enum) · `question` · `choices[]`
- [ ] `CLASSIFY_AND_REFINE` 스키마 — `category`(**enum**) · `location` · `refined_title` · `refined_body` · `session_title`
- [ ] **`tool_choice: {"type": "any"}`로 둘 중 하나를 반드시 부르게 강제**
- [ ] `invoke_model` + Anthropic 네이티브 포맷. **리전을 명시하지 않는다**
- [ ] 모델 id는 `core/config.py`에서 읽는다 (`global.` 프로필)
- [ ] `system`은 최상위 필드. 세션주제를 여기 넣는다 — `messages`에 끼우지 않는다
- [ ] `user` 발화가 연속되면 합쳐 보낸다 (이전 턴이 LLM 실패로 끝난 경우)
- [ ] `tool_use` 블록이 여럿이면 **첫 번째만** 쓴다
- [ ] `refine(context, buffer) -> RefineResult` · `compact(prev_context, messages) -> CompactResult`
- [ ] **`llm`은 `repo`를 부르지 않는다.** 호출 결과를 `Usage`에 담아 돌려주고 적재는 서비스가 한다
- [ ] `AccessDenied`는 재시도하지 않는다. `Throttling`만 1회 backoff

**Files**: `app/llm/{client.py,tools.py,choices.py,prompts.py}`

---

### TASK-202: session_service — 대화 왕복·칩·턴 잠금

**Depends on**: TASK-201, TASK-101
**Status**: OPEN

**Acceptance Criteria**:
- [ ] `send_message(session_id, text)` — 학생 발화 **먼저 저장**(LLM 실패해도 남는다)
- [ ] 맥락 조립 — `context`(세션주제) + `compacted_upto` 이후 버퍼
- [ ] **LLM 호출 전에 커넥션을 반납한다** (수 초 붙들면 풀이 마른다)
- [ ] `turn:{sid}:running`을 **`SET NX`**로 세운다. 이미 있으면 409 `TURN_IN_PROGRESS`
- [ ] `finally`로 반드시 해제 — 실패로 끝나도
- [ ] `ask_followup`이면 칩을 합친다 — **카테고리는 고정 7종만**, 나머지는 고정+모델, 끝에 "직접 입력"
- [ ] 칩을 `complaint_conversations.choices`에 **함께 저장**(Redis는 캐시)
- [ ] 같은 `missing`이 2회 반복되면 예시를 덧붙이고, 4회면 409 `CONVERSATION_STUCK`
- [ ] 공백·2000자 초과·직전과 동일한 발화는 **모델을 부르지 않고** 걸러낸다
- [ ] 확정 턴이면 `refined_json`을 같은 행에 저장하고 `chat_sessions`의 제목·카테고리 갱신
- [ ] `bedrock_logs` 적재는 여기서 한다 (`school_id`는 `chat_sessions`에서)

**Files**: `app/services/session_service.py`, `app/repo/conversation_repo.py`

---

### TASK-203: 세션 컨테이너 — 목록·압축

**Depends on**: TASK-202
**Status**: OPEN

**Description**:
"과거 대화" 목록과 맥락 압축을 구현합니다. `docs/backend-design.md` §7이 정본입니다.

**Acceptance Criteria**:
- [ ] `POST /chat-sessions` — 세션 행 생성. **빈 세션이 이미 있으면 재사용**(연타 방지)
- [ ] `GET /chat-sessions` — `user_id`로 거른다. **메시지 없는 세션은 제외**. 최신순
- [ ] `GET /chat-sessions/{sid}` — 메타 + 현재 `step` + `choices` + `preview`
- [ ] 압축 — 미압축 분량이 임계치를 넘으면 **턴 응답을 보낸 뒤** 백그라운드로
- [ ] **대상 구간을 시작 시점에 고정**하고, 갱신 SQL에 `WHERE compacted_upto = from`
- [ ] 새 세션주제 = 압축(**이전 세션주제** + 밀려난 구간) — 누적되어야 초반 맥락이 안 사라진다
- [ ] **최근 N턴은 압축하지 않는다**
- [ ] 압축 프롬프트에 "확정된 항목은 그대로 옮겨 적어라"
- [ ] `compact:{sid}`를 `SET NX`로 잠근다
- [ ] 실패해도 기존 값 유지 + 다음 턴 재시도. **응답에 영향 없음**
- [ ] `is_manual_title=TRUE`면 자동 갱신이 제목을 덮어쓰지 않는다

**Files**: `app/services/session_service.py`, `app/repo/chat_session_repo.py`, `app/session/session_state.py`

---

### TASK-204: 정식 접수 — 한 트랜잭션에 넷

**Depends on**: TASK-203
**Status**: OPEN

**Acceptance Criteria**:
- [ ] 마지막 `refined_json` 조회. 없으면 409 `DRAFT_NOT_COMPLETE`
- [ ] 이미 접수된 세션이면 409 `SESSION_CLOSED`
- [ ] **한 트랜잭션에 넷** — ① `complaints` INSERT ② 대화에 `complaint_id` 채움
      ③ `chat_sessions.complaint_id` 채움(읽기 전용화) ④ 다음 세션 발급
- [ ] `school_id`·작성자를 **세션 행에서** 가져온다 (요청 본문에서 받지 않는다)
- [ ] 응답에 `complaint_id`와 `next_session_id`
- [ ] **확정안을 요청 본문으로 받지 않는다** — 화면에서 값을 바꿔 보낼 수 있게 된다
- [ ] 프론트는 "이대로 접수하시겠습니까?" 확인창을 거친 뒤에만 호출한다

**Files**: `app/services/session_service.py`, `app/api/routes/session.py`

---

## M3: 학교별 게시판 & 철회

### TASK-301: 학생 게시판 (school_id 스코프)
**Depends on**: TASK-204
**Status**: OPEN

**Description**:
소속 학교 민원만 익명으로 나열합니다. 다른 학교 데이터는 조회 자체가 불가능해야 합니다.

**Acceptance Criteria**:
- [ ] `db.list_complaints(school_id)`가 항상 `school_id` WHERE 조건을 포함 (DB 레이어 필수 계약)
- [ ] `status != '철회'`인 항목만 반환
- [ ] 카테고리/위치/제목/본문/접수시각/상태 배지 표시 (미확인/확인/처리중/해결완료/보류/거절 6종 구분)
- [ ] "대화 원문 보기" 토글로 `complaint_conversations` 전체를 시간순 표시
- [ ] `db.get_comments(complaint_id)`로 관리자 코멘트를 함께 표시 (`is_hold_reason=True`인 코멘트는 "보류 사유"로 강조)
- [ ] `submitted_by_user_id`는 화면에 절대 출력하지 않음 (내 글 판별용으로만 클라이언트에서 비교)

**Files to modify**:
- `app/api/routes/board.py`, `app/repo/complaint_repo.py`

---

### TASK-302: 민원 철회 (비밀번호 재확인)
**Depends on**: TASK-301
**Status**: OPEN

**Description**:
본인이 접수한 민원에 한해 철회 버튼을 보여주고, 비밀번호 확인 후 상태를 `철회`로 전환합니다.

**Acceptance Criteria**:
- [ ] `complaint["submitted_by_user_id"] == 세션 상태(user_id)`인 항목에만 철회 버튼 표시
- [ ] 클릭 시 비밀번호 입력 폼 (`st.form`)이 뜬다
- [ ] `ComplaintService.withdraw(complaint_id, user_id, password)`:
  - 비밀번호 불일치 → "비밀번호가 올바르지 않습니다", 상태 불변
  - 일치 → `db.withdraw_complaint()` 호출, `status='철회'`
- [ ] `db.withdraw_complaint()`는 `submitted_by_user_id` 일치 조건을 WHERE에 포함 (타인 글 철회 방어)
- [ ] 철회 성공 시 게시판·관리자 목록 양쪽에서 사라진다 (프론트가 목록·통계를 다시 받는다)

**Files to modify**:
- `app/services/complaint_service.py`, `app/repo/complaint_repo.py`

---

## M4: 관리자 대시보드 (열람 자동확인 · 3단 결정 · 코멘트)

### TASK-401: DatabaseManager 상태 전이 메서드 구현
**Depends on**: TASK-301
**Status**: OPEN

**Description**:
상태 전이를 5개 메서드로 분리 구현합니다. 각 메서드는 선행 상태를 WHERE에 포함해 순서를 강제합니다.

**Acceptance Criteria**:
- [ ] `confirm_complaint(id, school_id)`: `WHERE status='미확인'` 조건으로 `확인`+`confirmed_at` 갱신. 이미 확인 이후 상태면 아무 것도 하지 않음 (재호출 안전)
- [ ] `accept_complaint(id, school_id) -> bool`: `WHERE status='확인'` 조건으로 `처리중` 전환, 실패 시 `False`
- [ ] `resolve_complaint(id, school_id) -> bool`: `WHERE status='처리중'` 조건으로 `해결완료` 전환
- [ ] `hold_complaint(id, school_id, author_user_id, reason) -> bool`: `WHERE status='확인'` 조건으로 `보류` 전환 **+ 같은 트랜잭션에서 `complaint_comments`에 `is_hold_reason=1` 코멘트 삽입**. 상태 전환이 실패하면 코멘트도 삽입되지 않음 (rollback)
- [ ] `reject_complaint(id, school_id) -> bool`: `WHERE status='확인'` 조건으로 `거절` 전환
- [ ] `add_comment(complaint_id, author_user_id, content)`: 상태 무관, 항상 `complaint_comments`에 INSERT
- [ ] `get_comments(complaint_id) -> list[dict]`: 시간순 반환, `is_hold_reason` 포함
- [ ] `get_complaint(id, school_id) -> dict | None`: 단일 민원 조회 (school_id 스코프)

**Files to modify**:
- `app/repo/complaint_repo.py`

---

### TASK-402: ComplaintService 상태 전이 래핑
**Depends on**: TASK-401
**Status**: OPEN

**Description**:
DB 메서드를 감싸 사용자용 성공/실패 메시지를 반환하고, 보류는 빈 사유를 서비스 레이어에서 먼저 거부합니다.

**Acceptance Criteria**:
- [ ] `open_detail(complaint_id, school_id)`: `db.confirm_complaint()` 호출 (반환값 없음, 사이드이펙트만)
- [ ] `accept/resolve/reject(complaint_id, school_id) -> (bool, str)`: 성공/실패 메시지 반환
- [ ] `hold(complaint_id, school_id, author_user_id, reason) -> (bool, str)`: `reason.strip()`이 빈 문자열이면 DB 호출 없이 `(False, "보류 사유를 입력해야 합니다")` 반환
- [ ] `add_comment(complaint_id, author_user_id, content) -> (bool, str)`: 빈 값 검증

**Files to modify**:
- `app/services/complaint_service.py`

---

### TASK-403: 통계 카드 & 필터 탭
**Depends on**: TASK-103, TASK-301
**Status**: OPEN

**Description**:
소속 학교 민원의 전체/상태별 건수를 보여주고, 탭으로 목록을 좁힙니다.

**Acceptance Criteria**:
- [ ] `db.get_complaint_stats(school_id)`: 전체 + 6상태(미확인/확인/처리중/해결완료/보류/거절), 철회 제외
- [ ] 통계 카드 7개 렌더링
- [ ] 필터 탭 클릭 시 `db.list_complaints(school_id, status=선택값)`로 목록 갱신

**Files to modify**:
- `app/api/routes/admin.py`

---

### TASK-404: 관리자 목록 테이블 & 상세 화면 (열람 시 자동 확인)
**Depends on**: TASK-402, TASK-403
**Status**: OPEN

**Description**:
표에서 민원을 클릭하면 상세 화면이 열리면서 그 즉시 `미확인 → 확인`으로 자동 전환됩니다.

**Acceptance Criteria**:
- [ ] `st.columns()`로 ID/분류·위치/제목/접수시각/상태 렌더링 (조치 버튼은 상세 화면에만 — 목록에는 없음)
- [ ] 행 클릭 시 `세션 상태(selected_complaint_id)` 설정과 **같은 처리 흐름에서** `ComplaintService.open_detail(id, school_id)` 호출
- [ ] 상세 화면에 학생-AI 대화 전체(`get_conversation_by_complaint`)와 최종 카테고리/위치/제목/본문 표시
- [ ] 상세 화면을 다시 열어도(이미 확인 이후 상태) 에러 없이 정상 표시됨 (재호출 안전성 검증)
- [ ] 목록·상세 어디에도 철회 버튼은 없음 (관리자는 철회 불가)

**Files to modify**:
- `app/api/routes/admin.py`

---

### TASK-405: 결정 버튼 — 수락/보류/거절 (확인 상태에서만 노출)
**Depends on**: TASK-404
**Status**: OPEN

**Description**:
`확인` 상태의 민원 상세 화면에서만 수락/보류/거절 버튼을 노출합니다. 보류는 코멘트 입력 모달을 필수로 거칩니다.

**Acceptance Criteria**:
- [ ] 현재 상태가 `확인`일 때만 [수락][보류][거절] 세 버튼이 보임 (`미확인`·`처리중`·`해결완료`·`보류`·`거절` 상태에서는 안 보임)
- [ ] "수락" 클릭 → `accept` → `확인`일 때만 `처리중`으로. 응답이 갱신된 민원이고, 목록·통계는 따로 다시 받는다
- [ ] "보류" 클릭 → `세션 상태(hold_modal_open) = True`로 모달 오픈 (버튼 클릭 즉시 전환되지 않음)
- [ ] 모달 내 코멘트 입력창이 비어 있으면 "보류 확정" 버튼이 비활성화되거나, 제출 시 `ComplaintService.hold()`가 거부하고 에러 메시지 표시
- [ ] 모달에서 사유를 입력하고 확정하면 `보류` 전환 + 코멘트 등록이 동시에 반영, 모달 닫힘
- [ ] "거절" 클릭 → `ComplaintService.reject()` → 성공 시 즉시 `거절`로 전환 (코멘트 입력 없이 즉시)

**Files to modify**:
- `app/api/routes/admin.py`

---

### TASK-406: 처리중 → 해결완료 전환
**Depends on**: TASK-405
**Status**: OPEN

**Description**:
`처리중` 상태의 민원 상세 화면에는 "해결 완료" 버튼만 노출됩니다.

**Acceptance Criteria**:
- [ ] 현재 상태가 `처리중`일 때만 [해결 완료] 버튼이 보임
- [ ] 클릭 → `resolve` → `처리중`일 때만 `해결완료`로. 두 단계를 건너뛸 수 없다
- [ ] `해결완료`는 최종 상태 — 이후 버튼이 아무것도 안 보임 (코멘트 입력창은 계속 보임)

**Files to modify**:
- `app/api/routes/admin.py`

---

### TASK-407: 코멘트 상시 입력 (상태 무관)
**Depends on**: TASK-402, TASK-404
**Status**: OPEN

**Description**:
민원 상태와 무관하게 언제든 코멘트를 추가할 수 있는 입력창을 상세 화면에 배치합니다.

**Acceptance Criteria**:
- [ ] 상세 화면 하단에 코멘트 목록(`get_comments`, 시간순)과 입력창이 항상 존재
- [ ] `is_hold_reason=True`인 코멘트는 "보류 사유"로 시각적으로 구분 표시
- [ ] 입력창에 텍스트를 넣고 "등록" → `add_comment`. 상태와 무관하게 언제든, 누적된다
- [ ] `미확인`·`해결완료`·`거절` 등 어떤 상태에서도 코멘트 입력이 막히지 않음

**Files to modify**:
- `app/api/routes/admin.py`

---

## M5: 대회 제출

### TASK-501: TEAM_GUIDE.html 최신화
**Depends on**: -
**Status**: OPEN

**Description**:
기존 `connectionTest/TEAM_GUIDE.html`은 인프라 구축 가이드로 그대로 유효합니다. UniVoice 데모 시나리오만 추가합니다.

**Acceptance Criteria**:
- [ ] 데모 절차: 학생 가입(도메인 이메일) → 민원 대화 작성 → 접수 → 관리자 가입(코드 입력) → 상태 변경 → 학생 게시판 확인 → 철회 시연
- [ ] 시드된 데모 학교/도메인/관리자 코드 값 명시

**Files to modify**:
- `connectionTest/TEAM_GUIDE.html`

---

### TASK-502: README.md 업데이트
**Depends on**: -
**Status**: OPEN

**Description**:
프로젝트 루트 README를 UniVoice 기준으로 업데이트합니다.

**Acceptance Criteria**:
- [ ] 서비스 개요 (학교별 익명 민원 + AI 대화형 정제)
- [ ] 기술 스택 (Bedrock, FastAPI, PostgreSQL, Redis)
- [ ] 실행 방법: PostgreSQL·Redis 기동 → `init_db.py` → `seed_schools.py` → `uvicorn app.main:app --port 8501 --workers 4`
- [ ] 데모 계정/도메인/코드 안내
- [ ] 팀 정보

**Files to modify**:
- `README.md`

---

### TASK-503: DB 백업 스크립트
**Depends on**: TASK-003
**Status**: OPEN

**Description**:
PostgreSQL 데이터베이스를 주기적으로 백업합니다. (기존 설계 그대로 유지)

**Acceptance Criteria**:
- [ ] `backup_db.py`: 타임스탬프 파일명으로 `data/backups/`에 복사
- [ ] cron으로 매일 실행, 7일 이상 된 백업 자동 삭제

**Files to create**:
- `backup_db.py`

---

### TASK-504: EC2 배포 스크립트
**Depends on**: TASK-102
**Status**: OPEN

**Description**:
EC2에서 한 번에 배포하는 스크립트를 작성합니다.

**Acceptance Criteria**:
- [ ] `deploy.sh`: PostgreSQL·Redis 기동 확인 → pip install → `init_db.py` → `seed_schools.py` → nohup uvicorn 실행
- [ ] Instance Profile 인증이므로 AWS 자격증명 설정 단계 없음
- [ ] 접속 주소와 로그 확인 명령 출력

**Files to create**:
- `deploy.sh`

**Implementation**:
```bash
#!/bin/bash
set -e
echo "=== UniVoice 배포 스크립트 ==="
pip3 install -r requirements.txt
python3 init_db.py
python3 seed_schools.py
mkdir -p data
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4 \
  > server.log 2>&1 < /dev/null &
echo "배포 완료! 접속 주소: http://$(curl -s ifconfig.me):8501"
echo "로그 확인: tail -f server.log"
```

---

### TASK-505: Bedrock 사용량 모니터링
**Depends on**: TASK-201
**Status**: OPEN

**Description**:
Bedrock 호출 횟수를 로깅합니다.

**Acceptance Criteria**:
- [ ] `refine_complaint()` 호출마다 호출 시각/모델 ID를 `data/bedrock_usage.log`에 기록
- [ ] `is_complete` 여부(되묻기 vs 확정)도 함께 기록해 대화 왕복 빈도를 파악할 수 있게 함

**Files to modify**:
- `app/llm/client.py`

---

## 완료 기준

- [ ] M0~M4 전체 완료
- [ ] EC2 공개 IP로 외부 접속 가능
- [ ] 데모: 학생 도메인 이메일 가입 → 대화형 작성(되묻기 최소 1회 포함) → 접수(미확인) → 관리자 코드로 가입 →
      목록에서 클릭(자동 확인) → 수락(처리중) → 해결 완료 / 또는 보류(코멘트 필수) → 학생 게시판 반영 확인 → 철회 시연
- [ ] 다른 학교 계정으로는 위 데이터가 전혀 보이지 않음을 확인
- [ ] `TEAM_GUIDE.html`, README 최신화

## 우선순위

**P0 (필수)**: M0, M1, M2, M3, M4
**P1 (중요)**: M5 (TASK-501, 502)
**P2 (선택)**: M5 (TASK-503, 504, 505)
