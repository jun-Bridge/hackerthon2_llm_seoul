"""인증 라우트. 파싱 → auth_service 호출 → 직렬화만. 로직 없음.

정본: docs/api-contract.md #1~#7.
각 엔드포인트는 auth_service의 동명 함수를 부르고, 쿠키 설정만 라우터에서 한다.
try/except를 쓰지 않는다 — DomainError는 전역 핸들러가 처리.
"""
from fastapi import APIRouter, Cookie, Depends, Response, status

from app.api.deps import SESSION_COOKIE, CurrentUser, current_user
from app.core.config import get_settings
from app.schemas.auth import (
    AdminCodeIn,
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    Me,
    SignupIn,
    SignupOut,
    VerifyIn,
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
@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=SignupOut)
def signup(body: SignupIn, response: Response):
    user_id, role = auth_service.signup(body.email, body.password, body.admin_code)
    # 가입 즉시 로그인 — 방금 만든 계정으로 세션 생성
    sid = auth_service.login(body.email, body.password)
    _set_session_cookie(response, sid)
    # role까지 함께 내려준다 (api-contract #2: { user_id, role }).
    return SignupOut(user_id=user_id, role=role)


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


# ── #7-1 비밀번호 확인만 (철회·탈퇴 1단계) ───────────────────────
# ── 교직원 인증 (가입 후 학생 → 관리자 승격) ──────────────────────
@router.post("/admin-code", response_model=Me)
def submit_admin_code(
    body: AdminCodeIn,
    response: Response,
    user: CurrentUser = Depends(current_user),
    sid: str | None = Cookie(default=None, alias=SESSION_COOKIE),
):
    """관리자 코드를 대조해 역할을 admin으로 올린다. 틀리면 400 INVALID_ADMIN_CODE.

    역할은 Redis 세션에도 박혀 있어서(권한 판정을 매 요청 DB 조회 없이 하려고)
    DB만 바꾸면 다음 요청이 여전히 student로 판정된다. 그래서 **세션을 새로 발급**하고
    쿠키를 갈아끼운다. 옛 세션은 지운다 — 남겨두면 낡은 role이 살아 있게 된다.
    """
    school_id = auth_service.promote_with_admin_code(user.user_id, body.admin_code)
    if sid:
        login_session.delete(sid)
    new_sid = login_session.create(user.user_id, school_id, "admin")
    _set_session_cookie(response, new_sid)
    return auth_service.get_me(user.user_id)


@router.post("/verify-password", status_code=status.HTTP_204_NO_CONTENT)
def verify_password(body: VerifyIn, user: CurrentUser = Depends(current_user)):
    """되돌릴 수 없는 동작 전 본인 확인만 한다. 아무것도 바꾸지 않는다.
    불일치면 auth_service가 WrongPasswordError(401) → 전역 핸들러가 WRONG_PASSWORD.
    """
    auth_service.verify_password(user.user_id, body.password)
