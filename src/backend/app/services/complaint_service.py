"""민원 조회·상태 전이·철회·코멘트. 상태 전이 판정이 여기 산다.

호출하는 쪽: app/api/routes/board.py (학생), app/api/routes/admin.py (관리자)
호출하는 것: repo.complaint_repo, repo.comment_repo, repo.conversation_repo, auth_service.verify_password
정본: design.md Correctness Properties, requirements.md Requirement 3·4·2.9~2.15.

모든 함수는 school_id를 받아 repo에 그대로 넘긴다 (격리 불변식).
전이 함수는 repo의 UPDATE...WHERE 반환(bool)으로 성패를 판단하고, False면
InvalidTransitionError를 던진다 — 자신이 먼저 SELECT로 상태를 보지 않는다.
"""
from app.schemas.complaint import BedrockLogOut, ComplaintOut, StatsOut
from app.schemas.session import ConversationTurn


# --- 학생 게시판 ---

def list_complaints(school_id: int, viewer_user_id: int, status: str | None = None) -> list[ComplaintOut]:
    """게시판 목록. 철회 제외. 각 항목의 is_mine을 viewer_user_id와 대조해 계산하고
    submitted_by_user_id는 응답에서 제거한다. comments에는 보류 사유만 싣는다.
    """
    raise NotImplementedError


def get_complaint(complaint_id: int, school_id: int, viewer_user_id: int) -> ComplaintOut:
    """상세. 없거나 다른 학교면 NotFoundError(404). comments 전부 포함. is_mine 계산."""
    raise NotImplementedError


def get_conversation(complaint_id: int, school_id: int) -> list[ConversationTurn]:
    """"원문 보기" — 학생-AI 대화 전체. 학교 스코프 확인 후 시간순 반환."""
    raise NotImplementedError


def withdraw(complaint_id: int, user_id: int, password: str) -> None:
    """철회. verify_password 후 complaint_repo.withdraw(complaint_id, user_id).
    비밀번호 불일치 → WrongPasswordError. 소유자 아니면(0행) NotOwnerError.
    """
    raise NotImplementedError


# --- 관리자 ---

def get_stats(school_id: int) -> StatsOut:
    """전체 + 6상태 집계 (철회 제외)."""
    raise NotImplementedError


def open_detail(complaint_id: int, school_id: int) -> ComplaintOut:
    """상세 열람 + 미확인→확인 자동 전환.
    complaint_repo.confirm 호출(반환값 무시 — 이미 확인 이후면 무동작, 멱등)
    후 갱신된 상세를 반환한다. 라우터는 이걸 POST로 노출한다 (GET이면 프리페치가 확인 처리).
    """
    raise NotImplementedError


def accept(complaint_id: int, school_id: int) -> ComplaintOut:
    """확인→처리중. repo.accept가 False면 InvalidTransitionError. 성공 시 갱신된 상세 반환."""
    raise NotImplementedError


def resolve(complaint_id: int, school_id: int) -> ComplaintOut:
    """처리중→해결완료. repo.resolve가 False면 InvalidTransitionError."""
    raise NotImplementedError


def hold(complaint_id: int, school_id: int, author_user_id: int, reason: str) -> ComplaintOut:
    """확인→보류 + 사유 코멘트. reason.strip()이 비면 HoldReasonRequiredError(DB 호출 전).
    [트랜잭션] complaint_repo.hold + comment_repo.add(is_hold_reason=True) — 둘 다 성공해야 함.
    hold가 False면 InvalidTransitionError.
    """
    raise NotImplementedError


def reject(complaint_id: int, school_id: int) -> ComplaintOut:
    """확인→거절. repo.reject가 False면 InvalidTransitionError."""
    raise NotImplementedError


def add_comment(complaint_id: int, school_id: int, author_user_id: int, content: str) -> ComplaintOut:
    """상태 무관 상시 코멘트. 빈 값이면 VALIDATION_FAILED. is_hold_reason=False로 저장."""
    raise NotImplementedError


def get_bedrock_logs(school_id: int, limit: int = 50) -> list[BedrockLogOut]:
    """대회 심사용 호출 로그."""
    raise NotImplementedError
