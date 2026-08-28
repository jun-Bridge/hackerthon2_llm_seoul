"""
BedrockClient — Bedrock Claude 호출, 도구 호출 처리, 로그 기록
"""

import json
import time
from datetime import datetime, timezone

import boto3
import botocore.exceptions
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import BedrockLog
from app.llm.prompts import SYSTEM_PROMPT, TOOL_DEFINITION


class BedrockClient:
    def __init__(self):
        kwargs: dict = {"service_name": "bedrock-runtime"}
        if settings.AWS_ACCESS_KEY_ID:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if settings.AWS_DEFAULT_REGION:
            kwargs["region_name"] = settings.AWS_DEFAULT_REGION
        self._client = boto3.client(**kwargs)

    def refine_complaint(
        self,
        conversation: list[dict],
        school_id: int,
        db: Session,
    ) -> dict:
        """
        대화 이력을 받아 AI 응답을 생성한다.

        Returns:
            되묻는 경우:
                {"is_complete": False, "follow_up_question": "...", "ai_message": "..."}
            확정안이 나온 경우:
                {"is_complete": True, "preview": {...}, "ai_message": "[정리 완료] ..."}
        """
        # Bedrock 메시지 형식으로 변환 (role: student→user, assistant→assistant)
        messages = []
        for turn in conversation:
            role = "user" if turn["role"] == "student" else "assistant"
            messages.append({"role": role, "content": turn["content"]})

        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": SYSTEM_PROMPT,
            "messages": messages,
            "tools": [TOOL_DEFINITION],
        }

        start = time.time()
        error_msg = None
        is_complete = False
        input_tokens = None
        output_tokens = None

        try:
            response = self._client.invoke_model(
                modelId=settings.BEDROCK_MODEL_ID,
                body=json.dumps(request_body),
            )
            latency_ms = int((time.time() - start) * 1000)
            body = json.loads(response["body"].read())

            # 토큰 사용량
            usage = body.get("usage", {})
            input_tokens = usage.get("input_tokens")
            output_tokens = usage.get("output_tokens")

            result = self._parse_response(body)
            is_complete = result["is_complete"]

        except botocore.exceptions.ClientError as exc:
            latency_ms = int((time.time() - start) * 1000)
            error_msg = str(exc)
            raise RuntimeError(f"Bedrock 호출 실패: {exc}") from exc
        finally:
            # 호출 로그 저장 (내용은 저장하지 않음)
            log = BedrockLog(
                school_id=school_id,
                model_id=settings.BEDROCK_MODEL_ID,
                is_complete=is_complete,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                error=error_msg,
            )
            db.add(log)
            db.commit()

        return result

    def _parse_response(self, body: dict) -> dict:
        """Bedrock 응답을 파싱해 결과 dict 반환."""
        content_blocks = body.get("content", [])
        stop_reason = body.get("stop_reason", "")

        # 도구 호출이 있으면 확정안 완성
        for block in content_blocks:
            if block.get("type") == "tool_use":
                tool_input = block.get("input", {})
                preview = {
                    "category": tool_input.get("category", "기타"),
                    "location": tool_input.get("location", ""),
                    "refined_title": tool_input.get("refined_title", ""),
                    "refined_body": tool_input.get("refined_body", ""),
                }
                ai_message = f"[정리 완료] {preview['refined_title']}"
                return {
                    "is_complete": True,
                    "preview": preview,
                    "ai_message": ai_message,
                    "refined_json": json.dumps(preview, ensure_ascii=False),
                }

        # 도구 호출 없으면 되묻는 텍스트 응답
        text = ""
        for block in content_blocks:
            if block.get("type") == "text":
                text += block.get("text", "")

        return {
            "is_complete": False,
            "follow_up_question": text,
            "ai_message": text,
            "refined_json": None,
        }
