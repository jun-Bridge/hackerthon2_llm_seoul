# 팀원 B 로드맵 — 데이터 계층 (repo + session + DB 스크립트)

## 담당 범위

```
init_db.py                     스키마 생성 (requirements.md PostgreSQL Schema 정본)
seed_schools.py                학교·도메인·별칭·관리자 코드 시드
app/repo/pool.py               커넥션 풀 + 트랜잭션 컨텍스트
app/repo/school_repo.py        도메인 매칭·관리자 코드
app/repo/user_repo.py          계정 CRUD
app/repo/chat_session_repo.py  대화 세션·압축 경계
app/repo/conversation_repo.py  대화 행·refined_json
app/repo/complaint_repo.py     민원 CRUD + 상태 전이
app/repo/comment_repo.py       코멘트
app/repo/bedrock_log_repo.py   호출 로그
app/session/login_session.py   로그인 세션 (Redis)
app/session/turn_lock.py       턴 잠금
app/session/compact_lock.py    압축 잠금
app/session/chip_state.py      단계 캐시
```

## 다른 팀원과의 접점 (계약)

- **A(core)에 의존**: `core/config.py`의 `get_settings()`(DB/Redis URL), `core/errors.py`의
  `NotFoundError`(require_owner에서 던짐). 둘 다 이미 스텁으로 채워져 있어 **A를 기다릴 필요 없다.**
- **C(services)가 B를 호출**: C의 `session_service`·`complaint_service`가 B의 repo/session 함수를
  부른다. **시그니처를 바꾸면 C가 깨진다** — `app/INTERFACES.md`를 먼저 고치고 알린다.
- **스키마 정본은 requirements.md**. `init_db.py`는 그걸 그대로 옮긴다. legacy(`tmp/legacy/app/db/models.py`)는
  `draft_key` 방식이라 `chat_sessions`·`admin_codes`·`aliases`가 없다 — **참고만 하고 정본을 따른다.**

## 기술 선택

- **psycopg 3** (`psycopg[binary,pool]`) — 정본이 `psycopg_pool.ConnectionPool`을 가정.
  SQLAlchemy ORM이 아니라 **raw SQL**로 간다 (repo 계층이 SQL을 직접 쥔다는 설계).
- **redis-py** (`redis`) — 동기 클라이언트. `SET NX EX`로 잠금.
- 파라미터 바인딩은 `%s` (psycopg 스타일). f-string으로 값을 넣지 않는다 (SQL 인젝션).

## 단계별 로드맵

### 단계 1 — 기반: 스키마 + 커넥션 (제일 먼저)
가장 아래 계층. 이게 돌아야 나머지 repo를 테스트할 수 있다.
1. `init_db.py` — requirements.md의 7테이블 + bedrock_logs DDL을 실행. 재실행 안전(`IF NOT EXISTS`).
2. `app/repo/pool.py` — `get_pool()`(psycopg_pool), `transaction()`(with 컨텍스트, commit/rollback).
3. `seed_schools.py` — 학교 2개+ (도메인·별칭·admin_codes). `ON CONFLICT`로 재실행 안전.

**완료 기준**: `python init_db.py && python seed_schools.py`가 에러 없이 돌고, psql로 테이블·시드 확인.

### 단계 2 — 계정·학교 repo (A의 auth_service가 기다림)
A가 M1을 시작하려면 이게 필요하다. **B의 최우선 산출물.**
4. `school_repo.py` — `find_by_domain`, `list_all`(별칭 포함), `verify_admin_code`.
5. `user_repo.py` — `create`(email UNIQUE 위반은 그대로 던짐), `find_by_email`, `get_password_hash`,
   `change_password`, `delete`(FK SET NULL은 DB가 처리).

**완료 기준**: 단위 테스트 — 시드된 학교를 도메인으로 찾고, 계정 생성 후 이메일로 조회.

### 단계 3 — Redis 세션·잠금 (A·C가 기다림)
6. `session/login_session.py` — `create`(token_urlsafe id), `get`(+sliding TTL), `delete`.
7. `session/turn_lock.py`, `compact_lock.py` — `SET NX EX` 원자 잠금.
8. `session/chip_state.py` — `set_state`, `get_state`, `bump_if_same`(같은 단계 반복 횟수).

**완료 기준**: Redis에 세션 넣고 get이 TTL 연장하는지, 잠금이 두 번째 acquire에서 False인지 확인.

### 단계 4 — 대화·민원 repo (C의 핵심 로직이 기다림)
9. `chat_session_repo.py` — create, get_or_reuse_empty, list_by_user(withdrawn 조인),
   get, require_owner(NotFoundError), update_meta, mark_submitted,
   update_compacted(`WHERE compacted_upto=expected`).
10. `conversation_repo.py` — add_turn(choices/refined_json은 JSONB), list_by_session,
    list_by_complaint, get_last_refined, link_to_complaint.
11. `complaint_repo.py` — create, list(철회 제외), get, get_stats(GROUP BY),
    상태전이 6종(`confirm/accept/resolve/hold/reject`는 `UPDATE...WHERE status=<전제>`,
    `withdraw`는 `WHERE submitted_by_user_id`).
