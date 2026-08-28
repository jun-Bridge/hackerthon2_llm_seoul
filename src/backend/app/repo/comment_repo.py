"""관리자 코멘트(complaint_comments) CRUD. 누적 로그 — 추가만, 수정/삭제 없음.

호출하는 쪽: app/services/complaint_service.py
정본: requirements.md 의 complaint_comments 스키마.
"""
# list() 함수가 builtin list를 가린다. 어노테이션(list[dict])이 정의 시점에
# 평가되면 그 가려진 이름을 참조해 깨지므로, 어노테이션을 문자열로 지연 평가한다.
from __future__ import annotations


def add(
    conn, complaint_id: int, author_user_id: int, content: str, is_hold_reason: bool = False
) -> int:
    """코멘트를 추가한다.

    is_hold_reason=True: 보류 전환 시 필수로 남긴 사유. complaint_service.hold()가
                          상태 전환과 같은 트랜잭션에서 이 값으로 호출한다.
    is_hold_reason=False: 상태 무관 상시 코멘트 (add_comment 경로).

    Returns:
        새로 생성된 comment id.
    """
    row = conn.execute(
        """
        INSERT INTO complaint_comments (complaint_id, author_user_id, content, is_hold_reason)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (complaint_id, author_user_id, content, is_hold_reason),
    ).fetchone()
    return row["id"]


def list(conn, complaint_id: int) -> list[dict]:
    """그 민원의 코멘트 전체 (시간순). 관리자 상세 화면용.

    Returns:
        [{"id", "content", "is_hold_reason", "created_at"}, ...]
        author_user_id는 반환하지 않는다 — 화면에는 "관리자"로만 표시 (익명성 #4).
    """
    return conn.execute(
        """
        SELECT id, content, is_hold_reason, created_at
        FROM complaint_comments
        WHERE complaint_id = %s
        ORDER BY id
        """,
        (complaint_id,),
    ).fetchall()


def list_hold_reasons(conn, complaint_id: int) -> list[dict]:
    """is_hold_reason=True인 코멘트만. 학생 게시판 목록에서 보류 사유를 보여줄 때
    (requirements.md Requirement 3.6). 전부 실으면 목록 응답이 무거워지므로 이것만.
    """
    return conn.execute(
        """
        SELECT id, content, is_hold_reason, created_at
        FROM complaint_comments
        WHERE complaint_id = %s AND is_hold_reason = TRUE
        ORDER BY id
        """,
        (complaint_id,),
    ).fetchall()
