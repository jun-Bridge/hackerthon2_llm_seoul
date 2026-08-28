"""대화 세션 라우트 (학생 전용 — require_student). 정본: docs/api-contract.md #8~#11.

  POST /chat-sessions                     → session_service.create_session → {session_id}
  GET  /chat-sessions                     → session_service.list_sessions
  GET  /chat-sessions/{sid}               → session_service.get_session
  POST /chat-sessions/{sid}/messages      → session_service.send_message → RefineResultOut
  POST /chat-sessions/{sid}/submit        → session_service.submit → SubmitOut

주의: 전부 require_student를 Depends로 건다 (관리자는 민원을 넣지 않는다 → 403).
"""
from fastapi import APIRouter

router = APIRouter(prefix="/chat-sessions", tags=["session"])
