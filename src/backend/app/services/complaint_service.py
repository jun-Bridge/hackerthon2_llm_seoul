"""민원 조회·상태 전이·철회·코멘트. 상태 전이 판정이 여기 산다.

호출하는 쪽: app/api/routes/board.py (학생), app/api/routes/admin.py (관리자)
호출하는 것: repo.complaint_repo, repo.comment_repo, repo.conversation_repo, auth_service.verify_password
정본: design.md Correctness Properties, requirements.md Requirement 3·4·2.9~2.15.

모든 함수는 school_id를 받아 repo에 그대로 넘긴다 (격리 불변식).
전이 함수는 repo의 UPDATE...WHERE 반환(bool)으로 성패를 판단하고, False면
InvalidTransitionError를 던진다 — 자신이 먼저 SELECT로 상태를 보지 않는다.
"""
from app.core.errors import (
    DomainError,
    HoldReasonRequiredError,
    InvalidTransitionError,
    NotFoundError,
    NotOwnerError,
)
from app.repo import (
    bedrock_log_repo,
    comment_repo,
    complaint_repo,
    conversation_repo,
    pool,
)
from app.schemas.complaint import BedrockLogOut, CommentOut, ComplaintOut, StatsOut
from app.services import auth_service

from app.schemas.session import ConversationTurn
from app.services._mappers import (
    bedrock_log_from_row,
    comment_from_row,
    complaint_from_row,
    conversation_turn_from_row,
    stats_from_row,
)


def _admin_detail(conn, complaint_id: int, school_id: int) -> ComplaintOut:
    """같은 트랜잭션에서 갱신된 관리자 상세를 익명 응답으로 조립한다."""
    row = complaint_repo.get(conn, complaint_id, school_id)
    if row is None:
        raise NotFoundError("민원을 찾을 수 없습니다.")
    return complaint_from_row(
        row,
        None,
        comment_repo.list(conn, complaint_id),
    )


# --- 학생 게시판 ---

def list_complaints(school_id: int, viewer_user_id: int, status: str | None = None) -> list[ComplaintOut]:
    """게시판 목록. 철회 제외. 각 항목의 is_mine을 viewer_user_id와 대조해 계산하고
    submitted_by_user_id는 응답에서 제거한다. comments에는 보류 사유만 싣는다.
    """
    with pool.transaction() as conn:
        rows = complaint_repo.list(conn, school_id, status)
        return [
            complaint_from_row(
                row,
                viewer_user_id,
                comment_repo.list_hold_reasons(conn, row["id"]),
            )
            for row in rows
        ]


def get_complaint(complaint_id: int, school_id: int, viewer_user_id: int) -> ComplaintOut:
    """상세. 없거나 다른 학교면 NotFoundError(404). comments 전부 포함. is_mine 계산."""
    with pool.transaction() as conn:
        row = complaint_repo.get(conn, complaint_id, school_id)
        if row is None:
            raise NotFoundError("민원을 찾을 수 없습니다.")
        comments = comment_repo.list(conn, complaint_id)
        return complaint_from_row(row, viewer_user_id, comments)


def get_conversation(complaint_id: int, school_id: int) -> list[ConversationTurn]:
    """"원문 보기" — 학생-AI 대화 전체. 학교 스코프 확인 후 시간순 반환."""
    with pool.transaction() as conn:
        if complaint_repo.get(conn, complaint_id, school_id) is None:
            raise NotFoundError("민원을 찾을 수 없습니다.")
        rows = conversation_repo.list_by_complaint(conn, complaint_id)
        return [conversation_turn_from_row(row) for row in rows]


def withdraw(complaint_id: int, user_id: int, password: str) -> None:
    """비밀번호를 재확인한 뒤 작성자 본인의 민원만 철회한다."""
    auth_service.verify_password(user_id, password)
    with pool.transaction() as conn:
        if not complaint_repo.withdraw(conn, complaint_id, user_id):
            raise NotOwnerError("본인의 민원만 철회할 수 있습니다.")


# --- 관리자 ---

