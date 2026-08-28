"""턴 중복 방지 잠금 (Redis 키: turn:{sid}:running).

호출하는 쪽: app/services/session_service.py
정본: docs/backend-design.md §7-1.3.

응답이 오기 전에 학생이 또 보내면 Bedrock 호출이 둘 다 돌고 대화 순서가 꼬인다.
send_message는 acquire로 잠그고 finally에서 반드시 release한다.
"""
from app.core.config import get_settings
from app.session import get_redis

_KEY = "turn:{sid}:running"


def _key(session_id: int) -> str:
    return _KEY.format(sid=session_id)


def acquire(session_id: int) -> bool:
    """SET NX로 잠금 시도. 이미 잠겨 있으면 False (→ TurnInProgressError 409).

    `SET turn:{sid}:running 1 NX EX <ttl>` 한 번의 원자 연산.
    GET 후 SET로 나누면 두 워커가 동시에 통과한다.
    ex로 만료를 줘서 워커가 죽어도 잠금이 영원히 남지 않게 한다.
    """
    ttl = get_settings().turn_lock_ttl_seconds
    # nx=True, ex=ttl → 없을 때만 세팅. 성공하면 True, 이미 있으면 None.
    return bool(get_redis().set(_key(session_id), "1", nx=True, ex=ttl))


def release(session_id: int) -> None:
    """잠금 해제. send_message의 finally에서 호출 — 실패로 끝나도 반드시."""
    get_redis().delete(_key(session_id))
