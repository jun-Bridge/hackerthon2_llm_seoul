# app/ — UniVoice 백엔드

FastAPI + PostgreSQL + Redis. 워커 여러 개가 `:8501`에 뜨고 정적 프론트도 같은 서버가 서빙한다.

## 정본 문서 (여기 코드를 쓰기 전에 읽는다)

| 무엇이 궁금한가 | 어디를 본다 |
|---|---|
| 기능 요구사항, User Story, DB 스키마 | `.kiro/specs/complaint-assistant/requirements.md` |
| 시스템 설계, 상태 전이 규칙, 불변식 | `.kiro/specs/complaint-assistant/design.md` |
| 태스크 분해, 의존성 순서 | `.kiro/specs/complaint-assistant/tasks.md` |
| HTTP API 계약 (프론트가 보는 문서) | `docs/api-contract.md` |
| 백엔드 내부 모듈 상세, 흐름도 | `docs/backend-design.md` |

**이 README들의 관계**: `requirements.md`가 "무엇을" 정의하고, `design.md`가 "왜 이렇게" 설계했는지 불변식으로 못박는다. `docs/backend-design.md`는 그걸 실제 함수 시그니처·SQL·흐름도로 풀어낸 것이다. **코드를 쓰기 전에 backend-design.md의 해당 절을 먼저 읽는다** — 여기 각 폴더 README는 그 절로 안내하는 지도일 뿐, 상세 스펙을 다시 적지 않는다.

## 계층 규칙 (절대 어기지 않는다)

```
api/routes  →  services  →  repo / session / llm
                  ↑
              schemas (계약 타입)   core (설정·예외)
```

| 규칙 | 어기면 무슨 일이 생기나 |
|---|---|
| 라우터는 파싱 → `Depends`로 사용자 꺼내기 → 서비스 호출 → 직렬화만 한다 | 로직이 라우터에 있으면 테스트하려고 HTTP 서버를 띄워야 한다 |
| `repo`는 `services`를 부르지 않는다 | 순환 import, 트랜잭션 경계 불명확 |
| 같은 층끼리 부르지 않는다 (`llm` ↛ `repo`) | `llm`은 `school_id`를 모른다 — 그건 요청 맥락의 값이다 |
| SQL은 `repo/`에만 있다 | `school_id` 필터를 강제할 곳이 한 곳이어야 새지 않는다 |
| Redis 키 문자열은 `session/`에만 있다 | 키 이름이 흩어지면 지울 때 하나를 빠뜨린다 |
| Bedrock 호출은 `llm/`에만 있다 | 모델 교체가 이 폴더 안에서 끝나야 한다 |

이 규칙은 import 그래프 테스트로 강제하는 게 이상적이다 (`tests/test_layering.py` 같은 것 — 아직 없으면 M1 완료 후 추가 검토).

## 디렉토리

| 폴더 | 책임 | 상세 |
|---|---|---|
| `api/` | HTTP 엔드포인트 + 인증/인가 의존성 | `api/README.md` |
| `schemas/` | Pydantic 요청·응답 타입 (API 계약) | `schemas/README.md` |
| `services/` | 판단이 사는 곳 — 상태 전이, 트랜잭션 경계, 검증 | `services/README.md` |
| `repo/` | SQL이 사는 곳 — `school_id` 격리를 강제하는 유일한 계층 | `repo/README.md` |
| `session/` | Redis가 사는 곳 — 로그인 세션, 턴/압축 잠금 | `session/README.md` |
| `llm/` | Bedrock이 사는 곳 — 도구 정의, 호출, 파싱 | `llm/README.md` |
| `core/` | 설정, 예외 → HTTP 매핑, 로깅 | `core/README.md` |

## 실행

```bash
# 1. 데이터스토어 (docker/compose.dev.yml 참고)
docker compose -f docker/compose.dev.yml up -d postgres redis

# 2. 스키마 + 시드
python init_db.py
python seed_schools.py

# 3. 서버 (워커 여러 개 — 워커 하나면 LLM 호출 중 다른 요청이 막힌다)
uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4
```

## 작업 순서 (tasks.md의 M0~M4를 그대로 따른다)

1. `llm/` 먼저 — Bedrock 도구 호출이 실제로 되는지 실측 (`tasks.md` #1, #8)
2. `repo/` + `session/` — 계정·학교 (M1)
3. `services/session_service.py` — 대화 왕복 (M2)
4. `services/complaint_service.py` — 접수·상태 전이 (M3~M4)
5. `api/routes/` — 위 서비스들을 엔드포인트로 노출

**태스크 번호와 폴더가 1:1로 안 맞을 수 있다.** `tasks.md`의 `_Requirements: N.N_` 참조를 따라가면 이 폴더 어디에 해당하는지 알 수 있다.
