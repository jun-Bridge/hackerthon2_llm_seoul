# Design Document

## Overview

UniVoice는 학교별로 격리된 익명 캠퍼스 민원 서비스다. 학생이 자연어로 불편을 말하면 AWS Bedrock이 대화형으로 되물어 정보를 채운 뒤 카테고리·위치·제목·본문을 갖춘 확정안을 만들고, 학생이 확인 후 접수하면 같은 학교 게시판에 익명으로 공개된다. 관리자는 자기 학교 민원만 보고 정해진 상태 전이 규칙에 따라 처리한다.

이 문서는 시스템을 구성하는 컴포넌트와 그 상호작용을 정의한다. 기능적 요구사항의 출처는 `requirements.md`이고, 이 문서는 그것을 구현 가능한 구조로 옮긴다. 프론트-백엔드 HTTP 경계의 상세 계약은 `docs/api-contract.md`, 백엔드 내부 모듈 분해는 `docs/backend-design.md`에 있으며 이 문서는 그 둘을 아우르는 요약 관점을 제공한다.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              AWS Bedrock (Claude Sonnet 5)           │
│   도구 둘: ask_followup · classify_and_refine        │
│   tool_choice=any — 매 턴 하나는 반드시 부른다        │
└───────────────────────────┬──────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │  FastAPI (uvicorn)  │
                 │  워커 N개 · :8501    │
                 │  정적 프론트도 서빙  │
                 └───┬──────────────┬──┘
                     │              │
        ┌────────────▼────┐  ┌──────▼──────────────┐
        │  PostgreSQL     │  │       Redis         │
        │  확정된 것       │  │   살아있는 것        │
        ├─────────────────┤  ├─────────────────────┤
        │ schools         │  │ sess:{login_sid}    │
        │ admin_codes     │  │ turn:{sid}:running  │
        │ users           │  │ compact:{sid}       │
        │ chat_sessions   │  │ sess_state:{sid}    │
        │ complaints      │  └─────────────────────┘
        │ ..._conversations │
        │ ..._comments    │
        │ bedrock_logs    │
        └─────────────────┘
```

**워커가 여럿이라는 것의 의미**: LLM 호출이 수 초씩 걸린다. 워커가 하나면 한 사람이 민원을
정제하는 동안 다른 사람의 게시판 조회까지 막힌다. 워커를 늘려 그 대기가 서로를 막지 않게 한다.
**대신 프로세스 메모리에 상태를 둘 수 없다** — 다음 요청이 다른 워커로 갈 수 있으므로
세션은 Redis, 확정 데이터는 PostgreSQL에 둔다.

**역할 기반 화면 분기**: 목업 HTML은 상단 스위처로 학생/관리자 뷰를 자유 전환하지만, 실제 서비스에서는 로그인 세션의 `role`이 화면을 고정한다. 관리자 계정으로 로그인하면 관리자 대시보드만 보이고, 학생 계정은 작성+게시판만 보인다.

**변환이 대화형이라는 것의 의미**: 학생 입력 한 번으로 끝나는 원샷 변환이 아니다. 모델은 매 턴 도구 **둘 중 하나**를 부른다 — 부족하면 `ask_followup`(질문 + 선택지), 충분하면 `classify_and_refine`(확정안). **어느 것을 불렀는지가 곧 "부족한가"의 답이다.** 이 왕복이 `complaint_conversations`에 전부 쌓이고, 확정되면 미리보기가 뜬다.

**처리 상태가 열람/결정/진행 세 국면으로 나뉜다는 것의 의미**: 접수된 민원은 관리자가 아직 안 본 `미확인`으로 시작한다. 상세 화면을 여는 행위 자체가 `확인`으로 전환시키고(버튼 없음), `확인` 상태에서만 수락/보류/거절 결정이 가능해진다. 수락은 즉시 끝나는 게 아니라 `처리중`을 거쳐야 `해결완료`에 도달한다. 보류는 사유 코멘트가 없으면 전환 자체가 성립하지 않는다.

### Layered Backend Structure

```
routes  →  services  →  repo / session / llm
              ↑
           schemas (계약 타입)   core (설정·예외)
