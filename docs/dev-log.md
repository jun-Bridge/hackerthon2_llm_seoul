# Dev Log — hackerthon2_llm_1
_append-only. 과거 항목은 수정하지 않는다._

## [2026-08-27] bootstrap | polaris
프로젝트 스캐폴드 생성(docs/·.gitignore·.env.example·git init).
기존에 빈 `src/`·`docs/`·`resource/` 폴더만 있던 상태에서 시작.
requirements.md 초안 작성 시작 — 슬롯 전부 TBD.

## [2026-08-27] 스택 확정 · 디렉토리 골격
- 스택: FastAPI(백) + React/Vite/TS(프론트) 분리. LLM은 로컬 Ollama. 배포는 Vercel/클라우드.
- `src/backend/`(app/api·core·llm·schemas·services + tests), `src/frontend/`(src/api·components·hooks·pages·styles) 골격 생성. 빈 디렉토리는 `.gitkeep`.
- README.md에 레이아웃·경계 규약 기록.
- **미해소 충돌 발견**: 로컬 Ollama와 Vercel 배포는 양립 불가(서버리스에 상주 추론 프로세스 불가). requirements 슬롯 9에 선택지 (a)(b)(c)로 기록, 사용자 결정 대기.
- 목적·유스케이스는 사용자 요청으로 공란 유지 → 수용기준 도출 보류.

## [2026-08-27] 스택 재확정 (AWS·Docker·Postgres·Redis·gpt-oss-120b) · 캔버스 기능 추가
- 앞 항목의 "Ollama + Vercel"은 폐기. 확정 스택:
  프론트 React(Vite/TS, Figma 시안) · 백 FastAPI(Python) · AI 로컬 gpt-oss-120b · DB PostgreSQL + Redis · 컨테이너 Docker · 클라우드 AWS.
- 이로써 앞서 기록한 Ollama↔Vercel 충돌은 해소(GPU 있는 자체 호스팅 = 선택지 (a)).
- **레포 경계 확정**: 이 폴더는 **개발 + git 연동만**. AWS 연동·배포·업로드는 **Kiro IDE**에서 별도 처리 → `infra/` 디렉토리 생성했다가 제거, requirements 슬롯 3 Out of scope에 명시.
- 디렉토리 추가: `app/db/{models,repositories}`, `app/cache`, `alembic/versions`, `tests/{unit,integration}`,
  `frontend/src/components/{chat,canvas,common}`, `docker/`.
- 규약 추가: services는 repositories를 통해서만 DB 접근(ORM 모델 누출 금지).
- **미해소**: 캔버스 기능의 실제 동작 정의(편집형/정리형/화이트보드형) — DB 스키마와 프론트 구조를 가르는 갈림길이라 빌드 전 확정 필요. 슬롯 9 기록.
- git remote origin 등록: https://github.com/jun-Bridge/hackerthon2_llm_seoul (push는 미실행 — 사용자 승인 대기).

## [2026-08-27] DB 레이아웃 결정 · 캔버스 정의 확정
- **DB 배치**: `src/db/`로 빼자는 안을 검토했으나 기각. Redis·Postgres 접근 코드는 백엔드가 import하는 파이썬 모듈이라, 백엔드 패키지 트리 밖으로 나가면 별도 패키지 설치(pyproject·editable install)와 Dockerfile 컨텍스트 확장이 따라붙는다 — 배포 단위가 하나인데 소스만 갈라지는 비용. 대신 **`app/db/postgres/`·`app/db/redis/`로 엔진별 독립 모듈화**해 의도한 분리는 그대로 얻었다.
  - 규약: 두 모듈은 서로 import하지 않는다. 함께 쓰는 조합은 `services/`.
  - `app/cache/`는 폐기(→ `app/db/redis/`로 흡수). 캐시도 DB 계층의 한 엔진으로 본다.
- **캔버스 정의 확정: 편집형**(ChatGPT/Claude Canvas형). LLM 생성 문서를 옆 패널에서 사람이 편집 + 선택 영역만 재요청.
  → Postgres 스키마에 문서·버전이 필요. 프론트에 `components/canvas/{editor,revision}` 분리.
  → 파생 미정: 문서 포맷(md/richtext), 버전 보관 정책(스냅샷 vs diff), 동시 편집 여부.

