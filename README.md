# 다듬이 (UniVoice) — 학교별 익명 캠퍼스 민원 서비스

학생이 캠퍼스 시설 불편을 **말하듯 적으면** AI가 되물어 정보를 채우고 행정 문서로 다듬는다.
학생이 확인하고 접수하면 **같은 학교 학생에게만** 익명으로 공개되고, 관리자가 상태를 처리한다.

```
학생: "화장실에 문제가 있어요"
  AI: "어느 건물 몇 층인가요?"        ← 정보가 부족하면 되묻는다
학생: "본관 3층 남자화장실 세면대 누수"
  AI: [위생/배관] 본관 3층 남자화장실 세면대 배수 불량 조치 요청
      현상 … 영향 … 요청 …            ← 확정안. 학생이 접수를 눌러야 올라간다
```

## 무엇으로 만들었나

| 층 | 선택 |
|---|---|
| 웹 서버 | FastAPI + uvicorn, **8501 포트**, 워커 2개. 정적 프론트도 같은 서버가 서빙 |
| 프론트 | React 19 + Vite (JavaScript) |
| 영속 저장 | PostgreSQL |
| 휘발 저장 | Redis — 로그인 세션, 턴/압축 잠금 |
| LLM | AWS Bedrock `global.anthropic.claude-sonnet-5` (리전 `ap-northeast-2`, 도구 호출) |
| 배포 | EC2 단일 인스턴스, systemd `univoice` |

프론트를 같은 서버가 서빙하므로 **CORS가 없다.**

## 설계에서 물러서지 않는 것 다섯

1. **학교가 데이터 격리의 경계다.** 모든 조회·변경에 세션의 `school_id`가 붙는다. 다른 학교 것은 존재 여부도 알 수 없다(404). 프론트는 학교를 보내지 않는다.
2. **민원은 익명이다.** 작성자 id는 어떤 응답에도 실리지 않는다. "내 글"은 서버가 계산한 `is_mine` 불린 하나로만 내려간다.
3. **AI는 되묻는다.** 도구 둘(`ask_followup`·`classify_and_refine`)을 주고 `tool_choice=any`로 매 턴 하나를 반드시 부르게 한다. **어느 것을 불렀는지가 곧 "정보가 부족한가"의 답이다.** 카테고리는 enum 8종으로 강제해 오분류 자체를 막는다.
4. **상태 전이는 DB가 판정한다.** `UPDATE … WHERE status = <선행상태>` 한 문장이다. 워커가 여럿이라 조회 후 판정하면 두 관리자가 동시에 눌렀을 때 둘 다 통과한다.
5. **상태를 프로세스 메모리에 두지 않는다.** 세션은 Redis, 확정 데이터는 PostgreSQL. 어느 워커가 받든 결과가 같아야 한다.

## 상태 흐름

```
미확인 ──[관리자가 상세를 연다 — 버튼이 아니라 열람의 부작용]──> 확인
                                                              │
                        ┌─────────────────┬───────────────────┤
                     [수락]            [보류·사유 필수]     [거절·사유 필수]
                        ↓                 ↓                   ↓
                     처리중              보류                거절(최종)
                        └────[해결 완료]──┘
                                 ↓
                             해결완료(최종)

학생은 어느 상태에서든 본인 글을 철회할 수 있다 (비밀번호 확인 3단계).
```

## 디렉토리

```
├─ .kiro/specs/complaint-assistant/   ★ 정본 — 요구사항·설계·태스크
├─ docs/                              계약·설계·운영 문서 (docs/README.md가 지도)
├─ connectionTest/                    대회에서 받은 예시 코드 + EC2 접속 키. 제품 코드 아님
├─ resource/                          이미지·샘플 원본. 빌드 산출물에 포함되지 않는다
└─ src/
   ├─ backend/                        FastAPI
   │  ├─ app/
   │  │  ├─ api/routes/               HTTP 엔드포인트 (얇게 — 로직 금지)
   │  │  ├─ services/                 판단이 사는 곳 (전이·트랜잭션 경계·검증)
   │  │  ├─ repo/                     SQL만. school_id 격리를 강제하는 유일한 계층
   │  │  ├─ session/                  Redis만. 키 문자열이 이 폴더 밖에 없다
   │  │  ├─ llm/                      Bedrock만. repo를 부르지 않는다
   │  │  ├─ schemas/  core/           계약 타입 · 설정/예외
   │  │  └─ main.py                   라우터 등록 → /health → 정적 mount (순서 중요)
   │  ├─ init_db.py  seed_schools.py  스키마 생성 · 학교/도메인/관리자코드 시드
   │  └─ tests/                       unit(41) · integration(실 DB 있으면 자동 실행)
   └─ frontend/                       React + Vite
      ├─ public/                      로고·페르소나·지도 이미지 (그대로 복사됨)
      └─ src/{api,components,pages,store,styles}/
```

**계층 규칙**: `routes → services → repo/session/llm`. 역방향·같은 층끼리 호출 금지.
SQL은 `repo/`에만, Redis 키는 `session/`에만, Bedrock은 `llm/`에만 둔다.

## 실행

```bash
# 1) 데이터스토어
docker compose -f docker/compose.dev.yml up -d postgres redis

# 2) 스키마 + 시드 (둘 다 재실행 안전)
cd src/backend
python init_db.py && python seed_schools.py

# 3) 서버 — 워커가 하나면 LLM 호출 중 다른 요청이 전부 막힌다
uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4

# 4) 프론트 (개발 중에만. 배포는 빌드 산출물을 백엔드가 서빙)
cd src/frontend && npm install && npm run dev
```

`.env`는 `.env.example`을 복사해 채운다. **정의되지 않은 키를 넣으면 앱이 기동 즉시 죽는다**
(pydantic `extra_forbidden`). 허용 키는 `DATABASE_URL`·`REDIS_URL`·`LLM_MODEL_ID`·`PORT` 넷.
AWS 자격증명·리전은 넣지 않는다 — EC2 인스턴스 프로파일이 처리하고 리전은 코드에 고정돼 있다.

상태 확인: `curl localhost:8501/health` → `{"status":"ok","db":true,"redis":true,"bedrock":true}`
(한 계층이 죽어도 200 + `degraded`로 응답해 어디가 문제인지 보인다.)

## 문서 어디를 보나

| 궁금한 것 | 문서 |
|---|---|
| 무엇을 왜 만드나 (정본) | `.kiro/specs/complaint-assistant/requirements.md` |
| 설계 근거·불변식 | `.kiro/specs/complaint-assistant/design.md` |
| **프론트↔백 HTTP 계약** | `docs/api-contract.md` |
| 백엔드 내부 구조·흐름 | `docs/backend-design.md` |
| 배포·재배포 절차 | `docs/aws-deployment.md`, `docs/claude_handover.md` |
| 결정과 그 이유 (append-only) | `docs/dev-log.md` |

전체 지도는 `docs/README.md`. **`docs/requirements_v1.md`·`proposal_v1.md`와
`docs/anonymous_complain_assistant*.html`은 동결된 이전 버전이라 상태값이 다르다** — 그대로 옮기면 어긋난다.
