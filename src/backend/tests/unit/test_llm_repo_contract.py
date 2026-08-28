"""llm 모듈과 B(repo) 경계 계약 동기화 테스트.

llm은 repo/session을 직접 부르지 않고 서비스가 조립하지만, 경계에서 오가는
데이터 모양(Usage 필드, refined_json 키, buffer role/content, choices)이
어긋나면 통합이 깨진다. 여기서 그 정합을 못박아 회귀를 막는다.
"""
import inspect
from dataclasses import fields

from app.llm.types import Usage, RefineResult, CompactResult
from app.llm.choices import merge_choices, CATEGORIES
from app.repo import bedrock_log_repo, conversation_repo, chat_session_repo


def _params(fn):
    return set(inspect.signature(fn).parameters)


def test_usage_fields_map_to_bedrock_log_add():
    """Usage의 모든 필드가 bedrock_log_repo.add 파라미터에 존재해야 한다."""
    usage_fields = {f.name for f in fields(Usage)}  # model_id/latency_ms/tokens/error
    add_params = _params(bedrock_log_repo.add)
    missing = usage_fields - add_params
    assert not missing, f"add()에 없는 Usage 필드: {missing}"
    # 서비스가 채우는 두 값도 add가 받아야 한다.
    assert {"school_id", "is_complete"} <= add_params


def test_refine_complete_carries_complaint_fields():
    """확정 RefineResult가 complaint_repo.create에 필요한 4키를 모두 포함한다."""
    result_fields = {f.name for f in fields(RefineResult)}
    for key in ("category", "location", "refined_title", "refined_body"):
        assert key in result_fields
    # session_title은 세션 제목용 (민원엔 안 들어감) — 존재만 확인
    assert "session_title" in result_fields


def test_add_turn_accepts_choices_and_refined_json():
    """conversation_repo.add_turn이 되묻기 choices와 확정 refined_json을 둘 다 받는다."""
    params = _params(conversation_repo.add_turn)
    assert "choices" in params      # merge_choices() 결과(list[str]) 저장
    assert "refined_json" in params  # RefineResult 확정분(dict) 저장
    assert "role" in params and "content" in params


def test_compact_result_maps_to_update_compacted():
    """CompactResult(context/title)가 update_compacted 파라미터에 대응한다."""
    result_fields = {f.name for f in fields(CompactResult)}
    assert {"context", "title"} <= result_fields
    params = _params(chat_session_repo.update_compacted)
    assert {"context", "title", "compacted_upto", "expected_prev_upto"} <= params


def test_merge_choices_returns_plain_str_list_for_jsonb():
    """merge_choices 결과가 JSONB 저장 가능한 순수 str 리스트여야 한다."""
    out = merge_choices("detail", ["누수", "직접 입력", "누수"], "위생 / 배관")
    assert isinstance(out, list)
    assert all(isinstance(x, str) for x in out)
    assert out[-1] == "직접 입력"       # 항상 마지막 하나
    assert out.count("직접 입력") == 1   # 중복 제거
    # category 요청은 고정 7종을 그대로
    assert merge_choices("category", ["아무거나"], None) == CATEGORIES
