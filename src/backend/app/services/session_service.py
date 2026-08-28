"""대화 세션 조율. llm·repo·session(Redis)을 Service에서 한데 엮는다.

호출하는 쪽: app/api/routes/session.py
정본: docs/backend-design.md §7, §7-1, §7-2.
"""
from collections.abc import Mapping
from typing import Any

from app.core.errors import (
    ConversationStuckError,
    DomainError,
    DraftNotCompleteError,
    SessionClosedError,
    TurnInProgressError,
)
from app.llm import client as llm_client
from app.llm.choices import CATEGORIES, merge_choices
from app.llm.types import CompactResult, RefineResult, Usage
from app.repo import (
    bedrock_log_repo,
    chat_session_repo,
    complaint_repo,
    conversation_repo,
    pool,
)
from app.schemas.session import (
    ConversationTurn,
    RefinedPreview,
    RefineResultOut,
    SessionDetailOut,
    SessionSummaryOut,
    SubmitOut,
)
from app.services._mappers import (
    ServiceContractError,
    conversation_turn_from_row,
    session_summary_from_row,
)
from app.session import chip_state, compact_lock, turn_lock

_REQUIRED_REFINED_FIELDS = (
    "category",
    "location",
    "refined_title",
    "refined_body",
)

# 실측 전 보수적 기본값. 각 DB row를 한 message로 센다.
_MAX_SESSION_MESSAGES = 100
_COMPACT_TRIGGER_MESSAGES = 16
_COMPACT_KEEP_RECENT_MESSAGES = 8


def _validated_refined_payload(value: Any) -> dict[str, str]:
    """DB/LLM의 refined 값을 접수용 4개 필드로 엄격히 제한한다."""
    if not isinstance(value, Mapping):
        raise ServiceContractError("refined_json must be a mapping")

    result: dict[str, str] = {}
    for field in _REQUIRED_REFINED_FIELDS:
        item = value.get(field)
        if not isinstance(item, str) or not item.strip():
            raise ServiceContractError(f"refined_json field is invalid: {field}")
        result[field] = item
    if result["category"] not in CATEGORIES:
        raise ServiceContractError("refined_json category is outside the canonical taxonomy")
    return result


def _normalize_message(text: Any) -> str:
    if not isinstance(text, str):
        raise DomainError("메시지는 문자열이어야 합니다.")
    normalized = text.strip()
    if not normalized:
        raise DomainError("메시지를 입력해 주세요.")
    if len(normalized) > 2000:
        raise DomainError("메시지는 2000자 이하여야 합니다.")
    return normalized


def _require_open_session(session: Mapping[str, Any]) -> None:
    if session.get("complaint_id") is not None:
        raise SessionClosedError("이미 접수된 세션입니다.")


def _buffer_after_boundary(
    turns: list[Mapping[str, Any]], compacted_upto: int | None
) -> list[dict[str, str]]:
    buffer: list[dict[str, str]] = []
    for turn in turns:
        turn_id = turn.get("id")
        role = turn.get("role")
        content = turn.get("content")
        if isinstance(turn_id, bool) or not isinstance(turn_id, int) or turn_id <= 0:
            raise ServiceContractError("conversation row id is invalid")
        if compacted_upto is not None and turn_id <= compacted_upto:
            continue
        if role not in {"student", "assistant"}:
            raise ServiceContractError("conversation row role is invalid")
        if not isinstance(content, str) or not content.strip():
            raise ServiceContractError("conversation row content is invalid")
        buffer.append({"role": role, "content": content})
    return buffer


def _add_bedrock_log(
    conn: Any,
    school_id: int,
    is_complete: bool,
    usage: Usage,
) -> None:
    bedrock_log_repo.add(
        conn,
        school_id=school_id,
        model_id=usage.model_id,
        is_complete=is_complete,
        latency_ms=usage.latency_ms,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        error=usage.error,
    )


def _current_category(
    session: Mapping[str, Any], turns: list[Mapping[str, Any]]
) -> str | None:
    category = session.get("category")
    if category in CATEGORIES:
        return category
    for turn in reversed(turns):
        if turn.get("role") == "student":
            content = turn.get("content")
            if isinstance(content, str) and content.strip() in CATEGORIES:
                return content.strip()
    return None


def _question_with_examples(question: str, choices: list[str], repeat_count: int) -> str:
    if repeat_count < 2:
        return question
    examples = [choice for choice in choices if choice != "직접 입력"][:3]
    if not examples:
        return question
    return f"{question}\n(예: {', '.join(examples)})"


