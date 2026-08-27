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
