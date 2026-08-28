from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# 계약서 공통 타입
Status = Literal["미확인", "확인", "처리중", "해결완료", "보류", "거절", "철회"]
Category = Literal[
    "냉난방 / 공조",
    "위생 / 배관",
    "전기 / 설비",
    "영상 / 기자재",
    "공간 / 편의",
    "안전 / 보안",
    "기타",
]


class CommentOut(BaseModel):
    id: int
    content: str
    is_hold_reason: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ComplaintOut(BaseModel):
    id: int
    category: str
    location: str
    title: str      # refined_title
    body: str       # refined_body
    status: str
    created_at: datetime
    confirmed_at: datetime | None
    is_mine: bool
    comments: list[CommentOut] = []

    model_config = {"from_attributes": True}


class WithdrawIn(BaseModel):
    password: str


class HoldIn(BaseModel):
    reason: str


class CommentIn(BaseModel):
    content: str


class StatsOut(BaseModel):
    total: int
    by_status: dict[str, int]
