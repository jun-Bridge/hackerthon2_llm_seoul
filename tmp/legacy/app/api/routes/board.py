"""
게시판 API — 민원 목록, 상세, 원문 조회, 철회
학생/관리자 공통 사용
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import verify_password
from app.db.database import get_db
from app.db.models import Complaint, ComplaintConversation, User
from app.schemas.complaint import ComplaintOut, CommentOut, WithdrawIn
from app.schemas.draft import ConversationTurnOut

router = APIRouter(prefix="/api/complaints", tags=["board"])


def _error(code: str, message: str, status_code: int = 400):
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )


def _to_complaint_out(c: Complaint, current_user_id: int, full_comments: bool = True) -> ComplaintOut:
    """Complaint ORM 모델 → ComplaintOut 변환. is_mine 계산 포함."""
    if full_comments:
        comments = c.comments
    else:
        # 목록에서는 보류 사유만
        comments = [cm for cm in c.comments if cm.is_hold_reason]

    return ComplaintOut(
        id=c.id,
        category=c.category,
        location=c.location,
        title=c.refined_title,
        body=c.refined_body,
        status=c.status,
        created_at=c.created_at,
        confirmed_at=c.confirmed_at,
        is_mine=(c.submitted_by_user_id == current_user_id),
        comments=[
            CommentOut(
                id=cm.id,
                content=cm.content,
                is_hold_reason=cm.is_hold_reason,
                created_at=cm.created_at,
            )
            for cm in comments
        ],
    )


# ── 12. 민원 목록 ─────────────────────────────────────────────────
@router.get("", response_model=list[ComplaintOut])
def list_complaints(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Complaint).filter(
        Complaint.school_id == current_user.school_id,
        Complaint.status != "철회",
    )
    if status:
        query = query.filter(Complaint.status == status)

    complaints = query.order_by(Complaint.created_at.desc()).all()
    return [_to_complaint_out(c, current_user.id, full_comments=False) for c in complaints]


# ── 13. 민원 상세 ─────────────────────────────────────────────────
@router.get("/{cid}", response_model=ComplaintOut)
def get_complaint(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Complaint).filter(
        Complaint.id == cid,
        Complaint.school_id == current_user.school_id,
    ).first()
    if not c:
        _error("NOT_FOUND", "민원을 찾을 수 없습니다.", 404)

    return _to_complaint_out(c, current_user.id, full_comments=True)


# ── 14. 원문(대화) 조회 ───────────────────────────────────────────
@router.get("/{cid}/conversation", response_model=list[ConversationTurnOut])
def get_complaint_conversation(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Complaint).filter(
        Complaint.id == cid,
        Complaint.school_id == current_user.school_id,
    ).first()
    if not c:
        _error("NOT_FOUND", "민원을 찾을 수 없습니다.", 404)

    turns = (
        db.query(ComplaintConversation)
        .filter(ComplaintConversation.complaint_id == cid)
        .order_by(ComplaintConversation.created_at)
        .all()
    )
    return turns


# ── 15. 철회 ──────────────────────────────────────────────────────
@router.post("/{cid}/withdraw", status_code=204)
def withdraw_complaint(
    cid: int,
    body: WithdrawIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.password, current_user.password_hash):
        _error("WRONG_PASSWORD", "비밀번호가 올바르지 않습니다.", 401)

    c = db.query(Complaint).filter(
        Complaint.id == cid,
        Complaint.school_id == current_user.school_id,
        Complaint.submitted_by_user_id == current_user.id,
    ).first()
    if not c:
        _error("NOT_OWNER", "본인의 민원만 철회할 수 있습니다.", 403)

    c.status = "철회"
    db.commit()
