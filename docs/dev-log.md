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
