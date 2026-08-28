"""인증 라우트. 파싱 → auth_service 호출 → 직렬화만. 로직 없음.

정본: docs/api-contract.md #1~#7.
각 엔드포인트는 auth_service의 동명 함수를 부르고, 쿠키 설정만 라우터에서 한다.
try/except를 쓰지 않는다 — DomainError는 전역 핸들러가 처리.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])

# 구현할 엔드포인트 (docs/api-contract.md 참조):
#   POST   /auth/signup      → auth_service.signup, 성공 시 Set-Cookie (가입 즉시 로그인)
#   POST   /auth/login       → auth_service.login, Set-Cookie
#   POST   /auth/logout      → auth_service.logout, 쿠키 만료
#   GET    /auth/me          → auth_service.get_me (Depends(current_user))
#   PATCH  /auth/password    → auth_service.change_password
#   DELETE /auth/me          → auth_service.delete_account (body에 password)
