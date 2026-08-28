"""FastAPI 진입점. 라우터 등록 → 정적 프론트 mount (순서 중요) → 예외 핸들러 등록.

실행(개발): uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 2
(실배포는 systemd 유닛 `univoice`가 같은 명령을 --workers 2로 실행한다 — docs/aws-deployment.md)
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


@app.get("/health")
def health():
    """프로세스·DB·Redis·Bedrock 도달 여부를 반환한다.

    한 계층이 죽어도 서버는 200으로 뜨고 해당 필드만 false가 된다.
    (requirements_v1 §6.5: "LLM이 죽어 있어도 서버는 뜨고 /health가 그 사실을 알려준다")
    """
    from app.repo.pool import ping as db_ping
    from app.session import ping as redis_ping

    # Bedrock: list_foundation_models로 실제 도달 확인 (비용 0, 모델 호출 아님).
    # 실패(자격증명·네트워크·권한)는 삼켜 false로 — 서버는 계속 200으로 뜬다.
    try:
        import boto3
        boto3.client("bedrock", region_name="ap-northeast-2").list_foundation_models()
        bedrock_ok = True
    except Exception:
        bedrock_ok = False

    db_ok = db_ping()
    redis_ok = redis_ping()

    return {
        "status": "ok" if (db_ok and redis_ok and bedrock_ok) else "degraded",
        "db": db_ok,
        "redis": redis_ok,
        "bedrock": bedrock_ok,
    }


# 3) 정적 프론트를 **맨 마지막에** mount (같은 서버가 8501에서 서빙 → CORS 없음).
#    /api/* 라우터와 /health 를 위에서 먼저 등록했으므로 그 경로는 이 catch-all에 안 먹힌다.
#    frontend/dist 가 있을 때만 mount (백엔드만 띄우는 개발 환경에서 죽지 않게).
import os  # noqa: E402

_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
    # html=True → SPA 진입점(index.html) 서빙. 없는 경로는 index.html로 폴백.
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="static")
