"""FastAPI 의존성 — 인증·역할·소유권. 라우터는 이걸 Depends로만 받는다.

정본: docs/backend-design.md §6.3.
"""
from dataclasses import dataclass


@dataclass
class CurrentUser:
    user_id: int
    school_id: int
    role: str  # "student" | "admin"


def current_user() -> CurrentUser:
    """쿠키의 세션 id → session.login_session.get → CurrentUser.
    없거나 만료면 UnauthenticatedError(401).

    FastAPI에서는 Request/Cookie를 인자로 받는 형태로 구현한다:
        def current_user(sid: str = Cookie(None)) -> CurrentUser: ...
    """
    raise NotImplementedError


def require_admin(user: CurrentUser) -> CurrentUser:
    """role != 'admin'이면 ForbiddenRoleError(403). 관리자 라우트에 Depends로 건다.
        def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser: ...
    """
    raise NotImplementedError


def require_student(user: CurrentUser) -> CurrentUser:
    """초안·작성 API용. 관리자가 부르면 ForbiddenRoleError(403) —
    민원을 넣는 것은 학생의 일이다 (한 계정이 두 역할을 겸하지 않는다).
    """
    raise NotImplementedError
