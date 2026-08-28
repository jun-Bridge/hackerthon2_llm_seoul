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
"""
from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])