def _preview_from_payload(payload: Mapping[str, Any]) -> RefinedPreview:
    return RefinedPreview(**_validated_refined_payload(payload))


def _replay_duplicate(
    turns: list[Mapping[str, Any]], session_id: int, text: str
) -> RefineResultOut | None:
    """직전 동일 학생 발화에 저장된 assistant 결과가 있으면 그대로 재사용한다."""
    student_index: int | None = None
    for index in range(len(turns) - 1, -1, -1):
        if turns[index].get("role") == "student":
            student_index = index
            break
    if student_index is None or turns[student_index].get("content") != text:
        return None
    if student_index + 1 >= len(turns):
        return None

    assistant = turns[student_index + 1]
    if assistant.get("role") != "assistant":
        return None
    refined_json = assistant.get("refined_json")
    if refined_json is not None:
        return RefineResultOut(
            is_complete=True,
            preview=_preview_from_payload(refined_json),
        )

    choices = assistant.get("choices")
    content = assistant.get("content")
    if not isinstance(choices, list) or not isinstance(content, str):
        return None
    if any(not isinstance(choice, str) or not choice.strip() for choice in choices):
        raise ServiceContractError("stored assistant choices are invalid")
    state = chip_state.get_state(session_id) or {}
    missing = state.get("step")
    if missing not in {"category", "location", "detail"}:
        missing = None
    return RefineResultOut(
        is_complete=False,
        follow_up_question=content,
        choices=list(choices),
        missing=missing,
    )


def create_session(user_id: int, school_id: int) -> int:
    """새 대화 세션. 빈 세션이 이미 있으면 재사용한다."""
    with pool.transaction() as conn:
        return chat_session_repo.get_or_reuse_empty(conn, user_id, school_id)


def list_sessions(user_id: int) -> list[SessionSummaryOut]:
    """메시지가 있는 과거 대화를 최신순으로 반환한다."""
    with pool.transaction() as conn:
        rows = chat_session_repo.list_by_user(conn, user_id)
        return [session_summary_from_row(row) for row in rows]


def get_session(session_id: int, user_id: int) -> SessionDetailOut:
    """DB 정본과 Redis 캐시로 세션 메타·step·마지막 확정안을 복원한다."""
    with pool.transaction() as conn:
        session = chat_session_repo.require_owner(conn, session_id, user_id)
        turns = conversation_repo.list_by_session(conn, session_id)
        if not isinstance(turns, list):
            raise ServiceContractError("conversation rows must be a list")

    latest_assistant: Mapping[str, Any] | None = None
    refined_json: Mapping[str, Any] | None = None
    for turn in reversed(turns):
        if latest_assistant is None and turn.get("role") == "assistant":
            latest_assistant = turn
        candidate = turn.get("refined_json")
        if refined_json is None and candidate is not None:
            if not isinstance(candidate, Mapping):
                raise ServiceContractError("stored refined_json is invalid")
            refined_json = candidate
        if latest_assistant is not None and refined_json is not None:
            break

    preview = _preview_from_payload(refined_json) if refined_json is not None else None
    state = chip_state.get_state(session_id) or {}
    step = state.get("step")
    if step not in {"category", "location", "detail", "confirm"}:
        if preview is not None:
            step = "confirm"
        elif (
            latest_assistant is not None
            and latest_assistant.get("choices") == list(CATEGORIES)
        ):
            step = "category"
        else:
            step = None

    # 지금 보여줄 칩 = 마지막 assistant 턴의 choices (api-contract #8-2).
    # 저장된 값이 리스트가 아니면(예: NULL) 칩 없음(None)으로 둔다.
    choices: list[str] | None = None
    if latest_assistant is not None:
        stored_choices = latest_assistant.get("choices")
        if isinstance(stored_choices, list):
            choices = [str(c) for c in stored_choices]

    return SessionDetailOut(
        id=session["id"],
        title=session.get("title"),
        category=session.get("category"),
        complaint_id=session.get("complaint_id"),
        step=step,
        choices=choices,
        preview=preview,
    )


def get_conversation(session_id: int, user_id: int) -> list[ConversationTurn]:
    """작성 중·접수 후를 포함한 세션 대화 전체를 소유자에게 시간순 반환한다."""
    with pool.transaction() as conn:
        chat_session_repo.require_owner(conn, session_id, user_id)
        rows = conversation_repo.list_by_session(conn, session_id)
        return [conversation_turn_from_row(row) for row in rows]


