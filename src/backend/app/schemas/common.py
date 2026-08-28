"""공통 타입. 정본: docs/api-contract.md 0장.

이 파일이 계약이다. 오류 코드는 임의로 추가하지 않는다 — 새 코드가 필요하면
docs/api-contract.md의 오류 코드 표를 먼저 고치고 여기 ErrorCode에 추가한다.
"""
from enum import Enum

from pydantic import BaseModel


class ErrorCode(str, Enum):
    """docs/api-contract.md 오류 코드 표와 정확히 일치해야 한다."""

    UNSUPPORTED_DOMAIN = "UNSUPPORTED_DOMAIN"
    EMAIL_TAKEN = "EMAIL_TAKEN"
    INVALID_ADMIN_CODE = "INVALID_ADMIN_CODE"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    WRONG_PASSWORD = "WRONG_PASSWORD"
    FORBIDDEN_ROLE = "FORBIDDEN_ROLE"
    NOT_OWNER = "NOT_OWNER"
    NOT_FOUND = "NOT_FOUND"
    DRAFT_NOT_COMPLETE = "DRAFT_NOT_COMPLETE"
    SESSION_CLOSED = "SESSION_CLOSED"
    TURN_IN_PROGRESS = "TURN_IN_PROGRESS"
    CONVERSATION_STUCK = "CONVERSATION_STUCK"
    INVALID_TRANSITION = "INVALID_TRANSITION"
    HOLD_REASON_REQUIRED = "HOLD_REASON_REQUIRED"
    BEDROCK_ERROR = "BEDROCK_ERROR"


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    """모든 오류 응답의 유일한 형태: {"error": {"code": ..., "message": ...}}"""

    error: ErrorDetail
