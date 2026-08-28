"""압축 중복 방지 잠금 (Redis 키: compact:{sid}).

호출하는 쪽: app/services/session_service.py (백그라운드 압축)
정본: docs/backend-design.md §7.4.

압축과 다음 턴이 동시에 compacted_upto를 옮기면 구간이 겹치거나 빈다.
turn_lock과 별도 잠금인 이유: 압축이 대화를 막지 않게 하기 위함.
"""
from app.core.config import get_settings
from app.session import get_redis

_KEY = "compact:{sid}"


def _key(session_id: int) -> str:
    return _KEY.format(sid=session_id)


def acquire(session_id: int) -> bool:
    """SET NX로 압축 잠금 시도. 이미 압축 중이면 False (이번 압축은 건너뛴다)."""
    ttl = get_settings().compact_lock_ttl_seconds
    return bool(get_redis().set(_key(session_id), "1", nx=True, ex=ttl))


def release(session_id: int) -> None:
    get_redis().delete(_key(session_id))