```

| 규칙 | 왜 |
|---|---|
| 라우터가 `repo`·`session`·`llm`을 직접 부르지 않는다 | 그러면 판단이 라우터로 샌다 |
| `repo`가 `services`를 부르지 않는다 | 순환이 생기고 트랜잭션 경계가 흐려진다 |
| 같은 층끼리 부르지 않는다 (`llm` ↛ `repo`, `session` ↛ `repo`) | 누가 트랜잭션을 쥐는지 흐려진다. `llm`은 `school_id`를 알지도 못한다 |
| SQL은 `repo/`에만 있다 | `school_id` 필터를 강제할 곳이 한 군데여야 한다 |
| Redis 키 문자열은 `session/`에만 있다 | 키 이름이 흩어지면 지울 때 빠뜨린다 |
| Bedrock 호출은 `llm/`에만 있다 | 모델 교체가 이 폴더 안에서 끝나야 한다 |

라우터는 요청 파싱 → 세션에서 사용자 꺼내기 → 서비스 호출 → 결과 직렬화만 한다. 상태 전이가 가능한지, 소유자가 맞는지, 코드가 유효한지는 전부 `services` 이하 계층이 판단한다. 상세 모듈 목록과 각 파일의 책임은 `docs/backend-design.md` §2가 정본이다.

### File Structure

```
hackerthon2_llm_1/
├─ bedrock_simple_test.py        # Bedrock 연결 테스트
├─ requirements.txt
├─ init_db.py                    # PostgreSQL 스키마 초기화
├─ seed_schools.py               # 학교/이메일 도메인/관리자 코드 데모 시드
├─ backup_db.py                  # DB 백업 (cron)
│
├─ app/                          # 백엔드 계층 — docs/backend-design.md §2가 정본
│  ├─ main.py                   # FastAPI. 라우터 등록 → 정적 mount (순서 중요)
│  ├─ api/{deps.py, routes/}
│  ├─ schemas/                  # Pydantic 계약 타입
│  ├─ services/                 # 판단이 사는 곳
│  ├─ repo/                     # SQL이 사는 곳
│  ├─ session/                  # Redis가 사는 곳
│  ├─ llm/                      # Bedrock이 사는 곳
│  └─ core/                     # 설정·예외·로깅
│
├─ frontend/                    # 정적 파일. 같은 서버가 서빙
│
├─ docs/                        # 설계 문서 · 프론트·백 연결 규약
└─ .kiro/specs/complaint-assistant/
```

이전 판(문서 줄 편집 + 제안/승인 캔버스 서비스)의 `document_core.py`·`tool_executor.py`·`proposal_manager.py`는 제거되었다. 이 서비스는 문서를 줄 단위로 편집하지 않고, 민원 하나 = 대화 후 확정되는 레코드 하나이므로 제안/승인/diff 개념이 필요 없다.

## Components and Interfaces

### AuthService

**책임**: 가입 규칙 판정(도메인 매칭, 코드 검증), 로그인, 비밀번호 관리.

- `signup(email, password, admin_code) -> user_id`: 이메일 도메인으로 학교를 조회하고, `admin_code`가 비어 있으면 `student`, 해당 학교 코드와 일치하면 `admin`, 불일치하면 `INVALID_ADMIN_CODE`로 거부한다.
- `login(email, password) -> session`: 계정이 없어도 더미 해시 대조를 한 번 수행해 응답 시간으로 계정 존재 여부가 새는 것을 막는다. "이메일 없음"과 "비밀번호 틀림"을 구분하지 않고 동일한 오류를 반환한다.
- `verify_password(user_id, password) -> bool`: 상태를 바꾸지 않는 순수 검증. 철회·탈퇴 흐름의 1단계에서 쓰인다.
- `change_password`, `delete_account`: 탈퇴 시 `users` 삭제와 `complaints.submitted_by_user_id` SET NULL이 함께 일어난다.

### SessionService (대화 세션)

**책임**: 대화 왕복 조율, 맥락 압축, 칩 병합, 턴 잠금.

- `send_message(session_id, text) -> RefineResult`: 학생 발화를 먼저 저장(LLM 실패해도 남도록) → 맥락(세션주제 + 압축 경계 이후 버퍼) 조립 → LLM 호출 전 DB 커넥션 반납 → Bedrock 호출 → 결과 저장.
- `compact(session_id)`: 미압축 분량이 임계치를 넘으면 턴 응답을 보낸 뒤 백그라운드로 실행. 이전 세션주제와 밀려난 대화를 함께 압축해 누적된 새 세션주제를 만든다. 최근 N턴은 압축 대상에서 제외한다.
- `merge_choices(missing, model_choices, category)`: 카테고리 단계는 고정 7종만 사용하고, 나머지 단계는 고정 칩 + 모델 제안을 합쳐 마지막에 "직접 입력"을 붙인다.
- 턴 잠금은 `turn:{session_id}:running`을 `SET NX`로 세우고 `finally`에서 해제한다.

### ComplaintService

**책임**: 접수 트랜잭션, 상태 전이, 철회, 코멘트.

- `submit(session_id) -> (complaint_id, next_session_id)`: 해당 세션의 마지막 `refined_json`을 조회해(없으면 `DRAFT_NOT_COMPLETE`) 한 트랜잭션으로 ① `complaints` 생성 ② 대화 행에 `complaint_id` 연결 ③ 세션을 읽기 전용으로 ④ 다음 세션 발급을 수행한다. `school_id`와 작성자는 세션 행에서 가져오며 요청 본문으로 받지 않는다.
- `open_detail(complaint_id, school_id)`: `WHERE status='미확인'` 조건으로 `확인` + `confirmed_at`을 갱신한다. 조건이 안 맞으면 조용히 아무 일도 하지 않는다(멱등).
- `accept/resolve/reject(complaint_id, school_id) -> bool`: 각각 선행 상태를 `WHERE`에 포함한 `UPDATE`로 전이한다.
- `hold(complaint_id, school_id, author_user_id, reason) -> bool`: 빈 사유는 DB 호출 전에 거부한다. 상태 전환과 코멘트 삽입을 한 트랜잭션으로 묶어 사유 없는 보류가 남지 않게 한다.
- `withdraw(complaint_id, user_id, password) -> bool`: 비밀번호 검증 후 `WHERE submitted_by_user_id = user_id` 조건으로 `철회`로 전환한다. 상태 무관하게 허용된다.
- `add_comment(complaint_id, author_user_id, content)`: 상태와 무관하게 항상 허용, 누적된다.

### LLM Client

**책임**: Bedrock 호출 캡슐화, 도구 스키마 정의, 응답 파싱.

모델에게 도구 둘을 주고 `tool_choice: {"type": "any"}`로 매 턴 하나를 반드시 부르게 강제한다.

| 부른 도구 | 뜻 | 반환 필드 |
|---|---|---|
| `ask_followup` | 정보 부족 | `missing`(enum) · `question` · `choices[]` |
| `classify_and_refine_complaint` | 확정 가능 | `category`(enum 7종) · `location` · `refined_title` · `refined_body` · `session_title` |

"부족한가"를 도구의 부재로 판정하지 않는다 — 부재로 읽으면 되묻는 문장만 얻고 선택지를 만들 수 없다. 도구를 둘로 나눠 부족도 구조화된 신호로 만든다. 이 설계는 억지 정보 채움도 방지한다: 부족할 때 부를 도구가 따로 있으므로 모델이 확정 도구를 억지로 부를 유인이 없다.

`llm` 계층은 `repo`를 직접 호출하지 않는다. 호출 결과(지연시간, 토큰 수, 성공 여부)를 `Usage` 값으로 반환하고, `bedrock_logs` 적재는 이를 호출한 `SessionService`가 수행한다(`llm`은 `school_id`를 알지 못하기 때문).

### Repository Layer

모든 조회·변경 함수는 `school_id`를 필수 인자로 받는다. 이는 API 편의가 아니라 격리 경계를 강제하는 계약이다 — 인자를 넘기지 않으면 함수를 호출할 수 없다. 철회된 민원(`status = '철회'`) 제외도 이 계층의 조회 함수 안에 내장되어 상위 계층이 잊어도 새지 않는다.

## Data Models

**정본은 `requirements.md`의 Data Model 절이다.** ER 관계도와 PostgreSQL 스키마 전체를 여기에 다시 적지 않는다 — 같은 내용을 두 곳에 두면 반드시 갈라진다(이 프로젝트에서 실제로 여러 차례 발생했던 문제).

읽을 때 놓치기 쉬운 삭제 전파 규칙만 요약한다.

| 관계 | 삭제 전파 | 왜 |
|---|---|---|
| `user → complaints` | **SET NULL** | 민원은 학교의 공공 기록이라 탈퇴와 무관하게 보존. 게시판은 이미 익명이라 표시에 영향 없음 |
| `user → chat_sessions` | CASCADE | 대화 목록은 개인 것이므로 계정과 함께 사라진다 |
| `chat_sessions → conversations` | **SET NULL** | 세션이 사라져도 접수된 민원의 근거 대화는 남아야 한다. CASCADE면 탈퇴 시 민원은 남는데 원문이 비는 사고가 난다 |
| `complaints → conversations` | CASCADE | 민원이 지워지면 대화도 무의미 |
| `user → complaint_comments` | SET NULL | 코멘트 텍스트는 남는다. 표시가 어차피 "관리자"뿐이라 식별이 노출되지 않는다 |

대화 행(`complaint_conversations`)은 두 주인을 갖는다. 접수 전에는 `chat_session_id`로 조회하고, 접수 후에는 두 FK가 모두 채워져 어느 쪽으로 찾아도 같은 행이 나온다.

## Correctness Properties

시스템이 어떤 구현으로 짜이든 항상 성립해야 하는 불변식이다.

1. **학교 격리 불변식**: 임의의 민원 조회·변경 쿼리 `Q`에 대해, `Q`는 반드시 `school_id = <세션의 school_id>` 조건을 포함한다. 이 조건이 빠진 쿼리는 존재해서는 안 된다.
2. **상태 전이 원자성**: 상태 전이는 항상 `UPDATE ... WHERE id = ? AND school_id = ? AND status = '<선행상태>'` 형태로 수행되며, 조회 후 판정(read-then-write)으로 구현되지 않는다. 동시에 두 요청이 같은 민원의 같은 전이를 시도하면 정확히 하나만 성공한다.
3. **보류 원자성**: `확인 → 보류` 전이와 그 사유 코멘트 삽입은 하나의 트랜잭션이다. 사유 없는 보류 상태가 존재해서는 안 된다.
4. **익명성 불변식**: `submitted_by_user_id`와 `complaint_comments.author_user_id`는 어떤 API 응답에도 원본 값으로 노출되지 않는다. "내 글 여부"가 필요한 경우 서버가 세션과 대조해 계산한 불린 값(`is_mine`)만 노출된다.
5. **확정안 무결성**: 접수되는 민원의 `category`/`location`/`refined_title`/`refined_body`는 항상 서버가 `complaint_conversations.refined_json`에서 조회한 값이며, 클라이언트가 요청 본문으로 제출한 값이 그대로 반영되는 경로는 존재하지 않는다.
6. **철회 가시성**: `status = '철회'`인 민원은 학생 게시판, 관리자 목록, 직접 id 조회를 포함한 모든 조회 경로에서 제외된다.
7. **확인 전이 멱등성**: `open_detail`을 동일 민원에 대해 여러 번 호출해도(이미 `확인` 이후 상태라면) 상태나 `confirmed_at`이 변하지 않는다.
8. **처리중 필수 경유**: `해결완료` 상태에 도달한 모든 민원은 반드시 그 이전에 `처리중` 상태를 거쳤다. `확인`에서 `해결완료`로의 직접 전이는 존재하지 않는다.
9. **대화 영속성**: 학생의 발화는 LLM 호출의 성패와 무관하게 저장된다. LLM 호출이 실패해도 학생이 입력한 메시지는 유실되지 않는다.
10. **세션 소유권**: 사용자는 자신이 생성한 `chat_sessions` 행이 아닌 세션에 접근할 수 없으며, 위반 시 404를 반환한다(403이 아니다 — 다른 학교/사용자 세션의 존재 여부도 노출하지 않기 위함).

## Data Flow

### 민원 대화 → 접수
```
학생 메시지 → send_message() → 대화 기록 → refine_complaint()
  → is_complete=False → 되묻기 반복
  → is_complete=True  → 미리보기 → "정식 접수" 확인창 → submit() → create_complaint()
       (상태는 항상 '미확인'으로 시작)
