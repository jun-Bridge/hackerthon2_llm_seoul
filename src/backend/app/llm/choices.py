"""카테고리 고정 목록과 칩 병합 규칙.

호출하는 쪽: app/llm/tools.py (enum), app/services/session_service.py (merge_choices)
정본: requirements.md Category Taxonomy, docs/backend-design.md §7-1.2.
"""
from collections.abc import Sequence

CATEGORIES: list[str] = [
    "냉난방 / 공조",
    "위생 / 배관",
    "전기 / 설비",
    "영상 / 기자재",
    "공간 / 편의",
    "안전 / 보안",
    "기타",
]

# 카테고리별 흔한 증상 칩. CATEGORIES 순서와 키 순서를 맞춘다.
DETAIL_CHIPS: dict[str, list[str]] = {
    "냉난방 / 공조": ["너무 덥다", "너무 춥다", "소음", "작동 안 함"],
    "위생 / 배관": ["누수", "냄새", "막힘", "온수 안 나옴"],
    "전기 / 설비": ["조명 고장", "콘센트 고장", "정전", "설비 파손"],
    "영상 / 기자재": ["화면 안 나옴", "소리 안 남", "연결 안 됨", "기자재 파손"],
    "공간 / 편의": ["가구 파손", "공간 부족", "이용 불편", "편의시설 고장"],
    "안전 / 보안": ["출입문 고장", "잠금장치 고장", "미끄러움", "비상설비 고장"],
    "기타": ["시설 파손", "청결 문제", "이용 불편", "기타 문제"],
}

_SUPPORTED_MISSING = frozenset({"category", "location", "detail"})
_DIRECT_INPUT = "직접 입력"


def merge_choices(
    missing: str, model_choices: Sequence[str] | None, category: str | None
) -> list[str]:
    """고정 칩과 모델 제안을 정규화해 결정론적 최종 선택지를 만든다.

    ``category`` 요청에는 모델 값을 신뢰하지 않고 고정 taxonomy의 새 복사본만
    반환한다. 그 외 요청에는 알려진 카테고리의 고정 칩과 모델 제안을 순서대로
    합친 뒤 공백·빈 값·중복을 제거하고 ``직접 입력``을 마지막에 한 번 둔다.
    입력 리스트와 모듈의 고정 목록은 변경하지 않는다.
    """
    if missing not in _SUPPORTED_MISSING:
        raise ValueError("missing has an unsupported value")

    if missing == "category":
        return list(CATEGORIES)

    if (
        model_choices is not None
        and (
            isinstance(model_choices, (str, bytes))
            or not isinstance(model_choices, Sequence)
        )
    ):
        raise ValueError("model_choices must be a sequence or None")

    candidates = [*DETAIL_CHIPS.get(category, ()), *(model_choices or ())]
    merged: list[str] = []
    seen: set[str] = set()

    for candidate in candidates:
        if not isinstance(candidate, str):
            raise ValueError("choice items must be strings")
        normalized = candidate.strip()
        if not normalized or normalized == _DIRECT_INPUT or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)

    merged.append(_DIRECT_INPUT)
    return merged
