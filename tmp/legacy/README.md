# legacy/ — 구버전 백엔드 구현 (보존용)

## 무엇인가

팀원이 `origin/main`(커밋 `1cbed03` "feat: FastAPI 백엔드 인프라 구축")에 올렸던 **실제 동작하는 백엔드 구현 1500줄**이다. 스텁이 아니라 로직이 채워진 코드다.

## 왜 여기로 옮겼나

이 구현은 **구버전 문서(`api-contract.md`가 22개 함수 + `draft_key` 방식이던 시절)** 기준으로 작성됐다. 그 뒤 정본(`.kiro/specs/complaint-assistant/` + `docs/backend-design.md`)이 여러 라운드 갱신되면서 구조가 달라졌다. 팀원 구현을 지우지 않고 여기 보존하는 이유는 **살릴 수 있는 실동작 로직이 많기 때문**이다 — 특히 Bedrock 호출, 보안(bcrypt·세션), 시드는 정본 구조에 거의 그대로 이식할 수 있다.

## 정본과 무엇이 다른가 (이식할 때 주의)

| 항목 | 이 legacy 구현 | 현재 정본 (`src/backend/app/`) |
|---|---|---|
| 대화 세션 | `draft_key`(UUID)로만 묶음. `chat_sessions` 테이블 없음 | `chat_sessions` 테이블 + `chat_session_id` FK. 과거 대화 목록·제목·압축 맥락 지원 |
| 대화 소유권 | `draft_key`만 알면 남의 대화 읽힘 | `chat_sessions.user_id`로 검증 |
| 맥락 압축 | 없음 (대화 통째로 LLM에 넣음) | `context`·`compacted_upto` 누적 압축 |
| 관리자 코드 | `schools.admin_code` 단일 컬럼 | `admin_codes` 별도 테이블 (학교당 여러 개) |
| 학교 별칭 | 없음 | `schools.aliases[]` (검색용) |
| `refined_json` | `Text` (문자열 파싱) | `JSONB` (`->>'category'` 직접 조회) |
| 계층 | route가 SQLAlchemy 직접 사용 (repo 계층 없음) | `repo/`가 `school_id` 필터 강제 |
| 경로 | `/api/drafts/{draft_key}` | `/api/chat-sessions/{sid}` |

## 이식하면 좋은 것 (정본과 안 부딪힘)

- `app/llm/bedrock_client.py`, `app/llm/prompts.py` — Bedrock 실제 호출 로직. 정본 `llm/client.py` 채울 때 참고.
- `app/core/security.py` — bcrypt·세션 처리.
- `app/db/seed.py` — 시드 스크립트 (단, `admin_code` 단일 컬럼 → `admin_codes` 테이블로 바꿔야 함).
- `app/schemas/*.py` — Pydantic 타입 (draft → session 개념 차이만 반영).

## 다시 만들어야 하는 것 (구조가 달라 그대로 못 씀)

- `draft.py` route 전체 → 정본은 `chat_sessions` 기반 `session.py`.
- `db/models.py`의 `ComplaintConversation` → `chat_session_id` FK 추가 필요.
- `schools.admin_code` → `admin_codes` 테이블.

## 이 폴더는 임시다

`tmp/`는 작업용 임시 폴더다. 이식이 끝나면 이 폴더는 지워도 된다 (git 히스토리 `1cbed03`에 원본이 남아 있으므로 언제든 복구 가능).
