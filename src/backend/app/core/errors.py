"""도메인 예외 정의 + FastAPI 예외 핸들러 등록.

services/ 는 아래 예외를 던지기만 한다. routes/ 는 try/except를 쓰지 않는다 —
main.py에 등록된 핸들러가 전역으로 {"error": {"code","message"}} 형태로 변환한다.
"""
from app.schemas.common import ErrorCode


class DomainError(Exception):
    """모든 도메인 예외의 베이스. http_status와 code를 반드시 갖는다."""

    http_status: int = 400
    code: ErrorCode = ErrorCode.VALIDATION_FAILED

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class UnsupportedDomainError(DomainError):
    http_status = 400
    code = ErrorCode.UNSUPPORTED_DOMAIN


class EmailTakenError(DomainError):
    http_status = 409
    code = ErrorCode.EMAIL_TAKEN


class InvalidAdminCodeError(DomainError):
    http_status = 400
    code = ErrorCode.INVALID_ADMIN_CODE


class InvalidCredentialsError(DomainError):
    http_status = 401
    code = ErrorCode.INVALID_CREDENTIALS


class UnauthenticatedError(DomainError):
    http_status = 401
    code = ErrorCode.UNAUTHENTICATED


class WrongPasswordError(DomainError):
    http_status = 401
    code = ErrorCode.WRONG_PASSWORD


class ForbiddenRoleError(DomainError):
    http_status = 403
    code = ErrorCode.FORBIDDEN_ROLE


class NotOwnerError(DomainError):
    http_status = 403
    code = ErrorCode.NOT_OWNER


class NotFoundError(DomainError):
    http_status = 404
    code = ErrorCode.NOT_FOUND


class DraftNotCompleteError(DomainError):
    http_status = 409
    code = ErrorCode.DRAFT_NOT_COMPLETE


class SessionClosedError(DomainError):
    http_status = 409
    code = ErrorCode.SESSION_CLOSED


class TurnInProgressError(DomainError):
    http_status = 409
    code = ErrorCode.TURN_IN_PROGRESS


class ConversationStuckError(DomainError):
    http_status = 409
    code = ErrorCode.CONVERSATION_STUCK


class InvalidTransitionError(DomainError):
    http_status = 409
    code = ErrorCode.INVALID_TRANSITION


class HoldReasonRequiredError(DomainError):
    http_status = 422
    code = ErrorCode.HOLD_REASON_REQUIRED


class BedrockError(DomainError):
    http_status = 502
    code = ErrorCode.BEDROCK_ERROR


def register_exception_handlers(app) -> None:
    """main.py에서 호출한다: register_exception_handlers(app)

    - DomainError: 도메인 예외를 계약된 {"error": {code, message}} 형태로 변환
    - RequestValidationError: Pydantic 검증 실패를 VALIDATION_FAILED(400)로 통일
    - Exception: 예상치 못한 오류는 500으로, 내부 정보는 노출하지 않는다
    """
    import logging

    from fastapi import Request
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError):
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": {"code": exc.code.value, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # 첫 번째 오류 메시지를 사람이 읽을 만한 형태로 전달
        first = exc.errors()[0] if exc.errors() else {}
        msg = first.get("msg", "입력값이 올바르지 않습니다.")
        return JSONResponse(
            status_code=400,
            content={"error": {"code": ErrorCode.VALIDATION_FAILED.value, "message": msg}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        logging.error("Unhandled exception", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "서버 오류가 발생했습니다."}},
        )
