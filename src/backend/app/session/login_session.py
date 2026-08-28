"""로그인 세션 (Redis 키: sess:{login_sid}).

호출하는 쪽: app/services/auth_service.py (create/delete), app/api/deps.py (get)
정본: docs/backend-design.md §6.2·§6.3.
"""
import json
import secrets

from app.core.config import get_settings
from app.session import get_redis

_KEY = "sess:{login_sid}"


def _key(login_sid: str) -> str:
    return _KEY.format(login_sid=login_sid)


def create(user_id: int, school_id: int, role: str) -> str:
    """새 로그인 세션을 만들고 세션 id(쿠키에 실을 값)를 반환한다.

    세션 id는 추측 불가능해야 한다 (secrets.token_urlsafe).
    값으로 {user_id, school_id, role}을 저장하고 TTL을 건다.
    이 셋이 이후 모든 요청의 권한·격리 범위를 정한다.
    """
    login_sid = secrets.token_urlsafe(32)
    payload = json.dumps({"user_id": user_id, "school_id": school_id, "role": role})
    ttl = get_settings().login_session_ttl_seconds
    get_redis().set(_key(login_sid), payload, ex=ttl)
    return login_sid


def get(login_sid: str) -> dict | None:
    """세션 조회 + TTL 연장(sliding).

    Returns:
        {"user_id": int, "school_id": int, "role": str} 또는 없으면 None.
        None이면 deps.current_user가 UnauthenticatedError(401)를 던진다.
    """
    if not login_sid:
        return None
    r = get_redis()
    k = _key(login_sid)
    raw = r.get(k)
    if raw is None:
        return None
    # sliding: 매 조회마다 TTL을 다시 건다.
    r.expire(k, get_settings().login_session_ttl_seconds)
    return json.loads(raw)


def delete(login_sid: str) -> None:
    """로그아웃·탈퇴 시 세션 삭제."""
    if login_sid:
        get_redis().delete(_key(login_sid))
