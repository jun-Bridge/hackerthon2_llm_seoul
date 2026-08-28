"""
Draft(민원 작성 대화) API
"""

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import Complaint, ComplaintConversation, User
from app.llm.bedrock_client import BedrockClient
from app.schemas.draft import (
    ConversationTurnOut,
    DraftOut,
    RefinePreview,
    RefineResultOut,
    SendMessageIn,
    SubmitOut,
)

router = APIRouter(prefix="/api/drafts", tags=["draft"])


def _error(code: str, message: str, status_code: int = 400):
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )


# ── 8. 작성 시작 — draft_key 발급 ────────────────────────────────
@router.post("", response_model=DraftOut, status_code=201)
def create_draft(current_user: User = Depends(get_current_user)):
    return DraftOut(draft_key=str(uuid4()))


# ── 9. 메시지 전송 (핵심) ─────────────────────────────────────────
@router.post("/{draft_key}/messages", response_model=RefineResultOut)
def send_message(
    draft_key: str,
    body: SendMessageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.message.strip():
        _error("EMPTY_MESSAGE", "메시지를 입력해주세요.")

    # ① 학생 발화 저장
    student_turn = ComplaintConversation(
        draft_key=draft_key,
        role="student",
        content=body.message,
    )
    db.add(student_turn)
    db.commit()

    # ② 대화 전체 로드
    turns = (
        db.query(ComplaintConversation)
        .filter(ComplaintConversation.draft_key == draft_key)
        .order_by(ComplaintConversation.created_at)
        .all()
    )
    conversation = [{"role": t.role, "content": t.content} for t in turns]

    # ③ Bedrock 호출
    try:
        client = BedrockClient()
        result = client.refine_complaint(
            conversation=conversation,
            school_id=current_user.school_id,
            db=db,
        )
    except RuntimeError as exc:
        _error("BEDROCK_ERROR", str(exc), 502)

    # ④ AI 발화 저장
    ai_turn = ComplaintConversation(
        draft_key=draft_key,
        role="assistant",
        content=result["ai_message"],
        refined_json=result.get("refined_json"),
    )
    db.add(ai_turn)
    db.commit()

    # 응답 조립
    if result["is_complete"]:
        p = result["preview"]
        return RefineResultOut(
            is_complete=True,
            preview=RefinePreview(
                category=p["category"],
                location=p["location"],
                refined_title=p["refined_title"],
                refined_body=p["refined_body"],
            ),
        )
    return RefineResultOut(
        is_complete=False,
        follow_up_question=result["follow_up_question"],
    )


# ── 10. 대화 복구 ─────────────────────────────────────────────────
@router.get("/{draft_key}/conversation", response_model=list[ConversationTurnOut])
def get_draft_conversation(
    draft_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    turns = (
        db.query(ComplaintConversation)
        .filter(ComplaintConversation.draft_key == draft_key)
        .order_by(ComplaintConversation.created_at)
        .all()
    )
    return turns


# ── 11. 정식 접수 ─────────────────────────────────────────────────
@router.post("/{draft_key}/submit", response_model=SubmitOut, status_code=201)
def submit_draft(
    draft_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 마지막 확정안 조회
    last_refined = (
        db.query(ComplaintConversation)
        .filter(
            ComplaintConversation.draft_key == draft_key,
            ComplaintConversation.refined_json.isnot(None),
        )
        .order_by(ComplaintConversation.created_at.desc())
        .first()
    )
    if not last_refined:
        _error("DRAFT_NOT_COMPLETE", "아직 민원이 완성되지 않았습니다. 대화를 계속해주세요.", 409)

    refined = json.loads(last_refined.refined_json)

    # ① complaints INSERT
    complaint = Complaint(
        school_id=current_user.school_id,
        submitted_by_user_id=current_user.id,
        category=refined["category"],
        location=refined["location"],
        refined_title=refined["refined_title"],
        refined_body=refined["refined_body"],
        status="미확인",
    )
    db.add(complaint)
    db.flush()  # complaint.id 확보

    # ② 대화 이력에 complaint_id 채우기
    db.query(ComplaintConversation).filter(
        ComplaintConversation.draft_key == draft_key
    ).update({"complaint_id": complaint.id})
    db.commit()

    return SubmitOut(complaint_id=complaint.id, next_draft_key=str(uuid4()))