## [2026-08-27] 구조 재검토 (서비스 목표 대조) · 폴더별 문서화 · 브랜치 main
- 브랜치 `master` → `main` 개명 (원격 GitHub 기본값에 맞춤). `gh` CLI는 이 머신에 없음.
- **구조를 목표(채팅 + 편집형 캔버스 + 스트리밍 + PG/Redis)에 대고 재검토 → 구멍 4개 발견, 추가:**
  1. `app/llm/prompts/` — 편집형 캔버스는 "선택 영역 재작성" 프롬프트가 핵심 자산이다. 서비스 코드에 문자열로 박히면 문구 수정이 로직 변경이 된다.
  2. `frontend/src/store/` — 대화와 캔버스가 상태를 공유한다("문서로 만들기" → 캔버스 열림). prop drilling으로는 안 된다.
  3. `frontend/src/types/` — 백엔드 `schemas/`와 짝. 없으면 컴포넌트마다 응답 모양을 추측한다.
  4. `frontend/src/assets/` — Figma 익스포트 원본(`resource/`)과 번들 에셋을 분리.
- **폴더별 `README.md` 28개 작성.** 각 폴더가 무엇을 구현할지 + 지켜야 할 경계 규칙. 루트 README 트리는 지도, 폴더 README가 계약.
- requirements 슬롯 6(데이터·계약) 초안 기입: conversation/message, document/document_version, HTTP API 목록, LLM 인터페이스.
- **핵심 규칙 확정**: 문서 편집은 항상 새 버전을 만든다. 복원도 새 버전. 원본 불변 — 백엔드(`canvas_service`)와 프론트(`canvas/`) 양쪽 README에 동일하게 명시.
- 새로 드러난 미정: 인증·사용자 모델(문서 소유자 식별), 문서 본문 포맷, 버전 보관 정책(스냅샷 vs diff).
- git remote를 HTTPS → SSH(`git@github.com:jun-Bridge/hackerthon2_llm_seoul.git`)로 변경. 이 머신에 자격증명 헬퍼가 없어 HTTPS push가 막혔고, `~/.ssh/id_ed25519`가 이미 jun-Bridge로 인증됨. `main` push 완료.

## [2026-08-27] 요구사항 1차 정리 (브레인스토밍 받아적기)
- **서비스 정의**: 대화하며 LLM과 문서를 만드는 웹 툴. LLM은 문서를 **소유하지 않고 함수(tool call)로 읽고 쓴다.** 사용자가 자유롭게 편집해도 LLM이 항상 최신을 읽는다는 것이 이 설계의 요점.
- **쳐낸 것**: 카카오 연동, 팀 기능, 사용자 맞춤·성향 추론, 테마, 이미지, 세션 간 크로스 참조. "오직 툴" 방향.
- **블록 id 채택**: LLM이 문자 offset으로 위치를 가리키면 사용자가 그 사이 편집한 순간 어긋난다. 안정적 블록 id로 가리켜야 자유 편집과 LLM 수정이 공존한다.
- **편집 잠금(세마포어)**: LLM 쓰기 도구 호출 시 문서를 잠그고 프론트는 블러 + 입력 차단. 턴 종료 시 해제. 실패·연결 끊김에도 영구 잠기지 않도록 타임아웃 필수 — 이걸 수용기준에 넣었다.
- **TA(TravelArchive, `NAS/1_TravelArchive_Dev`)는 참고만.** 코드 이식 아님. `chat_session_container.py`(214줄) 동작만 확인:
  요청마다 Redis에서 복원하는 비상주 컨테이너 · 최근 버퍼 + `context` 요약 문자열 · 버퍼가 차면 absorb LLM이 title/context 재생성 후 버퍼 비움 · `is_manual_title`로 수동 제목 보호 · redis 없으면 in-memory 임시 세션.
  - **가져올 개념**: 위 동작 원리.
  - **버릴 것**: 성향 추론(`personalization_topic`), 위젯 상태, 여행 도메인 라우팅, TA의 `kernel/`·`router/`·`widget/`·`memory/` 일체.
  - **결정적 차이**: TA는 widget_state를 컨테이너가 소유해 프롬프트에 주입. 우리는 문서를 소유하지 않고 tool로 읽는다 → 컨테이너 상태가 stale해지지 않는다.
- 수용기준을 M0~M4 마일스톤으로 분해, 전부 테스트·수치로 판정 가능하게 작성.