```

### 관리자 열람 → 자동 확인
```
목록에서 민원 클릭
  → ComplaintService.open_detail(id, school_id) 호출
       → status='미확인' 조건이 맞으면 '확인'+confirmed_at 기록
       → 이미 확인 이후 상태면 조건 불일치로 아무 변화 없음 (안전하게 재호출 가능)
  → 상세 화면과 목록 통계 모두 최신 상태 반영
```

### 결정 버튼 (확인 상태에서만 노출)
```
[수락] → accept() → WHERE status='확인' → '처리중'
[보류] → 모달에서 reason 입력 → hold(reason) → 빈 값이면 서비스 레이어에서 거부
                                → WHERE status='확인' → '보류' + 코멘트 INSERT (단일 트랜잭션)
[거절] → reject() → WHERE status='확인' → '거절'
```

### 처리중 이후
```
[해결 완료] → resolve() → WHERE status='처리중' → '해결완료'
```

### 코멘트 (상태 무관, 언제든)
```
코멘트 입력 → add_comment() → complaint_comments INSERT (is_hold_reason=false)
```

### 철회
```
학생 "철회" → ① 경고+비밀번호 ② 최종 확인창 ③ withdraw() → status='철회' → 모든 목록에서 제외
```

## Error Handling

| 오류 상황 | 처리 |
|---|---|
| Bedrock 호출 실패 (`ThrottlingException`) | 1회 backoff 재시도. 학생 발화는 이미 저장돼 있으므로 재시도해도 대화가 끊기지 않는다 |
| Bedrock 호출 실패 (`AccessDenied`) | 재시도하지 않고 즉시 오류 반환 |
| 이메일 중복 | `EMAIL_TAKEN` (409) |
| 도메인 미등록 | `UNSUPPORTED_DOMAIN` (400) |
| 관리자 코드 불일치 | `INVALID_ADMIN_CODE` (400), 가입 자체를 차단 (조용히 학생으로 강등하지 않음) |
| 상태 전이 조건 불일치 (`accept`/`resolve`/`hold`/`reject`) | `rowcount=0` → `INVALID_TRANSITION` (409). 정상 흐름에서는 UI가 버튼을 상태별로만 노출하므로 발생하지 않지만, 동시 조작의 방어선 |
| 보류 코멘트 공백 | `HOLD_REASON_REQUIRED` (422). DB 호출 자체가 일어나지 않음 |
| 철회 시 비밀번호 불일치 | `WRONG_PASSWORD` (401), 상태 불변 |
| 철회 시 소유권 불일치 | `NOT_OWNER`, 요청 거절 (UI에서 버튼 자체를 감추므로 방어적 계층) |
| 다른 학교 민원에 대한 조회/변경 | `NOT_FOUND` (404) — 존재 여부 자체를 노출하지 않음 |
| 중복 턴 요청 | `TURN_IN_PROGRESS` (409) |
| 같은 단계가 반복되는 대화 (4회 이상) | `CONVERSATION_STUCK` (409), 프론트가 대안 경로 제시 |
| 접수 시 확정안 없음 | `DRAFT_NOT_COMPLETE` (409) |
| 이미 접수된 세션에 재접수 시도 | `SESSION_CLOSED` (409) |

세부 오류 코드 목록과 프론트 처리 방침은 `docs/api-contract.md`가 정본이다.

## Testing Strategy

### 상태 전이 검증
```python
def test_new_complaint_starts_unconfirmed():
    complaint_id = create_complaint(...)
    assert get_complaint(complaint_id)["status"] == "미확인"

