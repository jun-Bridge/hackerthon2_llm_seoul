"""
다듬이 백엔드 — FastAPI 진입점
실행: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import create_tables
from app.db.seed import seed_schools
from app.api.routes import auth, draft, board, admin

app = FastAPI(
    title="다듬이 API",
    description="익명 캠퍼스 시설물 컴플레인 도우미",
    version="0.1.0",
)

# CORS — 프론트엔드 주소 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router)
app.include_router(draft.router)
app.include_router(board.router)
app.include_router(admin.router)


@app.on_event("startup")
def on_startup():
    """서버 시작 시 테이블 생성 + 초기 데이터 삽입."""
    create_tables()
    seed_schools()


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
