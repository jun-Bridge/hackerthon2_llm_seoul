"""현재 단계·반복 횟수 캐시 (Redis 키: sess_state:{sid}).

호출하는 쪽: app/services/session_service.py
정본: docs/backend-design.md §7-1.5.

**이것은 캐시일 뿐이다.** 정본은 complaint_conversations.choices(DB)다.
만료되거나 Redis가 죽어도 칩이 사라지면 안 된다 — session_service가 캐시 미스 시
DB의 마지막 assistant 턴에서 choices를 다시 읽는다.

용도: 같은 missing 단계가 몇 번 반복됐는지 세기 (2회면 예시 덧붙임, 4회면 CONVERSATION_STUCK).
"""


def set_state(session_id: int, step: str, repeat_count: int) -> None:
    """현재 단계와 그 단계 반복 횟수를 저장. 턴마다 갱신."""
    raise NotImplementedError


def get_state(session_id: int) -> dict | None:
    """{"step": str, "repeat_count": int} 또는 없으면 None (캐시 미스 → DB 폴백)."""
    raise NotImplementedError


def bump_if_same(session_id: int, missing: str) -> int:
    """이번 missing이 직전과 같으면 repeat_count를 올리고, 다르면 1로 리셋한 뒤
    현재 반복 횟수를 반환한다. session_service가 이 값으로 stuck을 판정한다.
    """
    raise NotImplementedError
