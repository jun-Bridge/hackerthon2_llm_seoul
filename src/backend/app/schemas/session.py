"""대화 세션 관련 요청/응답 타입. 정본: docs/api-contract.md #8~#11, backend-design.md §7."""
from typing import Literal

from pydantic import BaseModel

Category = Literal[
    "냉난방 / 공조",
    "위생 / 배관",
    "전기 / 설비",
    "통신 / 인터넷",
    "영상 / 기자재",
    "공간 / 편의",
    "안전 / 보안",
    "기타",
]

MissingField = Literal["category", "location", "detail"]
Step = Literal["category", "location", "detail", "confirm"]


class ConversationTurn(BaseModel):
    role: Literal["student", "assistant"]
    content: str
    choices: list[str] | None = None
    created_at: str


class SessionSummaryOut(BaseModel):
    """GET /chat-sessions 목록 항목. 필드명은 프론트 계약(api-contract #8-1) 정본.

    submitted: 접수 완료(연결된 민원 존재) 여부. 계약은 complaint_id가 아니라
    이 불린을 노출한다 — 프론트는 읽기 전용 판단에만 쓴다.
    """

    session_id: int
    title: str | None
    category: Category | None
    submitted: bool
    withdrawn: bool
    updated_at: str


class SessionDetailOut(BaseModel):
    """GET /chat-sessions/{sid} 응답. SessionSummary를 확장한다 (api-contract #8-2)."""

    session_id: int
    title: str | None
    category: Category | None
    submitted: bool
    withdrawn: bool
    updated_at: str
    step: str | None
    """현재 단계 캐시. 정본은 마지막 assistant 턴의 choices — 이 필드는 UI 편의용."""
    choices: list[str] | None = None
    """지금 보여줄 칩(마지막 assistant 턴의 선택지). 없으면 자유 입력만. (api-contract #8-2)"""
    preview: "RefinedPreview | None"


class SendMessageIn(BaseModel):
    message: str


class RefinedPreview(BaseModel):
    """AI가 classify_and_refine_complaint를 불렀을 때의 확정안."""

    category: Category
    location: str
    refined_title: str
    refined_body: str


class RefineResultOut(BaseModel):
    """POST /chat-sessions/{sid}/messages 응답. 필드명은 프론트 계약(api-contract #9) 정본.

    is_complete=False: step(category/location/detail)·question·choices 채움.
    is_complete=True:  step='confirm'·preview 채움 (title/category는 바뀐 경우에만).
    """

    is_complete: bool
    step: Step | None = None
    question: str | None = None
    choices: list[str] | None = None
    preview: RefinedPreview | None = None
    title: str | None = None
    category: Category | None = None


class SubmitOut(BaseModel):
    complaint_id: int
    next_session_id: int
