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

    구현 시 아래를 등록:
        @app.exception_handler(DomainError)
        def handle_domain_error(request, exc: DomainError):
            return JSONResponse(
                status_code=exc.http_status,
                content={"error": {"code": exc.code.value, "message": exc.message}},
            )
    """
    raise NotImplementedError
