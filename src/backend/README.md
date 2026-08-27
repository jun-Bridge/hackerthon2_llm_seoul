# src/backend/ — FastAPI 서버

실행: `uvicorn app.main:app --reload --port 8080`
테스트: `pytest tests/`

구현 예정 (루트)
- `app/main.py` — FastAPI 인스턴스, 라우터 등록, 미들웨어·수명주기(DB/Redis 커넥션) 배선
- `pyproject.toml` / `requirements.txt` — 의존성
- `alembic.ini` — 마이그레이션 설정

계층 규칙 (위→아래 단방향, 역방향 import 금지)
```
api/routes  →  services  →  db/{postgres,redis} · llm
                  ↑
              schemas (계약), core (설정)
```
- 라우트에 비즈니스 로직을 두지 않는다.
- 서비스는 ORM 모델을 밖으로 내보내지 않는다 — 응답은 항상 `schemas/`의 Pydantic 타입.
