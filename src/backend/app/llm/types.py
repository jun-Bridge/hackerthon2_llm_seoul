"""llm ↔ session_service 계약 타입. 이 dataclass가 정본 —
필드명을 바꾸면 session_service의 사용처가 깨지므로 여기만 고치면 타입 체커가 다 잡는다.
"""
from dataclasses import dataclass


@dataclass
class Usage:
    """Bedrock 호출 1건의 메타. session_service가 이걸 bedrock_logs에 적재한다.
    llm은 school_id를 모르므로 여기 담지 않는다 — 서비스가 채워 넣는다.
    """
    model_id: str
    latency_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None


@dataclass
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
    choices: list[str] | None = None    # 모델이 준 원본 선택지 (병합 전)

    # 충분한 경우
    category: str | None = None
    location: str | None = None
    refined_title: str | None = None
    refined_body: str | None = None
    session_title: str | None = None


@dataclass
class CompactResult:
    """compact()의 반환. 세션주제와 제목을 새로 만든 결과."""
    context: str
    title: str
    usage: Usage
