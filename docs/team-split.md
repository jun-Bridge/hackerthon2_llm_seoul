# 팀 작업 분배 — 디렉토리(계층) 단위

> **상태(2026-08-29): 아래 분담대로 진행해 백엔드는 전 계층 구현이 끝났다.**
> 지금 이 문서는 "누가 무엇을 소유하는가"의 기록으로 읽는다. 스텁은 남아 있지 않다.
>
> **프론트에는 이런 경계가 없어서 사고가 났다** — 같은 파일(`ChatModal.jsx`)을 두 사람이
> 각자 다시 쓰는 바람에 머지마다 한쪽이 통째로 사라졌다.
> 경위는 `docs/postmortem-frontend-integration.md`.

3명이 `app/` 아래 디렉토리를 나눠 맡았다. **시그니처를 바꿔야 하면
`app/INTERFACES.md`와 스텁을 먼저 고치고 나머지 두 명에게 알린다.**

## 한눈에

```
app/
├─ api/        ┐
├─ schemas/    ┼─ A (경계 계층: 밖과 맞닿는 전부)
├─ core/       │
├─ main.py     ┘
├─ services/auth_service.py  ← A (auth route와 짝이라 A가 가져간다)
│
├─ repo/       ┐
├─ session/    ┼─ B (데이터 계층: PostgreSQL + Redis)
├─ (init_db.py, seed_schools.py) ┘
│
├─ llm/                       ┐
└─ services/{session,complaint}_service.py  ┼─ C (AI + 핵심 로직)
```

| | 담당 디렉토리 / 파일 | 한 줄 요약 |
|---|---|---|
| **A** | `app/api/`, `app/schemas/`, `app/core/`, `app/main.py`, `app/services/auth_service.py`, `src/frontend/src/api/` | HTTP 경계·계약 타입·설정·인증 |
| **B** | `app/repo/`, `app/session/`, `init_db.py`, `seed_schools.py` | DB·Redis·스키마 |
| **C** | `app/llm/`, `app/services/session_service.py`, `app/services/complaint_service.py` | Bedrock·대화·상태전이 로직 |

## 팀원 A — 경계 계층

**담당**
```
app/api/deps.py                    current_user / require_admin / require_student
app/api/routes/*.py                auth, schools, session, board, admin (5개, 전부 얇음)
app/main.py                        라우터 등록 → 정적 mount → 예외 핸들러
app/schemas/*.py                   common, auth, session, complaint (계약 타입)
app/core/config.py, core/errors.py 환경변수·도메인 예외 15종
app/services/auth_service.py       가입·로그인·비밀번호·탈퇴
src/frontend/src/api/*.js          프론트 클라이언트 (계약의 반대쪽 끝)
```

**왜 A가 이걸 다 맡나**: `schemas`·`core/errors`·`deps`는 B·C가 자기 것을 짤 때 import한다.
A가 이 셋을 **제일 먼저 실동작으로 확정**해야 나머지가 붙는다. 라우터 5개는 파싱→서비스 호출→
직렬화뿐이라 개수가 많아도 가볍다. `auth_service`는 auth 라우트와 짝이라 A가 함께 가져간다.

**참고 legacy**: `tmp/legacy/app/core/security.py`(bcrypt·세션), `tmp/legacy/app/core/deps.py`,
`tmp/legacy/app/schemas/*`

**정본**: requirements.md Requirement 1, backend-design.md §1·§2·§6, api-contract.md(경계 전체)

**먼저 끝내야 할 것 (Day 0~1)**: `schemas/*`, `core/errors.py`, `core/config.py`, `api/deps.py`.
이게 없으면 B·C가 시작 못 한다.

## 팀원 B — 데이터 계층

**담당**
```
app/repo/pool.py                   커넥션 풀 + 트랜잭션 컨텍스트
app/repo/school_repo.py            도메인 매칭·관리자 코드 검증
app/repo/user_repo.py              계정 CRUD
app/repo/chat_session_repo.py      과거 대화 세션·압축 경계
app/repo/conversation_repo.py      대화 행·refined_json 조회
app/repo/complaint_repo.py         민원 CRUD + 상태전이 UPDATE...WHERE
app/repo/comment_repo.py           코멘트
app/repo/bedrock_log_repo.py       호출 로그
app/session/login_session.py       로그인 세션 (Redis)
app/session/turn_lock.py           턴 중복 잠금 (SET NX)
app/session/compact_lock.py        압축 잠금
app/session/chip_state.py          단계·반복 캐시
init_db.py                         스키마 생성 (requirements.md PostgreSQL Schema 그대로)
seed_schools.py                    학교·도메인·별칭·관리자 코드 시드
```

