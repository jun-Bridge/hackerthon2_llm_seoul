"""
관리자 전용 API
- 통계, 민원 열람(확인 자동전환), 상태 변경, 코멘트, Bedrock 로그
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.db.database import get_db
from app.db.models import Complaint, ComplaintComment, BedrockLog, User
from app.schemas.complaint import (
    ComplaintOut,
    CommentOut,
    CommentIn,
    HoldIn,
    StatsOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _error(code: str, message: str, status_code: int = 400):
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )


def _to_complaint_out(c: Complaint, admin_id: int) -> ComplaintOut:
    return ComplaintOut(
        id=c.id,
        category=c.category,
        location=c.location,
        title=c.refined_title,
        body=c.refined_body,
        status=c.status,
        created_at=c.created_at,
        confirmed_at=c.confirmed_at,
        is_mine=False,  # 관리자 화면에서는 항상 False
        comments=[
            CommentOut(
                id=cm.id,
                content=cm.content,
                is_hold_reason=cm.is_hold_reason,
                created_at=cm.created_at,
            )
            for cm in c.comments
        ],
    )


def _get_complaint_or_404(cid: int, school_id: int, db: Session) -> Complaint:
    c = db.query(Complaint).filter(
        Complaint.id == cid,
        Complaint.school_id == school_id,
    ).first()
    if not c:
        _error("NOT_FOUND", "민원을 찾을 수 없습니다.", 404)
    return c


# ── 16. 통계 ──────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    complaints = db.query(Complaint).filter(
        Complaint.school_id == current_user.school_id,
        Complaint.status != "철회",
    ).all()

    by_status: dict[str, int] = {}
    for c in complaints:
        by_status[c.status] = by_status.get(c.status, 0) + 1

    return StatsOut(total=len(complaints), by_status=by_status)


# ── 17. 상세 열람 + 확인 자동전환 ────────────────────────────────
@router.post("/complaints/{cid}/open", response_model=ComplaintOut)
def open_complaint(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    c = _get_complaint_or_404(cid, current_user.school_id, db)

    # 미확인이면 확인으로 전환 (멱등: 이미 확인 이후면 그냥 넘어감)
    if c.status == "미확인":
        c.status = "확인"
        c.confirmed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(c)

    return _to_complaint_out(c, current_user.id)


# ── 18. 수락 (확인 → 처리중) ─────────────────────────────────────
@router.post("/complaints/{cid}/accept", response_model=ComplaintOut)
def accept_complaint(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    c = _get_complaint_or_404(cid, current_user.school_id, db)
    if c.status != "확인":
        _error("INVALID_TRANSITION", "확인 상태의 민원만 수락할 수 있습니다.", 409)

    c.status = "처리중"
    db.commit()
    db.refresh(c)
    return _to_complaint_out(c, current_user.id)


# ── 19. 해결완료 (처리중 → 해결완료) ─────────────────────────────
@router.post("/complaints/{cid}/resolve", response_model=ComplaintOut)
def resolve_complaint(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    c = _get_complaint_or_404(cid, current_user.school_id, db)
    if c.status != "처리중":
        _error("INVALID_TRANSITION", "처리중 상태의 민원만 완료 처리할 수 있습니다.", 409)

    c.status = "해결완료"
    db.commit()
    db.refresh(c)
    return _to_complaint_out(c, current_user.id)


# ── 20. 보류 (확인 → 보류, 사유 필수) ────────────────────────────
@router.post("/complaints/{cid}/hold", response_model=ComplaintOut)
def hold_complaint(
    cid: int,
    body: HoldIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if not body.reason.strip():
        _error("HOLD_REASON_REQUIRED", "보류 사유를 입력해주세요.", 422)

    c = _get_complaint_or_404(cid, current_user.school_id, db)
    if c.status != "확인":
        _error("INVALID_TRANSITION", "확인 상태의 민원만 보류할 수 있습니다.", 409)

    # 상태 변경 + 보류 사유 코멘트를 같은 트랜잭션으로
    c.status = "보류"
    comment = ComplaintComment(
        complaint_id=c.id,
        author_user_id=current_user.id,
        content=body.reason,
        is_hold_reason=True,
    )
    db.add(comment)
    db.commit()
    db.refresh(c)
    return _to_complaint_out(c, current_user.id)


# ── 21. 거절 (확인 → 거절) ───────────────────────────────────────
@router.post("/complaints/{cid}/reject", response_model=ComplaintOut)
def reject_complaint(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    c = _get_complaint_or_404(cid, current_user.school_id, db)
    if c.status != "확인":
        _error("INVALID_TRANSITION", "확인 상태의 민원만 거절할 수 있습니다.", 409)

    c.status = "거절"
    db.commit()
    db.refresh(c)
    return _to_complaint_out(c, current_user.id)


# ── 22. 코멘트 추가 ───────────────────────────────────────────────
@router.post("/complaints/{cid}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    cid: int,
    body: CommentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if not body.content.strip():
        _error("EMPTY_CONTENT", "코멘트 내용을 입력해주세요.")

    _get_complaint_or_404(cid, current_user.school_id, db)

    comment = ComplaintComment(
        complaint_id=cid,
        author_user_id=current_user.id,
        content=body.content,
        is_hold_reason=False,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return CommentOut(
        id=comment.id,
        content=comment.content,
        is_hold_reason=comment.is_hold_reason,
        created_at=comment.created_at,
    )


# ── 23. Bedrock 호출 로그 (심사용) ───────────────────────────────
@router.get("/bedrock-logs")
def get_bedrock_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    logs = (
        db.query(BedrockLog)
        .filter(BedrockLog.school_id == current_user.school_id)
        .order_by(BedrockLog.called_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": l.id,
            "called_at": l.called_at,
            "model_id": l.model_id,
            "is_complete": l.is_complete,
            "latency_ms": l.latency_ms,
            "input_tokens": l.input_tokens,
            "output_tokens": l.output_tokens,
            "error": l.error,
        }
        for l in logs
    ]
