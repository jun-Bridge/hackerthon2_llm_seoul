# tests/

- `unit/` — 외부 의존 없음. 서비스 로직, 프롬프트 조립, 스키마 검증. LLM은 `llm/fake.py`, DB는 fake repository.
- `integration/` — 실제 붙는 경로. FastAPI `TestClient` + docker compose로 띄운 postgres·redis. 마이그레이션이 실제로 도는지 포함.

TDD: 태스크마다 실패 테스트 먼저 → 통과 최소 구현.
