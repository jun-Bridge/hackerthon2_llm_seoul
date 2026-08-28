# src/backend/ — UniVoice FastAPI 서버

학교별 익명 캠퍼스 민원 서비스의 백엔드. FastAPI + PostgreSQL + Redis + AWS Bedrock.

## 실행

```bash
# 작업 디렉토리를 src/backend 로 두거나 PYTHONPATH에 넣는다 (임포트가 app.* 로 시작).
cd src/backend
uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4
```

테스트: `pytest tests/`

## 어디를 먼저 읽나

1. **`app/README.md`** — 계층 규칙, 폴더별 책임
2. **`app/INTERFACES.md`** — 모듈 간 호출 계약 (누가 무엇을 부르는가)
3. **`.kiro/specs/complaint-assistant/`** — 기능 요구사항·설계·태스크 (정본)
4. **`docs/backend-design.md`** — 백엔드 내부 상세 (흐름도, 트랜잭션 경계)
5. **`docs/api-contract.md`** — HTTP 경계 (프론트와 공유하는 계약)

## 계층 (위→아래 단방향, 역참조 금지)

```
api/routes  →  services  →  repo / session / llm
                  ↑
              schemas (계약 타입)   core (설정·예외)
```

- `api/routes/` — 파싱 → `Depends`로 사용자 꺼내기 → 서비스 호출 → 직렬화. 로직 없음.
- `services/` — 판단이 사는 곳 (상태 전이, 트랜잭션 경계, 검증).
- `repo/` — SQL만. `school_id` 격리를 강제하는 유일한 계층.
- `session/` — Redis만. 로그인 세션·잠금·캐시.
- `llm/` — Bedrock만. `repo`를 부르지 않는다.
- `schemas/` — Pydantic 계약 타입 (프론트 `api-contract.md`와 짝).
- `core/` — 설정(`config.py`)·도메인 예외(`errors.py`).

## 팀 분담 (폴더 단위로 나눠 작업)

각 폴더는 `INTERFACES.md`의 시그니처만 지키면 독립적으로 구현·테스트할 수 있다.
스텁 파일(`raise NotImplementedError`)이 이미 시그니처를 박아뒀으므로, 담당자는
그 함수 본문만 채우면 된다. **시그니처를 바꿔야 하면 `INTERFACES.md`와 스텁을 먼저
고치고 알린다** — 다른 사람의 호출부가 깨지기 때문.

| 담당 영역 | 폴더 | 선행 지식 |
|---|---|---|
| 계정·인증 | `repo/{school,user}_repo.py`, `session/login_session.py`, `services/auth_service.py`, `api/routes/{auth,schools}.py` | bcrypt, Redis, 도메인 매칭 규칙 |
| AI 대화 | `llm/*`, `session/{turn_lock,compact_lock,chip_state}.py`, `services/session_service.py`, `api/routes/session.py` | Bedrock 도구 호출, 세션 컨테이너 압축 |
| 민원·게시판·관리자 | `repo/{complaint,comment,conversation,bedrock_log}_repo.py`, `services/complaint_service.py`, `api/routes/{board,admin}.py` | 상태 전이 규칙, 학교 격리 |
| 공통 | `core/*`, `schemas/*`, `repo/pool.py`, `app/main.py`, `init_db.py` | FastAPI 배선, PostgreSQL 스키마 |

`schemas/`와 `core/errors.py`는 다른 모두가 의존하므로 **가장 먼저 확정한다** (이미 스텁으로 채워져 있음 — 필드 추가는 합의 후).

## 작업 순서

`tasks.md`의 의존성 그래프를 따른다. 큰 흐름:

1. **M0** — `llm/client.py`로 Bedrock 도구 호출 실측 (`connectionTest/bedrock_simple_test.py` 기반). 이게 안 되면 전체 방향을 틀어야 하므로 제일 먼저.
2. **M1** — 계정·학교 (`repo` 계정 + `auth_service` + `deps`).
3. **M2** — 대화 (`llm` + `session_service` + 세션 컨테이너).
4. **M3~M4** — 접수·게시판·관리자 (`complaint_service` + `board`/`admin` 라우트).

## tests/

- `unit/` — 서비스 로직·전이 규칙. `llm`은 가짜 구현, `repo`는 인메모리/가짜로 대체.
- `integration/` — 실제 PostgreSQL·Redis 붙는 경로. `design.md`의 Correctness Properties를 테스트로 옮긴 것이 여기 들어간다 (상태 전이, 학교 격리, 익명성).