def get_stats(school_id: int) -> StatsOut:
    """전체 + 6상태 집계 (철회 제외)."""
    with pool.transaction() as conn:
        return stats_from_row(complaint_repo.get_stats(conn, school_id))


def open_detail(complaint_id: int, school_id: int) -> ComplaintOut:
    """상세 열람과 미확인→확인을 같은 트랜잭션에서 처리한다."""
    with pool.transaction() as conn:
        complaint_repo.confirm(conn, complaint_id, school_id)
        return _admin_detail(conn, complaint_id, school_id)


def accept(complaint_id: int, school_id: int) -> ComplaintOut:
    """확인→처리중. 조건 불일치는 원자적으로 409로 변환한다."""
    with pool.transaction() as conn:
        if not complaint_repo.accept(conn, complaint_id, school_id):
            raise InvalidTransitionError("처리할 수 없는 민원 상태입니다.")
        return _admin_detail(conn, complaint_id, school_id)


def resolve(complaint_id: int, school_id: int) -> ComplaintOut:
    """처리중→해결완료. 조건 불일치는 원자적으로 409로 변환한다."""
    with pool.transaction() as conn:
        if not complaint_repo.resolve(conn, complaint_id, school_id):
            raise InvalidTransitionError("처리할 수 없는 민원 상태입니다.")
        return _admin_detail(conn, complaint_id, school_id)


def hold(complaint_id: int, school_id: int, author_user_id: int, reason: str) -> ComplaintOut:
    """확인→보류와 필수 사유 저장을 하나의 트랜잭션으로 처리한다."""
    if not isinstance(reason, str) or not reason.strip():
        raise HoldReasonRequiredError("보류 사유를 입력해야 합니다.")
    normalized_reason = reason.strip()

    with pool.transaction() as conn:
        if not complaint_repo.hold(conn, complaint_id, school_id):
            raise InvalidTransitionError("처리할 수 없는 민원 상태입니다.")
        comment_repo.add(
            conn,
            complaint_id,
            author_user_id,
            normalized_reason,
            is_hold_reason=True,
        )
        return _admin_detail(conn, complaint_id, school_id)


def reject(complaint_id: int, school_id: int) -> ComplaintOut:
    """확인→거절. 조건 불일치는 원자적으로 409로 변환한다."""
    with pool.transaction() as conn:
        if not complaint_repo.reject(conn, complaint_id, school_id):
            raise InvalidTransitionError("처리할 수 없는 민원 상태입니다.")
        return _admin_detail(conn, complaint_id, school_id)


def add_comment(complaint_id: int, school_id: int, author_user_id: int, content: str) -> CommentOut:
    """상태와 무관하게 일반 코멘트를 누적하고 방금 추가한 코멘트를 반환한다.

    api-contract #22: 반환은 CommentOut(추가된 코멘트 1건, 201). 작성자 식별자는
    응답에 넣지 않는다(_mappers.comment_from_row가 제외). 코멘트는 누적이며
    덮어쓰지 않는다.
    """
    if not isinstance(content, str) or not content.strip():
        raise DomainError("코멘트 내용을 입력해 주세요.")
    normalized = content.strip()
    with pool.transaction() as conn:
        if complaint_repo.get(conn, complaint_id, school_id) is None:
            raise NotFoundError("민원을 찾을 수 없습니다.")
        new_id = comment_repo.add(
            conn,
            complaint_id,
            author_user_id,
            normalized,
            is_hold_reason=False,
        )
        for row in comment_repo.list(conn, complaint_id):
            if row.get("id") == new_id:
                return comment_from_row(row)
    raise NotFoundError("코멘트를 찾을 수 없습니다.")


def get_bedrock_logs(school_id: int, limit: int = 50) -> list[BedrockLogOut]:
    """대회 심사용 호출 로그."""
    if isinstance(limit, bool) or not isinstance(limit, int) or limit <= 0:
        raise DomainError("limit은 양의 정수여야 합니다.")
    with pool.transaction() as conn:
        rows = bedrock_log_repo.list_recent(conn, school_id, limit)
        return [bedrock_log_from_row(row) for row in rows]
