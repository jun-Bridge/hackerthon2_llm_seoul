"""관리자 라우트 (전부 require_admin). 정본: docs/api-contract.md #16~#23.

  GET  /admin/stats                          → complaint_service.get_stats
  POST /admin/complaints/{id}/open           → complaint_service.open_detail (★ GET 아님 — 확인 부작용)
  POST /admin/complaints/{id}/accept         → complaint_service.accept
  POST /admin/complaints/{id}/resolve        → complaint_service.resolve
  POST /admin/complaints/{id}/hold           → complaint_service.hold (body에 reason)
  POST /admin/complaints/{id}/reject         → complaint_service.reject
  POST /admin/complaints/{id}/comments       → complaint_service.add_comment (body에 content)
  GET  /admin/bedrock-logs                   → complaint_service.get_bedrock_logs

전부 Depends(require_admin). 학생이 부르면 403.
상태 변경 응답은 갱신된 ComplaintOut — 프론트는 이걸로 상세를 갈아끼우고 목록·통계만 다시 받는다.
school_id는 세션(current_user)에서 꺼내 서비스에 넘긴다.
"""
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, require_admin
from app.schemas.complaint import BedrockLogOut, CommentIn, ComplaintOut, HoldIn, StatsOut
from app.services import complaint_service

router = APIRouter(prefix="/admin", tags=["admin"])


# ── #16 상태별 집계 ───────────────────────────────────────────────
@router.get("/stats", response_model=StatsOut)
def get_stats(user: CurrentUser = Depends(require_admin)):
    return complaint_service.get_stats(user.school_id)


# ── #17 상세 열람 + 미확인→확인 (POST: 확인 부작용) ──────────────
@router.post("/complaints/{complaint_id}/open", response_model=ComplaintOut)
def open_complaint(complaint_id: int, user: CurrentUser = Depends(require_admin)):
    return complaint_service.open_detail(complaint_id, user.school_id)


# ── #18 확인 → 처리중 ─────────────────────────────────────────────
@router.post("/complaints/{complaint_id}/accept", response_model=ComplaintOut)
def accept_complaint(complaint_id: int, user: CurrentUser = Depends(require_admin)):
    return complaint_service.accept(complaint_id, user.school_id)


# ── #19 처리중 → 해결완료 ─────────────────────────────────────────
@router.post("/complaints/{complaint_id}/resolve", response_model=ComplaintOut)
def resolve_complaint(complaint_id: int, user: CurrentUser = Depends(require_admin)):
    return complaint_service.resolve(complaint_id, user.school_id)


# ── #20 확인 → 보류 (+ 필수 사유) ────────────────────────────────
@router.post("/complaints/{complaint_id}/hold", response_model=ComplaintOut)
def hold_complaint(
    complaint_id: int, body: HoldIn, user: CurrentUser = Depends(require_admin)
):
    return complaint_service.hold(complaint_id, user.school_id, user.user_id, body.reason)


# ── #21 확인 → 거절 ───────────────────────────────────────────────
@router.post("/complaints/{complaint_id}/reject", response_model=ComplaintOut)
def reject_complaint(complaint_id: int, user: CurrentUser = Depends(require_admin)):
    return complaint_service.reject(complaint_id, user.school_id)


# ── #22 코멘트 추가 ───────────────────────────────────────────────
@router.post("/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def add_comment(
    complaint_id: int, body: CommentIn, user: CurrentUser = Depends(require_admin)
):
    return complaint_service.add_comment(complaint_id, user.school_id, user.user_id, body.content)


# ── #23 Bedrock 호출 로그 (심사용) ───────────────────────────────
@router.get("/bedrock-logs", response_model=list[BedrockLogOut])
def get_bedrock_logs(limit: int = 50, user: CurrentUser = Depends(require_admin)):
    return complaint_service.get_bedrock_logs(user.school_id, limit)
