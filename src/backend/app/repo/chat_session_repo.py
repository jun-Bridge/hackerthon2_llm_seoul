"""대화 세션(chat_sessions) CRUD. "과거 대화" 목록의 정본 저장소.

호출하는 쪽: app/services/session_service.py
정본: requirements.md 의 chat_sessions 스키마, backend-design.md §7.
"""


def create(conn, user_id: int, school_id: int) -> int:
    """새 세션 행을 만든다. title/context/complaint_id는 전부 NULL로 시작.

    주의: 호출 전에 get_or_reuse_empty로 재사용 가능한 빈 세션이 있는지
    먼저 확인하는 것은 이 함수의 책임이 아니라 session_service의 책임이다.
    """
    row = conn.execute(
        "INSERT INTO chat_sessions (user_id, school_id) VALUES (%s, %s) RETURNING id",
        (user_id, school_id),
    ).fetchone()
    return row["id"]


def get_or_reuse_empty(conn, user_id: int, school_id: int) -> int:
    """메시지가 하나도 없는 기존 세션이 있으면 그 id를 반환하고,
    없으면 새로 create()해서 반환한다. "새 대화" 연타로 빈 세션이
    쌓이는 것을 막는다 (requirements.md Requirement 2.1.1).

    "빈 세션"의 정의: 접수 안 됨(complaint_id IS NULL)이고 대화 행이 없는 것.
    """
    row = conn.execute(
        """
        SELECT s.id
        FROM chat_sessions s
        WHERE s.user_id = %s
          AND s.complaint_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM complaint_conversations c
              WHERE c.chat_session_id = s.id
          )
        ORDER BY s.updated_at DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    if row is not None:
        return row["id"]
    return create(conn, user_id, school_id)


def list_by_user(conn, user_id: int) -> list[dict]:
    """사이드바 "과거 대화" 목록. 메시지가 하나도 없는 세션은 제외, 최신순.

    Returns:
        [{"id", "title", "category", "complaint_id", "withdrawn", "updated_at"}, ...]
        withdrawn은 연결된 complaint의 status='철회' 여부를 조인해서 계산한다
        (requirements.md Requirement 4.9의 "본인 과거 대화 목록에는 남는다" 참조).
    """
    return conn.execute(
        """
        SELECT s.id,
               s.title,
               s.category,
               s.complaint_id,
               s.updated_at,
               COALESCE(cp.status = '철회', FALSE) AS withdrawn
        FROM chat_sessions s
        LEFT JOIN complaints cp ON cp.id = s.complaint_id
        WHERE s.user_id = %s
          AND EXISTS (
              SELECT 1 FROM complaint_conversations c
              WHERE c.chat_session_id = s.id
          )
        ORDER BY s.updated_at DESC
        """,
        (user_id,),
    ).fetchall()


def get(conn, session_id: int) -> dict | None:
    """단일 세션 메타 조회. 소유권 검사는 이 함수가 하지 않는다 — require_owner를 따로 부른다."""
    return conn.execute(
        """
        SELECT id, user_id, school_id, title, is_manual_title, context,
               compacted_upto, category, complaint_id, created_at, updated_at
        FROM chat_sessions
        WHERE id = %s
        """,
        (session_id,),
    ).fetchone()


def require_owner(conn, session_id: int, user_id: int) -> dict:
    """세션을 조회하고 소유자가 user_id와 다르면 예외를 던진다.

    Raises:
        NotFoundError: 세션이 없거나 소유자가 다를 때 (404 — 403이 아니다,
        다른 사용자 세션의 존재 여부 자체를 노출하지 않기 위함.
        design.md Correctness Property #10 참조)

    Returns:
        get()과 동일한 dict. 검증과 조회를 한 번에 끝내려는 편의 함수.
    """
    from app.core.errors import NotFoundError

    row = get(conn, session_id)
    if row is None or row["user_id"] != user_id:
        raise NotFoundError("세션을 찾을 수 없습니다.")
    return row


def update_meta(
    conn, session_id: int, title: str | None = None, category: str | None = None
) -> None:
    """제목/카테고리 갱신. is_manual_title=TRUE인 세션의 title은 이 함수를
    호출하는 쪽(session_service)이 스스로 걸러야 한다 — 이 함수는 무조건 덮어쓴다.

    None으로 주어진 필드는 건드리지 않는다 (COALESCE 아니라 조건부 갱신).
    updated_at은 항상 갱신한다 (목록 정렬 최신화).
    """
    sets = ["updated_at = NOW()"]
    params: list = []
    if title is not None:
        sets.append("title = %s")
        params.append(title)
    if category is not None:
        sets.append("category = %s")
        params.append(category)
    params.append(session_id)
    conn.execute(
        f"UPDATE chat_sessions SET {', '.join(sets)} WHERE id = %s",
        tuple(params),
    )


def mark_submitted(conn, session_id: int, complaint_id: int) -> None:
    """접수 완료 시 complaint_id를 채워 세션을 읽기 전용으로 만든다.
    services/session_service.py의 submit() 트랜잭션 중 한 단계로 호출된다 —
    이 함수 자체는 commit하지 않는다.
    """
    conn.execute(
        "UPDATE chat_sessions SET complaint_id = %s, updated_at = NOW() WHERE id = %s",
        (complaint_id, session_id),
    )


def update_compacted(
    conn,
    session_id: int,
    context: str,
    title: str | None,
    compacted_upto: int,
    expected_prev_upto: int | None,
) -> bool:
    """압축 결과 반영. WHERE compacted_upto = expected_prev_upto 조건을 반드시
    포함해야 한다 — 동시에 다른 압축이 먼저 끝났으면 이 갱신은 버려져야 한다
    (backend-design.md §7.4).

    Returns:
        갱신에 성공하면 True, 조건 불일치로 무시되면 False.
    """
    # NULL 비교는 = 로 안 되므로 IS NOT DISTINCT FROM 을 쓴다
    # (첫 압축이면 expected_prev_upto가 NULL일 수 있다).
    result = conn.execute(
        """
        UPDATE chat_sessions
        SET context = %s, title = %s, compacted_upto = %s, updated_at = NOW()
        WHERE id = %s
          AND compacted_upto IS NOT DISTINCT FROM %s
        """,
        (context, title, compacted_upto, session_id, expected_prev_upto),
    )
    return result.rowcount > 0
