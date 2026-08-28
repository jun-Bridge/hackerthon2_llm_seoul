"""FastAPI 의존성 — 인증·역할·소유권. 라우터는 이걸 Depends로만 받는다.

정본: docs/backend-design.md §6.3.
"""
from dataclasses import dataclass

from fastapi import Cookie, Depends

from app.core.errors import ForbiddenRoleError, UnauthenticatedError
from app.session import login_session

# 쿠키 이름 — auth_service.login 이 Set-Cookie 할 때와 반드시 같아야 한다
SESSION_COOKIE = "sid"


@dataclass
class CurrentUser:
    user_id: int
    school_id: int
    role: str  # "student" | "admin"


def current_user(sid: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> CurrentUser:
    """쿠키의 세션 id → session.login_session.get → CurrentUser.
    없거나 만료면 UnauthenticatedError(401).
    """
    if not sid:
        raise UnauthenticatedError("로그인이 필요합니다.")

    data = login_session.get(sid)
    if data is None:
        raise UnauthenticatedError("로그인이 필요합니다.")

    return CurrentUser(
        user_id=data["user_id"],
        school_id=data["school_id"],
        role=data["role"],
    )


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """role != 'admin'이면 ForbiddenRoleError(403). 관리자 라우트에 Depends로 건다."""
    if user.role != "admin":
        raise ForbiddenRoleError("관리자 전용 기능입니다.")
    return user


def require_student(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """초안·작성 API용. 관리자가 부르면 ForbiddenRoleError(403) —
    민원을 넣는 것은 학생의 일이다 (한 계정이 두 역할을 겸하지 않는다).
    """
    if user.role != "student":
        raise ForbiddenRoleError("학생 전용 기능입니다.")
    return user
