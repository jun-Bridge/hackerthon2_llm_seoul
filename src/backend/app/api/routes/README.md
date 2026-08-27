# api/routes/ — HTTP 엔드포인트

요청 파싱 → `services/` 호출 → 응답 직렬화. **그 외 로직 금지.**

구현 예정
- `health.py` — `GET /health` (프로세스·DB·Redis·LLM 엔드포인트 도달 여부)
- `chat.py` — `POST /chat` 대화 전송, `GET /chat/{id}/stream` SSE 토큰 스트리밍
- `documents.py` — 문서 CRUD, 버전 목록 조회·복원
- `canvas.py` — 선택 영역 재작성 요청 (원문 + 선택 범위 + 지시 → 새 버전)

의존성 주입은 `core/deps.py`의 `Depends`로 받는다. 라우트가 세션·클라이언트를 직접 만들지 않는다.
