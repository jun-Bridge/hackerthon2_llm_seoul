"""LLM 경계의 런타임 계약 검증.

Bedrock 응답은 신뢰하지 않는다. 이 모듈은 외부 payload를 dataclass로 바꾸기 전에
형태와 필수 값을 검증하고, 허용된 최소 정규화(문자열 앞뒤 공백 제거)만 수행한다.
없는 값을 추측하거나 잘못된 카테고리를 자동 보정하지 않는다.
"""
from collections.abc import Mapping
from typing import Any

from app.llm.choices import CATEGORIES


class ContractViolation(ValueError):
    """LLM 입력 또는 출력이 고정 계약을 위반했다."""


MAX_COMPACT_CONTEXT_CHARS = 8_000
MAX_COMPACT_TITLE_CHARS = 100


_MISSING_VALUES = frozenset({"category", "location", "detail"})
_ASK_FOLLOWUP_KEYS = frozenset({"missing", "question", "choices"})
_REFINED_KEYS = frozenset(
    {"category", "location", "refined_title", "refined_body", "session_title"}
)
_COMPACT_KEYS = frozenset({"context", "title"})
_BUFFER_KEYS = frozenset({"role", "content"})
_BUFFER_ROLES = frozenset({"student", "assistant"})


def _require_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractViolation(f"{name} must be an object")
    return value


def _require_exact_keys(
    payload: Mapping[str, Any], required: frozenset[str], name: str
) -> None:
    keys = set(payload)
    missing = required - keys
    unexpected = keys - required
    if missing:
        raise ContractViolation(f"{name} is missing required fields")
    if unexpected:
        raise ContractViolation(f"{name} contains unexpected fields")


def normalize_required_text(value: Any, name: str) -> str:
    """문자열만 허용하고 앞뒤 공백 제거 후 빈 값은 거부한다."""
    if not isinstance(value, str):
        raise ContractViolation(f"{name} must be a string")
    normalized = value.strip()
    if not normalized:
        raise ContractViolation(f"{name} must not be empty")
    return normalized


def normalize_optional_text(value: Any, name: str) -> str | None:
    """None 또는 비어 있지 않은 문자열만 허용한다."""
    if value is None:
        return None
    return normalize_required_text(value, name)


def normalize_choices(value: Any) -> list[str]:
    """도구 계약대로 3~5개의 비어 있지 않은 문자열 배열만 허용한다."""
    if not isinstance(value, list):
        raise ContractViolation("choices must be an array")
    if not 3 <= len(value) <= 5:
        raise ContractViolation("choices must contain between 3 and 5 items")
    return [normalize_required_text(item, "choices item") for item in value]


def validate_ask_followup_payload(payload: Any) -> dict[str, Any]:
    """ask_followup의 신뢰할 수 없는 tool input을 검증·정규화한다."""
    source = _require_mapping(payload, "ask_followup input")
    _require_exact_keys(source, _ASK_FOLLOWUP_KEYS, "ask_followup input")

    missing = source["missing"]
    if not isinstance(missing, str) or missing not in _MISSING_VALUES:
        raise ContractViolation("missing has an unsupported value")

    return {
        "missing": missing,
        "question": normalize_required_text(source["question"], "question"),
        "choices": normalize_choices(source["choices"]),
    }


def validate_refined_payload(payload: Any) -> dict[str, str]:
    """classify_and_refine_complaint의 tool input을 검증·정규화한다."""
    source = _require_mapping(payload, "classify_and_refine input")
    _require_exact_keys(source, _REFINED_KEYS, "classify_and_refine input")

    category = source["category"]
    if not isinstance(category, str) or category not in CATEGORIES:
        raise ContractViolation("category is outside the fixed taxonomy")

    return {
        "category": category,
        "location": normalize_required_text(source["location"], "location"),
        "refined_title": normalize_required_text(
            source["refined_title"], "refined_title"
        ),
        "refined_body": normalize_required_text(source["refined_body"], "refined_body"),
        "session_title": normalize_required_text(
            source["session_title"], "session_title"
        ),
    }