12. `comment_repo.py` — add, list, list_hold_reasons.
13. `bedrock_log_repo.py` — add, list_recent.

**완료 기준**: 상태전이 함수가 전제 상태 불일치 시 False(0행)를 반환하는지 — design.md
Correctness Property #2·#8 테스트로 검증.

## 반드시 지킬 불변식 (design.md에서 B가 책임지는 것)

| # | 불변식 | B의 구현 방식 |
|---|---|---|
| 1 | 학교 격리 | 모든 complaint 조회·전이 SQL에 `WHERE school_id=%s` |
| 2 | 상태 전이 원자성 | `UPDATE ... WHERE status=<전제>` 한 문장, rowcount로 성패 |
| 3 | 보류 원자성 | (C가 트랜잭션으로 묶음) B는 `hold`·`comment_repo.add`를 각각 commit하지 않고 conn만 받음 |
| 6 | 철회 가시성 | list/get에 `status != '철회'` 내장 |
| 7 | 확인 멱등 | `confirm`은 `WHERE status='미확인'` — 재호출 시 0행이어도 정상 |
| 8 | 처리중 필수 경유 | `resolve`는 `WHERE status='처리중'` |

## 커밋 단위

각 단계 끝에 커밋. 예: `feat(repo): 스키마 초기화 + 커넥션 풀`, `feat(repo): 계정·학교 repo`,
`feat(session): Redis 로그인·잠금`, `feat(repo): 대화·민원 repo + 상태전이`.
push 전 `git fetch`로 A·C가 올린 게 있는지 확인 (B는 자기 폴더만 만지므로 충돌 거의 없음).

---

## 진행 현황 (2026-08-28)

**모든 스텁이 실동작으로 채워졌다.** 시그니처는 `INTERFACES.md` 계약 그대로 유지 —
A·C 호출부가 깨지지 않는다.

### 구현 완료

| 단계 | 파일 | 기술 |
|---|---|---|
| 1 | `init_db.py` | requirements.md 정본 스키마 8테이블 + 인덱스, `IF NOT EXISTS`로 재실행 안전 |
| 1 | `app/repo/pool.py` | psycopg3 `ConnectionPool`(dict_row), `transaction()` 컨텍스트, `close_pool()` |
| 1 | `seed_schools.py` | 학교 3곳 + admin_codes. `ON CONFLICT(email_domain)`로 재실행 안전 |
| 2 | `school_repo.py` | `find_by_domain` / `list_all`(별칭) / `verify_admin_code` |
| 2 | `user_repo.py` | `create`(UNIQUE 위반 전파) / `find_by_email` / `get_password_hash` / `change_password` / `delete` |
| 3 | `session/__init__.py` | 프로세스 공용 Redis 클라이언트(`get_redis`, decode_responses) |
| 3 | `login_session.py` | `token_urlsafe(32)` id, `get`에서 sliding TTL 연장 |
| 3 | `turn_lock.py`·`compact_lock.py` | `SET NX EX` 원자 잠금 |
| 3 | `chip_state.py` | `set_state`/`get_state`/`bump_if_same`(연속 반복 카운트) |
| 4 | `chat_session_repo.py` | `get_or_reuse_empty`, `list_by_user`(철회 조인), `require_owner`(NotFoundError), `update_compacted`(`IS NOT DISTINCT FROM` 가드) |
| 4 | `conversation_repo.py` | `add_turn`(JSONB Jsonb 래핑), 세션/민원 두 경로 조회, `get_last_refined`, `link_to_complaint` |
| 4 | `complaint_repo.py` | `create`/`list`/`get`/`get_stats` + 상태전이 6종(`UPDATE...WHERE status=<전제>`) |
| 4 | `comment_repo.py` | `add`/`list`/`list_hold_reasons` |
| 4 | `bedrock_log_repo.py` | `add`/`list_recent`(school_id 스코프) |

### 검증

- `python -m pytest tests/unit` — **21 passed.** (`test_repo_sql.py`: 상태전이 전제·철회 제외·JSONB 래핑·압축 가드 검증. `test_session_redis.py`: fakeredis로 세션·잠금·칩 카운트 검증.)
- `tests/integration/test_repo_db.py` — 실 PostgreSQL 연동 시 불변식 #1·#2·#6·#8을 판정. **DB 미도달 시 자동 skip**(conftest).
- 백엔드 의존성은 `src/backend/requirements.txt`에 추가(psycopg3, redis, bcrypt, boto3, fastapi…).
- 루트 `.env.example`을 `Settings` 필드(`DATABASE_URL`·`REDIS_URL`·`LLM_MODEL_ID`)에 맞게 갱신.

### 남은 것 (환경 의존)

- **실 PostgreSQL·Redis에서 최종 확인**: `cd src/backend && python init_db.py && python seed_schools.py`
  후 psql로 테이블·시드 확인, `pytest tests/integration` 실행. (현재 개발 머신에 두 서버가 안 떠 있어
  단위 테스트로 로직만 검증한 상태 — 서버가 붙으면 integration이 자동으로 돈다.)
