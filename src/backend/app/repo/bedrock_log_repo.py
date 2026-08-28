"""Bedrock 호출 로그(bedrock_logs). 대회 심사(Requirement 5.1)용.

호출하는 쪽: app/services/session_service.py (llm이 아니라 서비스가 적재 — llm은 school_id를 모름)
정본: requirements.md 의 bedrock_logs 스키마.

주의: 프롬프트·응답 본문은 저장하지 않는다. 민원 내용이 로그에 중복되면
익명성 관리 대상이 두 곳으로 늘어난다. 저장하는 것은 "호출이 일어났다"는 사실과 메타뿐.
"""


def add(
    conn,
    school_id: int | None,
    model_id: str,
    is_complete: bool,
    latency_ms: int | None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    error: str | None = None,
) -> None:
    """호출 1건을 기록한다. is_complete는 도구 호출(확정)이 성사됐는지."""
    raise NotImplementedError


def list_recent(conn, school_id: int, limit: int = 50) -> list[dict]:
    """최근 호출 로그. 관리자 화면 GET /admin/bedrock-logs 용."""
    raise NotImplementedError