def test_opening_detail_auto_confirms():
    open_detail(complaint_id, school_id)
    assert get_complaint(complaint_id)["status"] == "확인"

def test_accept_requires_confirmed_status():
    # 아직 미확인 상태
    ok, _ = accept(complaint_id, school_id)
    assert ok is False

def test_accept_then_resolve_sequence():
    open_detail(complaint_id, school_id)      # 미확인 → 확인
    accept(complaint_id, school_id)           # 확인 → 처리중
    ok, _ = resolve(complaint_id, school_id)  # 처리중 → 해결완료
    assert ok is True

def test_cannot_resolve_without_accept():
    open_detail(complaint_id, school_id)  # 확인 상태까지만
    ok, _ = resolve(complaint_id, school_id)  # 처리중을 건너뜀
    assert ok is False

def test_hold_requires_reason():
    open_detail(complaint_id, school_id)
    ok, _ = hold(complaint_id, school_id, admin_id, reason="")
    assert ok is False
    assert get_complaint(complaint_id)["status"] == "확인"

def test_hold_with_reason_creates_comment():
    open_detail(complaint_id, school_id)
    hold(complaint_id, school_id, admin_id, reason="부품 재고 확인 필요")
    assert any(c["is_hold_reason"] for c in get_comments(complaint_id))

