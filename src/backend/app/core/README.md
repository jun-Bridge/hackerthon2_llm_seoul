# core/ — 설정·횡단 관심사

구현 예정
- `config.py` — pydantic-settings로 `.env` 로딩. **환경변수 읽는 곳은 여기 한 곳.** 다른 모듈은 `settings`를 import한다.
- `deps.py` — FastAPI `Depends` 제공자. DB 세션, Redis 클라이언트, 서비스 인스턴스 주입.
- `logging.py` — 구조화 로깅 설정, request id 부착
- `errors.py` — 도메인 예외 → HTTP 응답 매핑 (예외 핸들러 등록)
- `middleware.py` — CORS, request id, 요청 로깅

시크릿은 `.env`만. 코드에 값을 적지 않는다.