**왜 한 사람이 DB 전부**: `school_id` 격리와 상태전이 `UPDATE...WHERE`는 이 계층에서만 강제된다.
스키마 정합성(FK ON DELETE 방식, CHECK 제약)을 한 사람이 쥐어야 안 깨진다. Redis 키 문자열도
`session/` 밖에 안 나오게 B가 관리한다.

**참고 legacy**: `tmp/legacy/app/db/models.py`(단, `chat_sessions` 테이블·`admin_codes` 테이블·
`aliases`가 빠져 있으니 정본 스키마로 보강), `tmp/legacy/app/db/seed.py`

**정본**: requirements.md Data Model(스키마 정본), design.md Correctness Properties #1·#2·#6,
backend-design.md §3·§4·§7-2

**주의**: legacy는 `draft_key` 단일 방식이라 `chat_sessions`가 없다. 정본은 `chat_session_id` FK가
필요하다 — legacy 모델을 그대로 쓰지 말고 requirements.md 스키마를 정본으로 삼는다.

## 팀원 C — AI + 핵심 로직

**담당**
```
app/llm/types.py                   RefineResult / CompactResult / Usage (session_service와 계약)
app/llm/tools.py                   ask_followup / classify_and_refine 스키마
app/llm/choices.py                 CATEGORIES / DETAIL_CHIPS / merge_choices
app/llm/prompts.py                 시스템·압축 프롬프트
app/llm/client.py                  Bedrock 호출·파싱 (리전 미지정, global. 프로필, tool_choice=any)
app/services/session_service.py    대화 왕복 8단계·턴잠금·칩병합·압축·접수 트랜잭션 (제일 복잡)
app/services/complaint_service.py  상태전이 래핑·철회·코멘트·게시판/관리자 조회
```

**왜 C가 llm+로직**: `services`는 repo(B)·session(B)·llm(C)을 조립하는 자리다. C가 A의 schemas와
B의 repo 함수를 불러 로직을 완성한다. **M0의 Bedrock 실측(tasks #1)을 C가 제일 먼저** 해야
전체 방향이 확정되므로, C는 Day 0에 `connectionTest/bedrock_simple_test.py`부터 돌려본다.

**참고 legacy**: `tmp/legacy/app/llm/bedrock_client.py`·`prompts.py`(Bedrock 호출 로직 상당수 재활용),
`tmp/legacy/app/api/routes/draft.py`(대화 흐름 참고 — 단 draft_key→chat_session 구조로)

**정본**: requirements.md Requirement 2·2.1·3·4, design.md Correctness Properties 전체,
backend-design.md §7·§7-1·§8

## 의존 순서

```
Day 0
  A: schemas / core / deps 확정  ─┐
  B: repo·session 스텁 채우기 시작 ├─ 병렬
  C: Bedrock 실측 (M0)           ─┘

Day 1~
  B: repo·session 완성 ───┐
  A: schemas·deps 완성  ──┼──→ C: services 조립 ──→ A: routes 연결 → 통합
                          │        (B·A의 함수를 import)
```

## 충돌 관리

디렉토리로 갈랐으므로 같은 파일을 두 명이 만지는 경우가 거의 없다. 예외:

| 파일 | 소유 | 규칙 |
|---|---|---|
| `app/main.py` | A | 라우터 등록은 A가. B·C는 여기 안 건드림 |
| `app/services/` | auth=A, session·complaint=C | 파일이 분리돼 있어 충돌 안 남 |
| `app/INTERFACES.md`, `app/schemas/*`, `app/core/errors.py` | A가 관리 | 필드·시그니처 추가는 **PR로 알린 뒤** |

**공통 규칙**: 계약(시그니처·타입·오류코드)을 바꿀 때는 조용히 바꾸지 않는다. `INTERFACES.md`를
먼저 고치고 두 명에게 알린다 — 안 그러면 남의 호출부가 소리 없이 깨진다.

## 부하 메모

디렉토리 분할은 C(llm+services)에 로직이 몰리는 구조다. `session_service.py`가 특히 무거우니,
C가 벅차면 `complaint_service.py`를 A로 넘기는 것을 고려한다(complaint route와 짝이라 자연스럽다).
반대로 A의 라우터는 얇아서 여유가 있다.

## 프론트

`src/frontend/src/api/`(client + auth/session/board/admin)는 A가 백엔드 계약과 함께 관리한다.
화면(컴포넌트)을 3명이 나눠 만든다면 자기 슬라이스에 맞춰:
- A → 로그인·가입 화면
- C → 학생 작성 챗봇 (session API 사용)
- C 또는 별도 → 게시판·관리자 대시보드 (board·admin API 사용)

화면은 백엔드가 어느 정도 돈 뒤(스텁이 실동작으로 바뀐 뒤) 붙이는 게 효율적이다.
