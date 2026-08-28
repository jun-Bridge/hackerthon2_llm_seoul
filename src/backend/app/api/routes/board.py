"""게시판 라우트 (학생·관리자 공용 조회 + 학생 철회). 정본: docs/api-contract.md #12~#15.

  GET  /complaints                    → complaint_service.list_complaints (?status= 선택)
  GET  /complaints/{id}               → complaint_service.get_complaint
  GET  /complaints/{id}/conversation  → complaint_service.get_conversation
  POST /complaints/{id}/withdraw      → complaint_service.withdraw (body에 password, 학생 본인만)

school_id는 세션(current_user)에서 꺼내 서비스에 넘긴다 — 요청 본문으로 받지 않는다.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/complaints", tags=["board"])
