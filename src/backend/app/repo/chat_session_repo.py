"""대화 세션(chat_sessions) CRUD. "과거 대화" 목록의 정본 저장소.

호출하는 쪍: app/services/session_service.py
정본: requirements.md 의 chat_sessions 스키마, backend-design.md §7.
"""


def create(conn, user_id: int, school_id: int) -> int:
    """새 세션 행을 만든다. title/context/complaint_id는 전부 NULL로 시작.

    주의: 호출 전에 get_or_reuse_empty로 재사용 가능한 빈 세션이 있는지
    먼저 확인하는 것은 이 함수의 책임이 아니라 session_service의 책임이다.
    """
    raise NotImplementedError


def get_or_reuse_empty(conn, user_id: int, school_id: int) -> int:
    """메시지가 하나도 없는 기존 세션이 있으면 그 id를 반환하고,
    없으면 새로 create()해서 반환한다. "새 대화" 연타로 빈 세션이
    쌓이는 것을 막는다 (requirements.md Requirement 2.1.1).
    """
    raise NotImplementedError


def list_by_user(conn, user_id: int) -> list[dict]:
    """사이드바 "과거 대화" 목록. 메시지가 하나도 없는 세션은 제외, 최신순.

    Returns:
        [{"id", "title", "category", "complaint_id", "withdrawn", "updated_at"}, ...]
        withdrawn은 연결된 complaint의 status='철회' 여부를 조인해서 계산한다
        (requirements.md Requirement 4.9의 "본인 과거 대화 목록에는 남는다" 참조).
    """
    raise NotImplementedError


def get(conn, session_id: int) -> dict | None:
    """단일 세션 메타 조회. 소유권 검사는 이 함수가 하지 않는다 — require_owner를 따로 부른다."""
    raise NotImplementedError


def require_owner(conn, session_id: int, user_id: int) -> dict:
    """세션을 조회하고 소유자가 user_id와 다르면 예외를 던진다.

    Raises:
        NotFoundError: 세션이 없거나 소유자가 다를 때 (404 — 403이 아니다,
        다른 사용자 세션의 존재 여부 자체를 노출하지 않기 위함.
        design.md Correctness Property #10 참조)

    Returns:
        get()과 동일한 dict. 검증과 조회를 한 번에 끝내려는 편의 함수.
    """
    raise NotImplementedError


def update_meta(conn, session_id: int, title: str | None = None, category: str | None = None) -> None:
    """제목/카테고리 갱신. is_manual_title=TRUE인 세션의 title은 이 함수를
    호출하는 쪽(session_service)이 스스로 걸러야 한다 — 이 함수는 무조건 덮어쓴다.
    """
    raise NotImplementedError


def mark_submitted(conn, session_id: int, complaint_id: int) -> None:
    """접수 완료 시 complaint_id를 채워 세션을 읽기 전용으로 만든다.
    services/session_service.py의 submit() 트랜잭션 중 한 단계로 호출된다 —
    이 함수 자체는 commit하지 않는다.
    """
    raise NotImplementedError


def update_compacted(conn, session_id: int, context: str, title: str | None, compacted_upto: int, expected_prev_upto: int | None) -> bool:
    """압축 결과 반영. WHERE compacted_upto = expected_prev_upto 조건을 반드시
    포함해야 한다 — 동시에 다른 압축이 먼저 끝났으면 이 갱신은 버려져야 한다
    (backend-design.md §7.4).

    Returns:
        갱신에 성공하면 True, 조건 불일치로 무시되면 False.
    """
    raise NotImplementedError
