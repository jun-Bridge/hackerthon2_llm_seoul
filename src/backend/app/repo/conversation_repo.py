"""학생-AI 대화 행(complaint_conversations) CRUD.

대화 행은 두 주인을 갖는다: 작성 중에는 chat_session_id로, 접수 후에는 complaint_id로 조회.
호출하는 쪽: app/services/session_service.py (작성), app/services/complaint_service.py (원문 조회)
정본: requirements.md 의 complaint_conversations 스키마, backend-design.md §7.
"""


def add_turn(
    conn,
    chat_session_id: int,
    role: str,
    content: str,
    choices: list[str] | None = None,
    refined_json: dict | None = None,
) -> int:
    """대화 한 턴을 저장한다. role은 'student' 또는 'assistant'.

    choices: assistant 턴에서 되묻기 선택지를 함께 저장 (새로고침 복원용).
    refined_json: 확정 턴에서만 채운다. 이 값이 있으면 "확정됨"의 신호이기도 하다
                  (get_last_refined가 이걸로 확정 여부를 판단).
    complaint_id는 접수 전이라 여기서 채우지 않는다 — submit 시 일괄 UPDATE된다.
    """
    raise NotImplementedError


def list_by_session(conn, chat_session_id: int) -> list[dict]:
    """작성 중 대화 조회 (시간순). 화면 렌더링·새로고침 복원용."""
    raise NotImplementedError


def list_by_complaint(conn, complaint_id: int) -> list[dict]:
    """접수 후 "원문 보기" 조회 (시간순). 게시판·관리자 상세 공용."""
    raise NotImplementedError


def get_last_refined(conn, chat_session_id: int) -> dict | None:
    """그 세션의 가장 마지막 확정안(refined_json)을 꺼낸다.

    SELECT refined_json ... WHERE chat_session_id=? AND refined_json IS NOT NULL
    ORDER BY id DESC LIMIT 1

    Returns:
        {"category", "location", "refined_title", "refined_body"} 또는
        확정 턴이 하나도 없으면 None (접수 불가 → submit이 DraftNotCompleteError).
    """
    raise NotImplementedError


def link_to_complaint(conn, chat_session_id: int, complaint_id: int) -> None:
    """접수 시 그 세션의 모든 대화 행에 complaint_id를 채운다.
    submit() 트랜잭션의 한 단계 — 스스로 commit하지 않는다.
    """
    raise NotImplementedError