def validate_compact_payload(payload: Any) -> dict[str, str]:
    """압축 응답의 구조·필수 값·저장 가능한 길이를 검증한다."""
    source = _require_mapping(payload, "compact output")
    _require_exact_keys(source, _COMPACT_KEYS, "compact output")
    context = normalize_required_text(source["context"], "context")
    title = normalize_required_text(source["title"], "title")
    if len(context) > MAX_COMPACT_CONTEXT_CHARS:
        raise ContractViolation("context exceeds the maximum length")
    if len(title) > MAX_COMPACT_TITLE_CHARS:
        raise ContractViolation("title exceeds the maximum length")
    return {"context": context, "title": title}


def validate_buffer(context: Any, buffer: Any) -> tuple[str | None, list[dict[str, str]]]:
    """refine 입력을 검증하고 원본을 변경하지 않은 정규화 사본을 반환한다."""
    normalized_context = normalize_optional_text(context, "context")
    if not isinstance(buffer, list):
        raise ContractViolation("buffer must be an array")
    if not buffer:
        raise ContractViolation("buffer must not be empty")

    normalized_buffer: list[dict[str, str]] = []
    for item in buffer:
        message = _require_mapping(item, "buffer message")
        _require_exact_keys(message, _BUFFER_KEYS, "buffer message")
        role = message["role"]
        if not isinstance(role, str) or role not in _BUFFER_ROLES:
            raise ContractViolation("buffer message has an unsupported role")
        normalized_buffer.append(
            {
                "role": role,
                "content": normalize_required_text(message["content"], "message content"),
            }
        )
    return normalized_context, normalized_buffer


# Claude(Bedrock)가 받는 이미지 미디어 타입. gif/webp도 되지만 데모는 흔한 둘만 허용.
_ALLOWED_IMAGE_MEDIA_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/gif", "image/webp"}
)
# 프론트는 원본을 그대로 보낸다(리사이즈는 서버 image_service가 한다). 원본 허용 상한을
# 넉넉히 둔다: base64 약 20MB ≈ 원본 약 15MB. 이 1차 관문만 넘으면 서버가 축소해 Bedrock에 맞춘다.
_MAX_IMAGE_BASE64_CHARS = 20_000_000


def validate_image_attachment(media_type: Any, data: Any) -> dict[str, str]:
    """학생 첨부 이미지를 검증해 {media_type, data(base64)} 로 정규화한다.

    data는 순수 base64거나 'data:image/...;base64,...' data URL을 허용한다.
    data URL이면 미디어 타입을 거기서 추출하고, media_type 인자가 함께 오면 일치해야 한다.
    실제 base64 유효성/디코딩은 검사하지 않는다(Bedrock이 거부하면 502로 처리).
    """
    if not isinstance(data, str) or not data.strip():
        raise ContractViolation("image data must be a non-empty string")
    raw = data.strip()

    extracted_type: str | None = None
    if raw.startswith("data:"):
        header, _, payload = raw.partition(",")
        if not payload or ";base64" not in header:
            raise ContractViolation("image data URL must be base64 encoded")
        # header 예: data:image/jpeg;base64
        extracted_type = header[len("data:") :].split(";", 1)[0].strip().lower()
        raw = payload.strip()

    resolved_type = (
        extracted_type
        if extracted_type
        else (media_type.strip().lower() if isinstance(media_type, str) else None)
    )
    if extracted_type and isinstance(media_type, str) and media_type.strip():
        if extracted_type != media_type.strip().lower():
            raise ContractViolation("image media_type conflicts with data URL")

    if resolved_type not in _ALLOWED_IMAGE_MEDIA_TYPES:
        raise ContractViolation("image media_type is not supported")
    if not raw:
        raise ContractViolation("image data must not be empty")
    if len(raw) > _MAX_IMAGE_BASE64_CHARS:
        raise ContractViolation("image data exceeds the maximum size")

    return {"media_type": resolved_type, "data": raw}


def normalize_non_negative_int(value: Any, name: str, *, optional: bool = False) -> int | None:
    """bool을 제외한 0 이상의 정수만 허용한다."""
    if value is None and optional:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ContractViolation(f"{name} must be a non-negative integer")
    return value
