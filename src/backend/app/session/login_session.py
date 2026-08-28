"""로그인 세션 (Redis 키: sess:{login_sid}).

호출하는 쪽: app/services/auth_service.py (create/delete), app/api/deps.py (get)
정본: docs/backend-design.md §6.2·§6.3.
"""


def create(user_id: int, school_id: int, role: str) -> str:
    """새 로그인 세션을 만들고 세션 id(쿠키에 실을 값)를 반환한다.

    세션 id는 추측 불가능해야 한다 (secrets.token_urlsafe 등).
    값으로 {user_id, school_id, role}을 저장하고 TTL을 건다.
    이 셋이 이후 모든 요청의 권한·격리 범위를 정한다.
    """
    raise NotImplementedError


def get(login_sid: str) -> dict | None:
    """세션 조회 + TTL 연장(sliding).

    Returns:
        {"user_id": int, "school_id": int, "role": str} 또는 없으면 None.
        None이면 deps.current_user가 UnauthenticatedError(401)를 던진다.
    """
    raise NotImplementedError


def delete(login_sid: str) -> None:
    """로그아웃·탈퇴 시 세션 삭제."""
    raise NotImplementedError