def send_message(session_id: int, user_id: int, text: str) -> RefineResultOut:
    """학생 발화 한 턴을 저장하고 DB 연결 없이 LLM을 호출해 결과를 반영한다."""
    normalized_text = _normalize_message(text)

    # 존재·소유·종료 여부를 lock 획득 전에 빠르게 확인한다.
    with pool.transaction() as conn:
        initial_session = chat_session_repo.require_owner(conn, session_id, user_id)
        _require_open_session(initial_session)

    if not turn_lock.acquire(session_id):
        raise TurnInProgressError("이전 메시지를 처리하고 있습니다.")

    try:
        # lock 대기 사이 상태가 바뀔 수 있으므로 transaction 안에서 다시 확인한다.
        with pool.transaction() as conn:
            session = chat_session_repo.require_owner(conn, session_id, user_id)
            _require_open_session(session)
            turns = conversation_repo.list_by_session(conn, session_id)
            if not isinstance(turns, list):
                raise ServiceContractError("conversation rows must be a list")

            replay = _replay_duplicate(turns, session_id, normalized_text)
            if replay is not None:
                return replay
            if len(turns) >= _MAX_SESSION_MESSAGES:
                raise ConversationStuckError(
                    "대화가 너무 길어 새 대화에서 다시 시작해야 합니다."
                )

            student_turn_id = conversation_repo.add_turn(
                conn,
                session_id,
                "student",
                normalized_text,
            )
            turns_with_student: list[Mapping[str, Any]] = [
                *turns,
                {
                    "id": student_turn_id,
                    "role": "student",
                    "content": normalized_text,
                    "choices": None,
                    "refined_json": None,
                },
            ]
            compacted_upto = session.get("compacted_upto")
            if (
                compacted_upto is not None
                and (
                    isinstance(compacted_upto, bool)
                    or not isinstance(compacted_upto, int)
                    or compacted_upto <= 0
                )
            ):
                raise ServiceContractError("compacted_upto is invalid")
            context = session.get("context")
            if context is not None and (
                not isinstance(context, str) or not context.strip()
            ):
                raise ServiceContractError("session context is invalid")
            buffer = _buffer_after_boundary(turns_with_student, compacted_upto)
            category = _current_category(session, turns_with_student)
            school_id = session.get("school_id")
            if isinstance(school_id, bool) or not isinstance(school_id, int):
                raise ServiceContractError("session school_id is invalid")

        # Bedrock 호출 중에는 pool connection을 보유하지 않는다.
        try:
            result = llm_client.refine(context, buffer)
        except llm_client.BedrockError as exc:
            with pool.transaction() as conn:
                _add_bedrock_log(conn, school_id, False, exc.usage)
            raise

        if not isinstance(result, RefineResult):
            raise ServiceContractError("llm.refine returned an invalid result")

        if not result.is_complete:
            choices = merge_choices(result.missing, result.choices, category)
            repeat_count = chip_state.bump_if_same(session_id, result.missing)
            question = _question_with_examples(
                result.question,
                choices,
                repeat_count,
            )
            with pool.transaction() as conn:
                _add_bedrock_log(conn, school_id, False, result.usage)
                conversation_repo.add_turn(
                    conn,
                    session_id,
                    "assistant",
                    question,
                    choices=choices,
                )
                # 메타가 바뀌지 않아도 updated_at을 갱신해 목록 최신순을 유지한다.
                chat_session_repo.update_meta(conn, session_id)
            if repeat_count >= 4:
                raise ConversationStuckError("같은 질문이 반복되어 대화를 진행할 수 없습니다.")
            return RefineResultOut(
                is_complete=False,
                follow_up_question=question,
                choices=choices,
                missing=result.missing,
            )

        refined = _validated_refined_payload(
            {
                "category": result.category,
                "location": result.location,
                "refined_title": result.refined_title,
                "refined_body": result.refined_body,
            }
        )
        previous_title = session.get("title")
        previous_category = session.get("category")
        title_update = (
            None
            if session.get("is_manual_title") or result.session_title == previous_title
            else result.session_title
        )
        category_update = (
            None if result.category == previous_category else result.category
        )
        assistant_content = "민원 내용을 정리했습니다. 아래 확정안을 확인해 주세요."
        with pool.transaction() as conn:
            _add_bedrock_log(conn, school_id, True, result.usage)
            conversation_repo.add_turn(
                conn,
                session_id,
                "assistant",
                assistant_content,
                refined_json=refined,
            )
            chat_session_repo.update_meta(
                conn,
                session_id,
                title=title_update,
                category=category_update,
            )
        chip_state.set_state(session_id, "confirm", 0)
        return RefineResultOut(
            is_complete=True,
            preview=_preview_from_payload(refined),
            title=title_update,
            category=category_update,
        )
    finally:
        turn_lock.release(session_id)


