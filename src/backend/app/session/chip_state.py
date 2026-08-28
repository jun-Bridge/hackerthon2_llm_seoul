"""현재 단계·반복 횟수 캐시 (Redis 키: sess_state:{sid}).

호출하는 쪽: app/services/session_service.py
정본: docs/backend-design.md §7-1.5.

**이것은 캐시일 뿐이다.** 정본은 complaint_conversations.choices(DB)다.
만료되거나 Redis가 죽어도 칩이 사라지면 안 된다 — session_service가 캐시 미스 시
DB의 마지막 assistant 턴에서 choices를 다시 읽는다.

용도: 같은 missing 단계가 몇 번 반복됐는지 세기 (2회면 예시 덧붙임, 4회면 CONVERSATION_STUCK).
"""
import json

from app.core.config import get_settings
from app.session import get_redis

_KEY = "sess_state:{sid}"


def _key(session_id: int) -> str:
    return _KEY.format(sid=session_id)


def _ttl() -> int:
    # 칩 캐시는 짧게 산다 — 정본은 DB이므로 여유 있게 턴 락과 같은 수명을 쓴다.
    # 대화가 이어지는 동안 유지되도록 압축 락 TTL(조금 더 긴 값)을 재사용한다.
    return get_settings().compact_lock_ttl_seconds


def set_state(session_id: int, step: str, repeat_count: int) -> None:
    """현재 단계와 그 단계 반복 횟수를 저장. 턴마다 갱신."""
    payload = json.dumps({"step": step, "repeat_count": repeat_count})
    get_redis().set(_key(session_id), payload, ex=_ttl())


def get_state(session_id: int) -> dict | None:
    """{"step": str, "repeat_count": int} 또는 없으면 None (캐시 미스 → DB 폴백)."""
    raw = get_redis().get(_key(session_id))
    if raw is None:
        return None
    return json.loads(raw)


def bump_if_same(session_id: int, missing: str) -> int:
    """이번 missing이 직전과 같으면 repeat_count를 올리고, 다르면 1로 리셋한 뒤
    현재 반복 횟수를 반환한다. session_service가 이 값으로 stuck을 판정한다.
    """
    state = get_state(session_id)
    if state is not None and state.get("step") == missing:
        count = int(state.get("repeat_count", 0)) + 1
    else:
        count = 1
    set_state(session_id, missing, count)
    return count
