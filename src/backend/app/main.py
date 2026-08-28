"""FastAPI 진입점. 라우터 등록 → 정적 프론트 mount (순서 중요) → 예외 핸들러 등록.

실행: uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4
(src/backend 를 작업 디렉토리로 두거나 PYTHONPATH에 넣는다 — 임포트가 app.* 로 시작하므로)

정본: docs/backend-design.md §2, api-contract.md 6장.
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, auth, board, schools, session
from app.core.errors import register_exception_handlers

app = FastAPI(title="UniVoice")

# 1) API 라우터를 정적 파일보다 **먼저** 등록한다.
#    순서가 바뀌면 /api/... 가 StaticFiles 핸들러에 먹힌다.
app.include_router(schools.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(board.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

# 2) 도메인 예외 → {"error": {"code","message"}} 전역 변환
register_exception_handlers(app)

# 3) 정적 프론트를 마지막에 mount (같은 서버가 서빙 → CORS 없음).
#    SPA 라우팅을 쓰면 catch-all fallback이나 해시 라우팅 중 하나를 골라야 한다
#    (docs/backend-design.md §2, dev-log "SPA 라우팅 fallback" 참조).
# app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")


@app.get("/health")
def health():
    """프로세스·DB·Redis·Bedrock 도달 여부. 구현 시 각 계층 ping 결과를 반환."""
    raise NotImplementedError