def submit(session_id: int, user_id: int) -> SubmitOut:
    """저장된 마지막 확정안만 사용해 한 트랜잭션으로 접수한다."""
    with pool.transaction() as conn:
        initial_session = chat_session_repo.require_owner(conn, session_id, user_id)
        _require_open_session(initial_session)

    if not turn_lock.acquire(session_id):
        raise TurnInProgressError("이전 메시지를 처리하고 있습니다.")
    try:
        with pool.transaction() as conn:
            session = chat_session_repo.require_owner(conn, session_id, user_id)
            _require_open_session(session)
            raw_refined = conversation_repo.get_last_refined(conn, session_id)
            if raw_refined is None:
                raise DraftNotCompleteError("확정된 민원 내용이 없습니다.")
            refined = _validated_refined_payload(raw_refined)

            complaint_id = complaint_repo.create(
                conn,
                school_id=session["school_id"],
                submitted_by_user_id=session["user_id"],
                category=refined["category"],
                location=refined["location"],
                refined_title=refined["refined_title"],
                refined_body=refined["refined_body"],
            )
            conversation_repo.link_to_complaint(conn, session_id, complaint_id)
            chat_session_repo.mark_submitted(conn, session_id, complaint_id)
            next_session_id = chat_session_repo.create(
                conn,
                session["user_id"],
                session["school_id"],
            )
            return SubmitOut(
                complaint_id=complaint_id,
                next_session_id=next_session_id,
            )
    finally:
        turn_lock.release(session_id)


def compact(session_id: int) -> None:
    """미압축 구간을 고정해 누적 압축하고 CAS로 경계를 전진시킨다.

    실패는 현재 대화 응답에 영향을 주지 않는다. Bedrock 실패는 Usage만 남기고
    기존 context/title/compacted_upto를 유지해 다음 호출에서 재시도한다.
    """
    if not compact_lock.acquire(session_id):
        return
    try:
        with pool.transaction() as conn:
            session = chat_session_repo.get(conn, session_id)
            if session is None:
                return
            rows = conversation_repo.list_by_session(conn, session_id)
            if not isinstance(rows, list):
                raise ServiceContractError("conversation rows must be a list")

            previous_upto = session.get("compacted_upto")
            if previous_upto is not None and (
                isinstance(previous_upto, bool)
                or not isinstance(previous_upto, int)
                or previous_upto <= 0
            ):
                raise ServiceContractError("compacted_upto is invalid")
            pending = [
                row
                for row in rows
                if previous_upto is None or row.get("id", 0) > previous_upto
            ]
            if len(pending) <= _COMPACT_TRIGGER_MESSAGES:
                return

            target_rows = pending[:-_COMPACT_KEEP_RECENT_MESSAGES]
            if not target_rows:
                return
            messages = _buffer_after_boundary(target_rows, None)
            target_upto = target_rows[-1].get("id")
            if isinstance(target_upto, bool) or not isinstance(target_upto, int):
                raise ServiceContractError("compact target id is invalid")

            previous_context = session.get("context")
            if previous_context is not None and (
                not isinstance(previous_context, str) or not previous_context.strip()
            ):
                raise ServiceContractError("session context is invalid")
            school_id = session.get("school_id")
            if isinstance(school_id, bool) or not isinstance(school_id, int):
                raise ServiceContractError("session school_id is invalid")
            stored_title = session.get("title")
            is_manual_title = bool(session.get("is_manual_title"))

        try:
            result = llm_client.compact(previous_context, messages)
        except llm_client.BedrockError as exc:
            with pool.transaction() as conn:
                _add_bedrock_log(conn, school_id, False, exc.usage)
            return
        if not isinstance(result, CompactResult):
            raise ServiceContractError("llm.compact returned an invalid result")

        next_title = stored_title if is_manual_title else result.title
        with pool.transaction() as conn:
            _add_bedrock_log(conn, school_id, False, result.usage)
            chat_session_repo.update_compacted(
                conn,
                session_id=session_id,
                context=result.context,
                title=next_title,
                compacted_upto=target_upto,
                expected_prev_upto=previous_upto,
            )
    finally:
        compact_lock.release(session_id)
