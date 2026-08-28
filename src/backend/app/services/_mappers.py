"""Service 경계에서 B의 dict row를 API 응답 타입으로 안전하게 변환한다.

이 모듈은 DB/repo를 호출하지 않는다. Service가 이미 조회한 row만 받아서
필수 필드·기본 타입·도메인 값을 엄격히 확인하고 Pydantic 응답을 만든다.
계약이 어긋난 row를 추측하거나 보정하지 않고 ``ServiceContractError``로 닫는다.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.llm.choices import CATEGORIES
from app.schemas.complaint import BedrockLogOut, CommentOut, ComplaintOut, StatsOut
from app.schemas.session import ConversationTurn, SessionSummaryOut

_ModelT = TypeVar("_ModelT", bound=BaseModel)
_CATEGORIES = frozenset(CATEGORIES)
_STATUSES = frozenset({"미확인", "확인", "처리중", "해결완료", "보류", "거절"})
_ROLES = frozenset({"student", "assistant"})


class ServiceContractError(RuntimeError):
    """repo row와 Service 응답 계약이 맞지 않을 때 발생하는 내부 오류.

    오류 메시지에 row 값은 넣지 않는다. 민원 본문·작성자 id 같은 내부 값이
    로그나 HTTP 오류로 우연히 노출되는 것을 막기 위해서다.
    """


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ServiceContractError(f"{name} must be a mapping")
    return value


def _required(row: Mapping[str, Any], key: str) -> Any:
    try:
        return row[key]
    except KeyError as exc:
        raise ServiceContractError(f"row is missing required field: {key}") from exc


def _positive_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ServiceContractError(f"{field} must be a positive integer")
    return value


def _optional_positive_int(value: Any, field: str) -> int | None:
    if value is None:
        return None
    return _positive_int(value, field)


def _nonnegative_int(value: Any, field: str, *, optional: bool = False) -> int | None:
    if value is None and optional:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ServiceContractError(f"{field} must be a non-negative integer")
    return value


def _boolean(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ServiceContractError(f"{field} must be a boolean")
    return value


def _text(value: Any, field: str, *, optional: bool = False) -> str | None:
    if value is None and optional:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ServiceContractError(f"{field} must be a non-empty string")
    return value


def _timestamp(value: Any, field: str, *, optional: bool = False) -> str | None:
    if value is None and optional:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return _text(value, field)


def _category(value: Any, field: str = "category", *, optional: bool = False) -> str | None:
    if value is None and optional:
        return None
    category = _text(value, field)
    if category not in _CATEGORIES:
        raise ServiceContractError(f"{field} is outside the canonical taxonomy")
    return category


def _string_list(value: Any, field: str, *, optional: bool = False) -> list[str] | None:
    if value is None and optional:
        return None
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ServiceContractError(f"{field} must be a sequence of strings")

    result: list[str] = []
    for item in value:
        text = _text(item, f"{field} item")
        if text is None:  # optional=False 계약을 최적화 모드에서도 명시적으로 방어한다.
            raise ServiceContractError(f"{field} item must be a non-empty string")
        result.append(text)
    return result


def _model(model_type: type[_ModelT], **values: Any) -> _ModelT:
    try:
        return model_type(**values)
    except ValidationError:
        # ValidationError에는 실제 입력값이 포함될 수 있으므로 traceback 연결도 숨긴다.
        raise ServiceContractError(
            f"{model_type.__name__} rejected the mapped service response"
        ) from None


def session_summary_from_row(row: Mapping[str, Any]) -> SessionSummaryOut:
    """``chat_session_repo.list_by_user`` row를 목록 응답으로 변환한다.

    계약(#8-1)은 complaint_id 대신 submitted 불린을 노출한다. 연결된 민원이
    있으면(complaint_id 존재) 접수 완료 = submitted True.
    """
    row = _mapping(row, "session row")
    complaint_id = _optional_positive_int(
        _required(row, "complaint_id"), "complaint_id"
    )
    return _model(
        SessionSummaryOut,
        session_id=_positive_int(_required(row, "id"), "id"),
        title=_text(_required(row, "title"), "title", optional=True),
        category=_category(_required(row, "category"), optional=True),
        submitted=complaint_id is not None,
        withdrawn=_boolean(_required(row, "withdrawn"), "withdrawn"),
        updated_at=_timestamp(_required(row, "updated_at"), "updated_at"),
    )


def conversation_turn_from_row(row: Mapping[str, Any]) -> ConversationTurn:
    """대화 row를 공개 응답으로 변환하고 내부 JSON은 노출하지 않는다."""
    row = _mapping(row, "conversation row")
    role = _text(_required(row, "role"), "role")
    if role not in _ROLES:
        raise ServiceContractError("role is outside the conversation contract")

    choices = _string_list(_required(row, "choices"), "choices", optional=True)
    if role == "student" and choices is not None:
        raise ServiceContractError("student turns cannot carry choices")

    return _model(
        ConversationTurn,
        role=role,
        content=_text(_required(row, "content"), "content"),
        choices=choices,
        created_at=_timestamp(_required(row, "created_at"), "created_at"),
    )


def comment_from_row(row: Mapping[str, Any]) -> CommentOut:
    """코멘트 row에서 작성자 식별자를 제외한 공개 필드만 선택한다."""
    row = _mapping(row, "comment row")
    return _model(
        CommentOut,
        id=_positive_int(_required(row, "id"), "id"),
        content=_text(_required(row, "content"), "content"),
        is_hold_reason=_boolean(
            _required(row, "is_hold_reason"), "is_hold_reason"
        ),
        created_at=_timestamp(_required(row, "created_at"), "created_at"),
    )


def complaint_from_row(
    row: Mapping[str, Any],
    viewer_user_id: int | None,
    comments: Sequence[Mapping[str, Any]],
) -> ComplaintOut:
    """민원 row와 별도 조회한 comments를 익명 공개 응답으로 조립한다.

    학생 조회는 ``viewer_user_id``로 ``is_mine``을 계산한다. 관리자 조회는
    작성자 비교가 필요 없으므로 ``None``을 받아 항상 ``False``로 공개한다.
    """
    row = _mapping(row, "complaint row")
    if viewer_user_id is not None:
        viewer_user_id = _positive_int(viewer_user_id, "viewer_user_id")
    if isinstance(comments, (str, bytes)) or not isinstance(comments, Sequence):
        raise ServiceContractError("comments must be a sequence of mappings")

    owner_id = _optional_positive_int(
        _required(row, "submitted_by_user_id"), "submitted_by_user_id"
    )
    status = _text(_required(row, "status"), "status")
    if status not in _STATUSES:
        raise ServiceContractError("status is outside the public complaint workflow")

    return _model(
        ComplaintOut,
        id=_positive_int(_required(row, "id"), "id"),
        category=_category(_required(row, "category")),
        location=_text(_required(row, "location"), "location"),
        title=_text(_required(row, "refined_title"), "refined_title"),
        body=_text(_required(row, "refined_body"), "refined_body"),
        status=status,
        created_at=_timestamp(_required(row, "created_at"), "created_at"),
        confirmed_at=_timestamp(
            _required(row, "confirmed_at"), "confirmed_at", optional=True
        ),
        is_mine=owner_id is not None and owner_id == viewer_user_id,
        comments=[comment_from_row(item) for item in comments],
    )


def stats_from_row(row: Mapping[str, Any]) -> StatsOut:
    """B가 0으로 채운 6개 공개 상태 집계를 검증하고 total을 계산한다."""
    row = _mapping(row, "stats row")
    if set(row) != _STATUSES:
        raise ServiceContractError("stats row must contain exactly six public statuses")

    by_status: dict[str, int] = {}
    for status in _STATUSES:
        count = _nonnegative_int(_required(row, status), f"status count: {status}")
        if count is None:  # optional=False 계약을 최적화 모드에서도 명시적으로 방어한다.
            raise ServiceContractError(f"status count must be present: {status}")
        by_status[status] = count
    return _model(StatsOut, total=sum(by_status.values()), by_status=by_status)


def bedrock_log_from_row(row: Mapping[str, Any]) -> BedrockLogOut:
    """프롬프트·응답 본문 없이 허용된 Bedrock 메타 필드만 선택한다."""
    row = _mapping(row, "bedrock log row")
    return _model(
        BedrockLogOut,
        id=_positive_int(_required(row, "id"), "id"),
        called_at=_timestamp(_required(row, "called_at"), "called_at"),
        model_id=_text(_required(row, "model_id"), "model_id"),
        is_complete=_boolean(_required(row, "is_complete"), "is_complete"),
        latency_ms=_nonnegative_int(
            _required(row, "latency_ms"), "latency_ms", optional=True
        ),
        input_tokens=_nonnegative_int(
            _required(row, "input_tokens"), "input_tokens", optional=True
        ),
        output_tokens=_nonnegative_int(
            _required(row, "output_tokens"), "output_tokens", optional=True
        ),
        error=_text(_required(row, "error"), "error", optional=True),
    )
