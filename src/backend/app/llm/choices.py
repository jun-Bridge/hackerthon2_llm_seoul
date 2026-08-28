"""카테고리 고정 목록과 칩 병합 규칙.

호출하는 쪽: app/llm/tools.py (enum), app/services/session_service.py (merge_choices)
정본: requirements.md Category Taxonomy, docs/backend-design.md §7-1.2.
"""

CATEGORIES: list[str] = [
    "냉난방 / 공조",
    "위생 / 배관",
    "전기 / 설비",
    "영상 / 기자재",
    "공간 / 편의",
    "안전 / 보안",
    "기타",
]

# 카테고리별 흔한 증상 칩. missing='detail'이고 카테고리가 정해졌을 때 앞에 붙인다.
DETAIL_CHIPS: dict[str, list[str]] = {
    # 예시 — 실제 문구는 팀이 채운다
    "냉난방 / 공조": ["너무 덥다", "너무 춥다", "소음", "작동 안 함"],
    "위생 / 배관": ["누수", "냄새", "막힘", "온수 안 나옴"],
    # ... 나머지 카테고리
}


def merge_choices(missing: str, model_choices: list[str] | None, category: str | None) -> list[str]:
    """고정 칩과 모델 제안을 합쳐 최종 선택지를 만든다.

    규칙 (backend-design.md §7-1.2):
    - missing == 'category': 고정 7종(CATEGORIES)만 쓴다. 모델 것을 무시한다 —
      complaints.category가 정확히 7개 중 하나여야 하는데 모델이 "냉난방 문제"처럼
      살짝 다른 문구를 주면 매칭이 깨진다.
    - 그 외: 고정 칩(DETAIL_CHIPS[category])을 앞에, 모델 제안을 뒤에, 끝에 "직접 입력".
    - category가 아직 없으면 고정 칩을 붙일 근거가 없으니 모델 것만 쓴다.
    """
    raise NotImplementedError
