"""인증 라우트. 파싱 → auth_service 호출 → 직렬화만. 로직 없음.

정본: docs/api-contract.md #1~#7.
각 엔드포인트는 auth_service의 동명 함수를 부르고, 쿠키 설정만 라우터에서 한다.
try/except를 쓰지 않는다 — DomainError는 전역 핸들러가 처리.
"""
from fastapi import APIRouter, Cookie, Depends, Response, status

from app.api.deps import SESSION_COOKIE, CurrentUser, current_user
from app.core.config import get_settings
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    Me,
    SignupIn,
)
from app.services import auth_service
from app.session import login_session

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()


def _set_session_cookie(response: Response, sid: str) -> None:
    """로그인 세션 id를 HttpOnly 쿠키로 내려준다.
    HTTPS가 없으면 Secure를 못 달아 SameSite=Lax로 간다 (api-contract.md 0장).
    """
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sid,
        httponly=True,
        samesite="lax",
        max_age=_settings.login_session_ttl_seconds,
        path="/",
    )


# ── #2 회원가입 (가입 즉시 로그인) ────────────────────────────────
@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, response: Response):
    user_id, _role = auth_service.signup(body.email, body.password, body.admin_code)
    # 가입 즉시 로그인 — 방금 만든 계정으로 세션 생성
    sid = auth_service.login(body.email, body.password)
    _set_session_cookie(response, sid)
    return {"user_id": user_id}


# ── #3 로그인 ─────────────────────────────────────────────────────
@router.post("/login", response_model=Me)
def login(body: LoginIn, response: Response):
    sid = auth_service.login(body.email, body.password)
    _set_session_cookie(response, sid)
    # 방금 만든 세션에서 user_id를 꺼내 Me를 조립해 반환
    # (계약된 함수만 조합: login → login_session.get → get_me)
    session = login_session.get(sid)
    return auth_service.get_me(session["user_id"])


# ── #4 로그아웃 ───────────────────────────────────────────────────
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    sid: str | None = Cookie(default=None, alias=SESSION_COOKIE),
):
    if sid:
        auth_service.logout(sid)
    response.delete_cookie(SESSION_COOKIE, path="/")


# ── #5 내 정보 ────────────────────────────────────────────────────
@router.get("/me", response_model=Me)
def get_me(user: CurrentUser = Depends(current_user)):
    return auth_service.get_me(user.user_id)


# ── #6 비밀번호 변경 ──────────────────────────────────────────────
@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordIn, user: CurrentUser = Depends(current_user)):
    auth_service.change_password(user.user_id, body.current_password, body.new_password)


# ── #7 회원 탈퇴 ──────────────────────────────────────────────────
@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountIn,
    response: Response,
    user: CurrentUser = Depends(current_user),
):
    auth_service.delete_account(user.user_id, body.password)
    response.delete_cookie(SESSION_COOKIE, path="/")
