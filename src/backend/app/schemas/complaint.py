"""민원/게시판/관리자 관련 요청/응답 타입. 정본: docs/api-contract.md #12~#23."""
from typing import Literal

from pydantic import BaseModel

from app.schemas.session import Category

Status = Literal["미확인", "확인", "처리중", "해결완료", "보류", "거절", "철회"]


class CommentOut(BaseModel):
    """작성자(author_user_id)는 절대 포함하지 않는다 — 화면에는 '관리자'로만 표시."""

    id: int
    content: str
    is_hold_reason: bool
    created_at: str


class ComplaintOut(BaseModel):
    """게시판/관리자 공용. submitted_by_user_id는 절대 포함하지 않는다.

    주의: comments의 내용은 맥락에 따라 다르다.
    - 목록(list_complaints) 응답: is_hold_reason=True인 것만
    - 상세(get_complaint) 응답: 전부
    프론트는 이 개수로 "코멘트 N개"를 세면 안 된다 (docs/api-contract.md 0장 참조).
    """

    id: int
    category: Category
    location: str
    title: str
    body: str
    status: Status
    created_at: str
    confirmed_at: str | None
    is_mine: bool
    comments: list[CommentOut]


class HoldIn(BaseModel):
    reason: str


class CommentIn(BaseModel):
    content: str


class WithdrawIn(BaseModel):
    password: str


class StatsOut(BaseModel):
    total: int
    by_status: dict[str, int]
    """키는 Status 값 6종 (철회 제외)."""


class BedrockLogOut(BaseModel):
    id: int
    called_at: str
    model_id: str
    is_complete: bool
    latency_ms: int | None
    input_tokens: int | None
    output_tokens: int | None
    error: str | None
