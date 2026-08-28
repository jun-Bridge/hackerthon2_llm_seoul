"""학교 목록 라우트. 인증 불필요 (가입 전에 부른다).

정본: docs/api-contract.md #1.
  GET /schools → auth_service.list_schools()  → list[SchoolOut]
"""
from fastapi import APIRouter

from app.schemas.auth import SchoolOut
from app.services import auth_service

router = APIRouter(tags=["schools"])


@router.get("/schools", response_model=list[SchoolOut])
def list_schools():
    return auth_service.list_schools()
