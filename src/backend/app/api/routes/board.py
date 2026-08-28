"""게시판 라우트 (학생·관리자 공용 조회 + 학생 철회). 정본: docs/api-contract.md #12~#15.

  GET  /complaints                    → complaint_service.list_complaints (?status= 선택)
  GET  /complaints/{id}               → complaint_service.get_complaint
  GET  /complaints/{id}/conversation  → complaint_service.get_conversation
  POST /complaints/{id}/withdraw      → complaint_service.withdraw (body에 password, 학생 본인만)

school_id는 세션(current_user)에서 꺼내 서비스에 넘긴다 — 요청 본문으로 받지 않는다.
조회는 학생·관리자 공용이라 current_user를 쓴다 (require_student 아님).
철회는 서비스가 작성자 본인(user_id) 소유권으로 거른다.
"""
from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, current_user
from app.schemas.complaint import ComplaintOut, Status, WithdrawIn
from app.schemas.session import Category, ConversationTurn
from app.services import complaint_service

router = APIRouter(prefix="/complaints", tags=["board"])


# ── #12 게시판 목록 (?status=·?category= 선택, 생략 시 철회 뺀 전체) ────────
@router.get("", response_model=list[ComplaintOut])
def list_complaints(
    status: Status | None = None,
    category: Category | None = None,
    user: CurrentUser = Depends(current_user),
):
    return complaint_service.list_complaints(user.school_id, user.user_id, status, category)


# ── #13 상세 (상태 안 바뀜) ───────────────────────────────────────
@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: int, user: CurrentUser = Depends(current_user)):
    return complaint_service.get_complaint(complaint_id, user.school_id, user.user_id)


# ── #14 원문 보기 (학생-AI 대화 전체) ────────────────────────────
@router.get("/{complaint_id}/conversation", response_model=list[ConversationTurn])
def get_complaint_conversation(complaint_id: int, user: CurrentUser = Depends(current_user)):
    return complaint_service.get_conversation(complaint_id, user.school_id)


# ── #15 철회 (본인만, 비밀번호 재확인) ───────────────────────────
@router.post("/{complaint_id}/withdraw", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_complaint(
    complaint_id: int, body: WithdrawIn, user: CurrentUser = Depends(current_user)
):
    complaint_service.withdraw(complaint_id, user.user_id, body.password)
