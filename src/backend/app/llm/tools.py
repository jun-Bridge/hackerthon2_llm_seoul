"""Bedrock 도구 스키마. client.py 내부에서만 쓴다.

정본: docs/backend-design.md §7-1.1·§8.4.
tool_choice: {"type": "any"} 로 매 턴 둘 중 하나를 반드시 부르게 강제한다.
"""
from app.llm.choices import CATEGORIES

ASK_FOLLOWUP = {
    "name": "ask_followup",
    "description": (
        "카테고리·위치·상황 중 하나라도 확정할 수 없으면 이 도구를 부른다. "
        "추측해서 채우지 말고 반드시 되물어라."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "missing": {"type": "string", "enum": ["category", "location", "detail"]},
            "question": {
                "type": "string",
                "minLength": 1,
                "description": "학생에게 물을 한 문장",
            },
            "choices": {
                "type": "array",
                "items": {"type": "string", "minLength": 1},
                "minItems": 3,
                "maxItems": 5,
                "description": "고르기 쉬운 선택지 3~5개",
            },
        },
        "required": ["missing", "question", "choices"],
        "additionalProperties": False,
    },
}

CLASSIFY_AND_REFINE = {
    "name": "classify_and_refine_complaint",
    "description": "카테고리·위치·상황이 모두 확정될 때만 부른다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": CATEGORIES},  # enum으로 고정
            "location": {
                "type": "string",
                "minLength": 1,
                "description": "건물명/층/호실",
            },
            "refined_title": {
                "type": "string",
                "minLength": 1,
                "description": "공문서 제목, 30자 내외",
            },
            "refined_body": {
                "type": "string",
                "minLength": 1,
                "description": "현상/영향/요청 3단 구조",
            },
            "session_title": {
                "type": "string",
                "minLength": 1,
                "description": "사이드바용 짧은 제목",
            },
        },
        "required": ["category", "location", "refined_title", "refined_body", "session_title"],
        "additionalProperties": False,
    },
}