def test_comment_allowed_regardless_of_status():
    # 미확인 상태에서도
    ok, _ = add_comment(complaint_id, admin_id, "확인 예정입니다")
    assert ok is True
```

### 학교 격리 검증
```python
def test_accept_fails_across_schools():
    complaint_id = create_complaint(school_a, ...)
    confirm_complaint(complaint_id, school_a)

    ok = accept_complaint(complaint_id, school_b)  # 다른 학교로 시도
    assert ok is False
    assert get_complaint(complaint_id, school_a)["status"] == "확인"  # 안 바뀜
```

### 대화형 정제 검증
```python
def test_refine_asks_when_incomplete():
    result = refine_complaint([{"role": "student", "content": "에어컨이 이상해요"}])
    assert result["is_complete"] is False

def test_refine_completes_after_followup():
    conversation = [
        {"role": "student", "content": "에어컨이 이상해요"},
        {"role": "assistant", "content": "어느 건물 몇 층인가요?"},
        {"role": "student", "content": "공학관 3층 실습실이요, 소리가 심해요"}
    ]
    result = refine_complaint(conversation)
    assert result["is_complete"] is True
    assert result["category"] in CATEGORIES
```

## Performance Considerations

- Bedrock 응답 시간: 왕복당 2~4초
- 대화 왕복 수: 보통 1~3회
- 게시판/통계/코멘트 조회: < 50ms (PostgreSQL, 학교당 민원 수 적음)

## Security

- 비밀번호: bcrypt 해싱, 평문 저장 금지
- 관리자 코드: 시드 스크립트로만 생성
- 학교 스코프: 모든 민원 쿼리에서 `school_id` 필수
- 상태 전이: 각 메서드가 선행 상태를 WHERE에 포함해 순서를 우회한 전이를 DB 레벨에서 차단
- 철회 소유권: `submitted_by_user_id` 필수
- 익명성: `submitted_by_user_id`, 코멘트 `author_user_id`는 화면에 절대 표시하지 않음 (내부 로직 전용)
- EC2: Instance Profile로 Bedrock 인증, Access Key 없음

## Next Steps (Post-Competition)

1. 관리자 알림 (신규 민원 발생 시)
2. 학생에게 상태 변경 알림
3. 카테고리별/기간별 통계 대시보드
4. 이미지 첨부
5. 실시간 반영 고도화 (SSE — 현재 구조에서 바로 가능)
