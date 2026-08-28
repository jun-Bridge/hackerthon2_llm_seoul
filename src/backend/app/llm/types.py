"""llm ↔ session_service 계약 타입. 이 dataclass가 정본 —
필드명을 바꾸면 session_service의 사용처가 깨지므로 여기만 고치면 타입 체커가 다 잡는다.
"""
from collections.abc import Sequence
from dataclasses import dataclass

from app.llm.validation import (
    ContractViolation,
    normalize_non_negative_int,
    normalize_optional_text,
    normalize_required_text,
    validate_ask_followup_payload,
    validate_compact_payload,
    validate_refined_payload,
)


class _FrozenChoices(tuple[str, ...]):
    """tuple 저장으로 list 기본 메서드를 통한 우회까지 차단한다."""

    def __new__(cls, values: Sequence[str]):
        return super().__new__(cls, values)

    def _blocked(self, *args, **kwargs):
        raise TypeError("choices are immutable")

    def __eq__(self, other):
        if isinstance(other, (list, tuple)):
            return tuple(self) == tuple(other)
        return NotImplemented

    __hash__ = tuple.__hash__
    __setitem__ = _blocked
    __delitem__ = _blocked
    append = _blocked
    clear = _blocked
    extend = _blocked
    insert = _blocked
    pop = _blocked
    remove = _blocked
    reverse = _blocked
    sort = _blocked


@dataclass(frozen=True)
class Usage:
    """Bedrock 호출 1건의 메타. session_service가 이걸 bedrock_logs에 적재한다.
    llm은 school_id를 모르므로 여기 담지 않는다 — 서비스가 채워 넣는다.
    """
    model_id: str
    latency_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "model_id", normalize_required_text(self.model_id, "model_id")
        )
        latency_ms = normalize_non_negative_int(self.latency_ms, "latency_ms")
        if latency_ms is None:  # optional=False이므로 방어적 확인
            raise ContractViolation("latency_ms is required")
        object.__setattr__(self, "latency_ms", latency_ms)
        object.__setattr__(
            self,
            "input_tokens",
            normalize_non_negative_int(
                self.input_tokens, "input_tokens", optional=True
            ),
        )
        object.__setattr__(
            self,
            "output_tokens",
            normalize_non_negative_int(
                self.output_tokens, "output_tokens", optional=True
            ),
        )
        object.__setattr__(
            self, "error", normalize_optional_text(self.error, "error")
        )


@dataclass(frozen=True)
class RefineResult:
    """refine()의 반환. is_complete로 두 경우를 가른다.

    is_complete=False (ask_followup을 부름):
        missing, question, choices 채움. preview 계열은 None.
    is_complete=True (classify_and_refine을 부름):
        category/location/refined_title/refined_body/session_title 채움.
    """
    is_complete: bool
    usage: Usage

    # 부족한 경우
    missing: str | None = None          # "category" | "location" | "detail"
    question: str | None = None
    choices: Sequence[str] | None = None  # 모델 선택지의 불변 사본 (병합 전)

    # 충분한 경우
    category: str | None = None
    location: str | None = None
    refined_title: str | None = None
    refined_body: str | None = None
    session_title: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.is_complete, bool):
            raise ContractViolation("is_complete must be a boolean")
        if not isinstance(self.usage, Usage):
            raise ContractViolation("usage must be a Usage instance")

        if self.is_complete:
            if any(
                value is not None
                for value in (self.missing, self.question, self.choices)
            ):
                raise ContractViolation(
                    "complete result must not contain follow-up fields"
                )
            payload = validate_refined_payload(
                {
                    "category": self.category,
                    "location": self.location,
                    "refined_title": self.refined_title,
                    "refined_body": self.refined_body,
                    "session_title": self.session_title,
                }
            )
            object.__setattr__(self, "category", payload["category"])
            object.__setattr__(self, "location", payload["location"])
            object.__setattr__(self, "refined_title", payload["refined_title"])
            object.__setattr__(self, "refined_body", payload["refined_body"])
            object.__setattr__(self, "session_title", payload["session_title"])
            return

        if any(
            value is not None
            for value in (
                self.category,
                self.location,
                self.refined_title,
                self.refined_body,
                self.session_title,
            )
        ):
            raise ContractViolation(
                "follow-up result must not contain completed fields"
            )
        payload = validate_ask_followup_payload(
            {
                "missing": self.missing,
                "question": self.question,
                "choices": self.choices,
            }
        )
        object.__setattr__(self, "missing", payload["missing"])
        object.__setattr__(self, "question", payload["question"])
        object.__setattr__(self, "choices", _FrozenChoices(payload["choices"]))


@dataclass(frozen=True)
class CompactResult:
    """compact()의 반환. 세션주제와 제목을 새로 만든 결과."""
    context: str
    title: str
    usage: Usage

    def __post_init__(self) -> None:
        if not isinstance(self.usage, Usage):
            raise ContractViolation("usage must be a Usage instance")
        payload = validate_compact_payload(
            {"context": self.context, "title": self.title}
        )
        object.__setattr__(self, "context", payload["context"])
        object.__setattr__(self, "title", payload["title"])
