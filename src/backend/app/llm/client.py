"""Bedrock 호출 캡슐화. 이 파일 밖에는 Bedrock 이야기가 없다.

호출하는 쪽: app/services/session_service.py
정본: docs/backend-design.md §8.

boto3.client('bedrock-runtime') — region_name 없이. Instance Profile이 자동 처리.
모델 id는 settings.llm_model_id (global. 프로필).
"""
from app.llm.types import CompactResult, RefineResult


def refine(context: str | None, buffer: list[dict]) -> RefineResult:
    """대화 맥락으로 Bedrock을 호출해 되묻기/확정을 판정한다.

    Args:
        context: 세션주제(압축된 맥락). system 필드에 넣는다 — messages에 끼우지 않는다.
        buffer: compacted_upto 이후 원문 대화. [{"role": "student"|"assistant", "content": str}, ...]
                Anthropic 포맷(user/assistant 교대)으로 변환하고, LLM 실패로
                user가 연속된 경우 합쳐 보낸다 (§8.3).

    Returns:
        RefineResult — is_complete로 두 경우를 가른다. tool_use 블록이 여럿이면 첫 번째만 쓴다.

    Raises:
        BedrockError: 호출 자체가 실패. AccessDenied는 재시도 안 함, Throttling만 1회 backoff.
                       실패해도 Usage(error=...)를 채워 서비스가 로그를 남기게 한다.
    """
    raise NotImplementedError


def compact(prev_context: str | None, messages: list[dict]) -> CompactResult:
    """이전 세션주제 + 밀려난 대화를 하나의 새 세션주제로 압축한다 (누적 압축).

    호출 전용 — 도구 없이 텍스트 응답만 받는다. 응답을 보낸 뒤 백그라운드로 돈다.
    확정된 항목을 요약이 반드시 담아야 한다 (COMPACT_PROMPT 참조).
    """
    raise NotImplementedError
