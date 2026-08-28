"""학교 목록 라우트. 인증 불필요 (가입 전에 부른다).

정본: docs/api-contract.md #1.
  GET /schools → auth_service.list_schools()  → list[SchoolOut]
"""
from fastapi import APIRouter

router = APIRouter(tags=["schools"])
