"""대화 세션 라우트 (학생 전용 — require_student). 정본: docs/api-contract.md #8~#11.

  POST /chat-sessions                     → session_service.create_session → {session_id}
  GET  /chat-sessions                     → session_service.list_sessions
  GET  /chat-sessions/{session_id}        → session_service.get_session
  POST /chat-sessions/{session_id}/messages → session_service.send_message → RefineResultOut
  POST /chat-sessions/{session_id}/submit → session_service.submit → SubmitOut

주의: 전부 require_student를 Depends로 건다 (관리자는 민원을 넣지 않는다 → 403).
라우터는 파싱 → 서비스 호출 → 직렬화만. 로직·try/except 없음 (DomainError는 전역 핸들러).
school_id·user_id는 세션(current_user)에서 꺼내 서비스에 넘긴다.

경로 파라미터 이름은 session_id로 둔다 — 로그인 세션 쿠키 이름('sid')과 겹치면
FastAPI가 Cookie와 Path를 혼동한다(require_student → current_user가 sid 쿠키를 읽음).
"""
from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, require_student
from app.schemas.session import (
    ConversationTurn,
    RefineResultOut,
    SendMessageIn,
    SessionDetailOut,
    SessionSummaryOut,
    SubmitOut,
)
from app.services import session_service

router = APIRouter(prefix="/chat-sessions", tags=["session"])


# ── #8 세션 생성 (빈 세션 재사용) ─────────────────────────────────
@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(user: CurrentUser = Depends(require_student)):
    session_id = session_service.create_session(user.user_id, user.school_id)
    return {"session_id": session_id}


# ── #8-1 과거 대화 목록 ───────────────────────────────────────────
@router.get("", response_model=list[SessionSummaryOut])
def list_sessions(user: CurrentUser = Depends(require_student)):
    return session_service.list_sessions(user.user_id)


# ── #8-2 세션 상세 (메타·현재 단계·칩·미리보기) ──────────────────
@router.get("/{session_id}", response_model=SessionDetailOut)
def get_session(session_id: int, user: CurrentUser = Depends(require_student)):
    return session_service.get_session(session_id, user.user_id)


# ── #9 메시지 전송 (AI 되묻기·정제) ───────────────────────────────
@router.post("/{session_id}/messages", response_model=RefineResultOut)
def send_message(
    session_id: int, body: SendMessageIn, user: CurrentUser = Depends(require_student)
):
    return session_service.send_message(session_id, user.user_id, body.message)


# ── #10 대화 복구 ─────────────────────────────────────────────────
@router.get("/{session_id}/conversation", response_model=list[ConversationTurn])
def get_conversation(session_id: int, user: CurrentUser = Depends(require_student)):
    return session_service.get_conversation(session_id, user.user_id)


# ── #11 정식 접수 ─────────────────────────────────────────────────
@router.post(
    "/{session_id}/submit",
    status_code=status.HTTP_201_CREATED,
    response_model=SubmitOut,
)
def submit_session(session_id: int, user: CurrentUser = Depends(require_student)):
    return session_service.submit(session_id, user.user_id)
