# 모듈 간 계약 (Interface Contracts)

**이 문서 + 각 폴더의 `*.py` 시그니처가 실제 계약이다.** 처음에는 본문이 `raise NotImplementedError`인 스텁으로 시작했고, 지금은 전 계층이 구현돼 실서버에서 돈다. 계약으로서의 역할은 그대로다 — **시그니처(파라미터 이름·타입·반환 타입)는 합의 없이 바꾸지 않는다.** 바꿔야 하면 이 문서와 호출부를 먼저 고치고 알린다.

## 왜 스텁 파일인가

README만으로 계약을 적으면 사람이 옮겨 적다가 오타가 나거나 최신화가 안 된다. `.py` 스텁은:
- **임포트가 실제로 된다** — 다른 모듈을 만드는 사람이 `from app.repo import complaint_repo`를 지금 당장 짜고 타입 체커로 검증할 수 있다.
- **시그니처가 곧 계약이다** — README의 표는 사람이 읽는 요약이고, 스텁이 컴파일 가능한 원본이다.

## 호출 방향 (위반하면 계층 규칙 위반)

```
api/routes  →  services  →  repo / session / llm
                  ↑
              schemas (양쪽 다 참조)   core (양쪽 다 참조)
```

## 모듈별 노출 함수 — 누가 무엇을 부르는가

### `repo/` — services만 호출한다. 모든 함수 첫 인자는 `conn`, 조회/변경계는 `school_id` 필수.

| 파일 | 함수 | 호출하는 쪽 |
|---|---|---|
| `school_repo.py` | `find_by_domain`, `list_all`, `verify_admin_code` | `auth_service` |
| `user_repo.py` | `create`, `find_by_email`, `get_password_hash`, `change_password`, `delete` | `auth_service` |
| `chat_session_repo.py` | `create`, `get_or_reuse_empty`, `list_by_user`, `get`, `require_owner`, `update_meta`, `mark_submitted`, `update_compacted` | `session_service` |
| `conversation_repo.py` | `add_turn`, `list_by_session`, `list_by_complaint`, `get_last_refined` | `session_service`, `complaint_service`(원문 조회) |
| `complaint_repo.py` | `create`, `list`, `get`, `get_stats`, `confirm`, `accept`, `resolve`, `hold`, `reject`, `withdraw` | `complaint_service` |
| `comment_repo.py` | `add`, `list`, `list_hold_reasons` | `complaint_service` |
| `bedrock_log_repo.py` | `add` | `session_service` |

### `session/` (Redis) — services만 호출한다. Redis 키 문자열은 이 폴더 밖에 등장하지 않는다.

| 파일 | 함수 | 호출하는 쪽 |
|---|---|---|
| `login_session.py` | `create`, `get`, `delete` | `auth_service`, `api/deps.py` |
| `turn_lock.py` | `acquire`, `release` | `session_service` |
| `compact_lock.py` | `acquire`, `release` | `session_service` |
| `chip_state.py` | `set_state`, `get_state` | `session_service` |

### `llm/` — `session_service`만 호출한다. `repo`를 절대 호출하지 않는다(school_id를 모름).

| 파일 | 함수/상수 | 호출하는 쪽 |
|---|---|---|
| `choices.py` | `CATEGORIES`, `DETAIL_CHIPS`, `merge_choices()` | `session_service` |
| `tools.py` | `ASK_FOLLOWUP`, `CLASSIFY_AND_REFINE` (스키마 dict) | `client.py` 내부에서만 |
| `client.py` | `refine(context, buffer) -> RefineResult`, `compact(prev_context, messages) -> CompactResult` | `session_service` |

### `services/` — `api/routes`만 호출한다. 판단·트랜잭션 경계는 전부 여기.

| 파일 | 함수 | 호출하는 쪽 |
|---|---|---|
| `auth_service.py` | `signup`, `login`, `logout`, `get_me`, `change_password`, `delete_account`, `verify_password` | `routes/auth.py` |
| `session_service.py` | `create_session`, `list_sessions`, `get_session`, `send_message`, `submit` | `routes/session.py` |
| `complaint_service.py` | `list_complaints`, `get_complaint`, `get_conversation`, `open_detail`, `accept`, `resolve`, `hold`, `reject`, `add_comment`, `withdraw`, `get_stats` | `routes/board.py`, `routes/admin.py` |

### `schemas/` — 모든 층이 참조 가능 (양방향 아님, 순수 데이터 타입이라 무해).

`api/routes`가 요청을 이 타입으로 파싱하고 응답을 이 타입으로 직렬화한다. `services`는 이 타입을 반환값으로 쓰거나, 내부적으로는 dict/dataclass를 쓰다가 라우터 경계에서 변환해도 된다 — **단, 어느 쪽이든 라우터가 반환하는 최종 응답은 반드시 `schemas/`의 타입과 일치해야 한다.**

### `core/` — 모든 층이 참조 가능.

- `config.py`의 `Settings`: 환경변수를 읽는 유일한 곳. 다른 모듈은 여기서 인스턴스를 import해서 쓴다 (`os.environ` 직접 접근 금지).
- `errors.py`의 도메인 예외들: `services/`가 던지고, FastAPI 예외 핸들러(`core/errors.py`에 등록)가 HTTP 응답으로 변환한다. `routes/`는 `try/except`를 쓰지 않는다 — 예외 핸들러가 전역으로 처리한다.

## 계약 위반 시나리오 (이래서 스텁이 필요하다)

- `repo/complaint_repo.py`를 만드는 사람이 `accept(id, school_id)`를 `accept(complaint_id, school_id, force=False)`로 바꾸면, 이미 짜여진 `services/complaint_service.py`의 호출부가 깨진다. **스텁 시그니처를 먼저 고치고 PR로 알린 뒤에만** 바꾼다.
- `llm/client.py`의 `RefineResult`가 `is_complete` 필드명을 바꾸면 `session_service.py`가 깨진다. `llm/types.py`의 dataclass가 정본이므로 거기만 고치면 타입 체커가 사용처를 다 잡아준다.

## 상세 스펙은 여기 없다

이 문서와 스텁은 **시그니처(계약)만** 다룬다. "왜 이렇게 설계했는지", "SQL 조건이 왜 `WHERE status=`인지" 같은 이유는:
- `.kiro/specs/complaint-assistant/design.md` — Correctness Properties, Components and Interfaces
- `docs/backend-design.md` — 흐름도, 트랜잭션 경계, Redis 키 수명
- `docs/api-contract.md` — HTTP 경계, 오류 코드, 프론트 시그니처

를 본다.
