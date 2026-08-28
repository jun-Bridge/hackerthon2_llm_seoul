"""C 소유 Service 전체 핵심 불변식의 간결한 외부 의존성 없는 검사.

실행: python -B -m app.services.adversarial_checks
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import sys
import types
from typing import Callable, get_args


def _install_missing_dependency_stubs() -> None:
    """로컬 패키지가 없을 때만 repo import용 최소 모듈을 검사 프로세스에 둔다."""
    try:
        import psycopg  # noqa: F401
    except ModuleNotFoundError:
        pkg = types.ModuleType("psycopg")
        pkg.__path__ = []
        rows = types.ModuleType("psycopg.rows")
        rows.dict_row = object()
        types_pkg = types.ModuleType("psycopg.types")
        types_pkg.__path__ = []
        json_mod = types.ModuleType("psycopg.types.json")
        json_mod.Jsonb = lambda value: value
        pool_mod = types.ModuleType("psycopg_pool")
        pool_mod.ConnectionPool = type("ConnectionPool", (), {})
        sys.modules.update(
            {
                "psycopg": pkg,
                "psycopg.rows": rows,
                "psycopg.types": types_pkg,
                "psycopg.types.json": json_mod,
                "psycopg_pool": pool_mod,
            }
        )

    try:
        import pydantic_settings  # noqa: F401
    except ModuleNotFoundError:
        module = types.ModuleType("pydantic_settings")
        module.BaseSettings = type("BaseSettings", (), {})
        sys.modules["pydantic_settings"] = module



    try:
        import redis  # noqa: F401
    except ModuleNotFoundError:
        module = types.ModuleType("redis")
        redis_type = type("Redis", (), {"from_url": classmethod(lambda cls, *a, **k: cls())})
        module.Redis = redis_type
        sys.modules["redis"] = module

_install_missing_dependency_stubs()

from app.core.errors import (  # noqa: E402
    ConversationStuckError,
    DomainError,
    DraftNotCompleteError,
    HoldReasonRequiredError,
    InvalidTransitionError,
    NotFoundError,
    NotOwnerError,
    SessionClosedError,
    TurnInProgressError,
)
from app.llm.types import CompactResult, RefineResult, Usage  # noqa: E402
from app.schemas.session import Category, SessionDetailOut  # noqa: E402
from app.services import complaint_service as cs  # noqa: E402
from app.services import session_service as ss  # noqa: E402
from app.services._mappers import (  # noqa: E402
    ServiceContractError,
    complaint_from_row,
    conversation_turn_from_row,
)

_NOW = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)


class Checks:
    def __init__(self) -> None:
        self.count = 0

    def true(self, condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)
        self.count += 1

    def raises(self, error: type[BaseException], call: Callable[[], object]) -> BaseException:
        try:
            call()
        except error as exc:
            self.count += 1
            return exc
        raise AssertionError(f"expected {error.__name__}")


class FakeTransactions:
    def __init__(self) -> None:
        self.conn = object()
        self.events: list[str] = []
        self.active = 0

    @contextmanager
    def transaction(self):
        self.events.append("begin")
        self.active += 1
        try:
            yield self.conn
        except Exception:
            self.events.append("rollback")
            raise
        else:
            self.events.append("commit")
        finally:
            self.active -= 1


def _complaint_row(**updates):
    row = {
        "id": 5,
        "category": "위생 / 배관",
        "location": "본관 2층",
        "refined_title": "세면대 누수",
        "refined_body": "세면대에서 물이 샙니다.",
        "status": "확인",
        "created_at": _NOW,
        "confirmed_at": _NOW,
        "submitted_by_user_id": 3,
        "school_id": 7,
    }
    row.update(updates)
    return row


def _comment_row():
    return {"id": 2, "content": "점검 중", "is_hold_reason": True, "created_at": _NOW}


def _check_mapping_boundary(checks: Checks) -> None:
    result = complaint_from_row(_complaint_row(), 3, [_comment_row()])
    dumped = result.model_dump()
    checks.true(result.is_mine, "is_mine 계산 실패")
    checks.true("submitted_by_user_id" not in dumped and "school_id" not in dumped, "식별자 노출")
    admin = complaint_from_row(_complaint_row(), None, [])
    checks.true(not admin.is_mine, "관리자 응답 is_mine 오류")
    checks.raises(ServiceContractError, lambda: complaint_from_row(_complaint_row(id=True), 3, []))
    checks.raises(ServiceContractError, lambda: complaint_from_row(_complaint_row(status="철회"), 3, []))
    checks.raises(
        ServiceContractError,
        lambda: conversation_turn_from_row(
            {"role": "student", "content": "누수", "choices": ["공격"], "created_at": _NOW}
        ),
    )


def _check_phase1(checks: Checks, tx: FakeTransactions) -> None:
    ss.pool.transaction = tx.transaction
    calls: list[tuple] = []
    ss.chat_session_repo.get_or_reuse_empty = lambda c, u, s: (
        calls.append(("create_session", c, u, s)) or 9
    )
    ss.chat_session_repo.list_by_user = lambda c, u: [
        {"id": 1, "title": None, "category": None, "complaint_id": None,
         "withdrawn": False, "updated_at": _NOW}
    ]
    checks.true(ss.create_session(3, 7) == 9, "세션 생성 실패")
    checks.true(ss.list_sessions(3)[0].id == 1, "세션 목록 실패")
    checks.true(calls == [("create_session", tx.conn, 3, 7)], "세션 repo 인자 오류")

    cs.pool.transaction = tx.transaction
    cs.complaint_repo.list = lambda c, s, status: [
        _complaint_row()
    ] if (c, s, status) == (tx.conn, 7, "확인") else []
    cs.comment_repo.list_hold_reasons = lambda c, i: [_comment_row()]
    listed = cs.list_complaints(7, 3, "확인")
    checks.true(len(listed) == 1 and listed[0].is_mine, "민원 목록/scope 실패")

    cs.comment_repo.list = lambda c, i: [_comment_row()]
    cs.complaint_repo.get = lambda c, i, s: _complaint_row() if (i, s) == (5, 7) else None
    checks.true(cs.get_complaint(5, 7, 3).id == 5, "민원 상세 실패")
    checks.raises(NotFoundError, lambda: cs.get_complaint(5, 8, 3))

    conversation_calls: list[int] = []
    cs.conversation_repo.list_by_complaint = lambda c, i: conversation_calls.append(i) or [
        {"role": "student", "content": "누수", "choices": None, "created_at": _NOW}
    ]
    checks.true(cs.get_conversation(5, 7)[0].role == "student", "원문 조회 실패")
    checks.raises(NotFoundError, lambda: cs.get_conversation(5, 8))
    checks.true(conversation_calls == [5], "학교 scope 전에 원문 조회")

    cs.bedrock_log_repo.list_recent = lambda c, s, limit: []
    checks.raises(DomainError, lambda: cs.get_bedrock_logs(7, 0))


def _check_submit(checks: Checks, tx: FakeTransactions) -> None:
    calls: list[tuple] = []
    lock_events: list[tuple[str, int]] = []
    ss.turn_lock.acquire = lambda sid: lock_events.append(("acquire", sid)) or True
    ss.turn_lock.release = lambda sid: lock_events.append(("release", sid))
    session = {"id": 11, "user_id": 3, "school_id": 7, "complaint_id": None}
    ss.chat_session_repo.require_owner = lambda c, sid, uid: session.copy()
    ss.conversation_repo.get_last_refined = lambda c, sid: {
        "category": "위생 / 배관", "location": "본관",
        "refined_title": "누수", "refined_body": "물이 샙니다.",
    }
    ss.complaint_repo.create = lambda c, **values: calls.append(("complaint", c, values)) or 21
    ss.conversation_repo.link_to_complaint = lambda c, sid, cid: calls.append(("link", c, sid, cid))
    ss.chat_session_repo.mark_submitted = lambda c, sid, cid: calls.append(("mark", c, sid, cid))
    ss.chat_session_repo.create = lambda c, uid, school: calls.append(("next", c, uid, school)) or 12

    out = ss.submit(11, 3)
    checks.true((out.complaint_id, out.next_session_id) == (21, 12), "submit 응답 오류")
    checks.true(lock_events[:2] == [("acquire", 11), ("release", 11)], "submit lock 해제 오류")
    checks.true([item[0] for item in calls] == ["complaint", "link", "mark", "next"], "submit 순서 오류")
    checks.true(calls[0][2]["school_id"] == 7 and calls[0][2]["submitted_by_user_id"] == 3, "요청값 위조 방지 실패")

    ss.chat_session_repo.require_owner = lambda c, sid, uid: {**session, "complaint_id": 21}
    checks.raises(SessionClosedError, lambda: ss.submit(11, 3))
    ss.chat_session_repo.require_owner = lambda c, sid, uid: session.copy()
    ss.conversation_repo.get_last_refined = lambda c, sid: None
    checks.raises(DraftNotCompleteError, lambda: ss.submit(11, 3))


def _check_transitions(checks: Checks, tx: FakeTransactions) -> None:
    row = _complaint_row()
    cs.complaint_repo.get = lambda c, i, s: row.copy() if s == 7 else None
    cs.comment_repo.list = lambda c, i: [_comment_row()]
    cs.complaint_repo.confirm = lambda c, i, s: False
    checks.true(cs.open_detail(5, 7).id == 5, "confirm 멱등 상세 실패")

    cs.complaint_repo.accept = lambda c, i, s: False
    checks.raises(InvalidTransitionError, lambda: cs.accept(5, 7))
    cs.complaint_repo.resolve = lambda c, i, s: True
    checks.true(cs.resolve(5, 7).is_mine is False, "관리자 resolve 응답 실패")
    cs.complaint_repo.reject = lambda c, i, s: True
    checks.true(cs.reject(5, 7).id == 5, "reject 실패")

    before = len(tx.events)
    checks.raises(HoldReasonRequiredError, lambda: cs.hold(5, 7, 99, "   "))
    checks.true(len(tx.events) == before, "빈 보류 사유가 DB를 호출함")

    added: list[tuple] = []
    cs.complaint_repo.hold = lambda c, i, s: True
    cs.comment_repo.add = lambda *args, **kwargs: added.append((args, kwargs)) or 2
    checks.true(cs.hold(5, 7, 99, "  부품 대기  ").id == 5, "hold 실패")
    checks.true(added[0][0][3] == "부품 대기" and added[0][1]["is_hold_reason"], "보류 사유 저장 오류")

    cs.comment_repo.add = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("db"))
    checks.raises(RuntimeError, lambda: cs.hold(5, 7, 99, "사유"))
    checks.true(tx.events[-1] == "rollback", "보류 코멘트 실패 rollback 누락")


def _check_send_message(checks: Checks, tx: FakeTransactions) -> None:
    ss.pool.transaction = tx.transaction
    session = {
        "id": 11,
        "user_id": 3,
        "school_id": 7,
        "complaint_id": None,
        "title": None,
        "category": "위생 / 배관",
        "is_manual_title": False,
        "context": "이전 요약",
        "compacted_upto": 1,
    }
    ss.chat_session_repo.require_owner = lambda c, sid, uid: session.copy()
    lock_events: list[tuple[str, int]] = []
    ss.turn_lock.acquire = lambda sid: lock_events.append(("acquire", sid)) or True
    ss.turn_lock.release = lambda sid: lock_events.append(("release", sid))
    ss.conversation_repo.list_by_session = lambda c, sid: [
        {"id": 1, "role": "assistant", "content": "압축된 과거", "choices": None, "refined_json": None}
    ]

    stored: list[tuple] = []
    next_id = iter(range(2, 20))
    ss.conversation_repo.add_turn = lambda *args, **kwargs: (
        stored.append((args, kwargs)) or next(next_id)
    )
    logs: list[dict] = []
    ss.bedrock_log_repo.add = lambda c, **kwargs: logs.append(kwargs)
    meta: list[tuple] = []
    ss.chat_session_repo.update_meta = lambda *args, **kwargs: meta.append((args, kwargs))
    ss.chip_state.bump_if_same = lambda sid, missing: 2
    captured: dict = {}

    def followup(context, buffer):
        checks.true(tx.active == 0, "LLM 호출 중 DB connection 보유")
        captured.update(context=context, buffer=buffer)
        return RefineResult(
            is_complete=False,
            usage=Usage("model", 10, 2, 3),
            missing="detail",
            question="증상을 알려주세요.",
            choices=["누수", "막힘", "냄새"],
        )

    ss.llm_client.refine = followup
    out = ss.send_message(11, 3, "  물이 새요  ")
    checks.true(out.is_complete is False and "(예:" in out.follow_up_question, "반복 안내 실패")
    checks.true(captured["buffer"] == [{"role": "student", "content": "물이 새요"}], "압축 경계/buffer 실패")
    checks.true(stored[0][0][2:4] == ("student", "물이 새요"), "학생 발화 선저장 실패")
    checks.true(stored[1][0][2] == "assistant" and stored[1][1]["choices"][-1] == "직접 입력", "assistant choices 저장 실패")
    checks.true(logs[0]["school_id"] == 7 and logs[0]["is_complete"] is False, "성공 Usage 로그 실패")
    checks.true(lock_events[-1] == ("release", 11), "성공 lock 해제 실패")

    # 직전 동일 발화+assistant 결과는 새 저장이나 LLM 호출 없이 재사용한다.
    before_stored = len(stored)
    ss.conversation_repo.list_by_session = lambda c, sid: [
        {"id": 2, "role": "student", "content": "같은 말", "choices": None, "refined_json": None},
        {"id": 3, "role": "assistant", "content": "어디인가요?", "choices": ["본관"], "refined_json": None},
    ]
    ss.chip_state.get_state = lambda sid: {"step": "location", "repeat_count": 1}
    ss.llm_client.refine = lambda *_: (_ for _ in ()).throw(AssertionError("duplicate LLM call"))
    duplicate = ss.send_message(11, 3, "같은 말")
    checks.true(duplicate.follow_up_question == "어디인가요?", "동일 발화 응답 재사용 실패")
    checks.true(len(stored) == before_stored, "동일 발화가 다시 저장됨")

    # Bedrock 실패도 Usage를 기록하고 lock을 해제한다.
    ss.conversation_repo.list_by_session = lambda c, sid: []
    failure = ss.llm_client.BedrockError(
        "호출 실패",
        usage=Usage("model", 20, error="AccessDeniedException"),
        aws_error_code="AccessDeniedException",
    )
    ss.llm_client.refine = lambda *_: (_ for _ in ()).throw(failure)
    checks.raises(ss.llm_client.BedrockError, lambda: ss.send_message(11, 3, "재시도"))
    checks.true(logs[-1]["error"] == "AccessDeniedException", "실패 Usage 로그 누락")
    checks.true(lock_events[-1] == ("release", 11), "실패 lock 해제 실패")

    # 완성 결과는 refined_json·메타·confirm 상태로 저장한다.
    states: list[tuple] = []
    ss.llm_client.refine = lambda *_: RefineResult(
        is_complete=True,
        usage=Usage("model", 30),
        category="위생 / 배관",
        location="본관 2층",
        refined_title="세면대 누수",
        refined_body="세면대에서 물이 샙니다.",
        session_title="본관 누수",
    )
    ss.chip_state.set_state = lambda *args: states.append(args)
    complete = ss.send_message(11, 3, "정리해줘")
    checks.true(complete.is_complete and complete.preview.refined_title == "세면대 누수", "확정 응답 실패")
    checks.true(stored[-1][1]["refined_json"]["location"] == "본관 2층", "refined_json 저장 실패")
    checks.true(states[-1] == (11, "confirm", 0), "confirm state 저장 실패")

    ss.turn_lock.acquire = lambda sid: True
    ss.conversation_repo.list_by_session = lambda c, sid: [
        {"id": i, "role": "student" if i % 2 else "assistant", "content": f"기록 {i}",
         "choices": None, "refined_json": None}
        for i in range(1, 101)
    ]
    ss.llm_client.refine = lambda *_: (_ for _ in ()).throw(AssertionError("limit LLM call"))
    checks.raises(ConversationStuckError, lambda: ss.send_message(11, 3, "상한 이후"))

    # lock 경쟁은 LLM 전에 409로 닫힌다.
    ss.turn_lock.acquire = lambda sid: False
    checks.raises(TurnInProgressError, lambda: ss.send_message(11, 3, "경쟁"))


def _check_remaining_services(checks: Checks, tx: FakeTransactions) -> None:
    # 세션 복원과 전체 원문은 DB 정본을 사용한다.
    session = {
        "id": 11, "user_id": 3, "school_id": 7, "title": "누수",
        "category": "위생 / 배관", "complaint_id": None,
    }
    refined = {
        "category": "위생 / 배관", "location": "본관",
        "refined_title": "누수", "refined_body": "물이 샙니다.",
    }
    turns = [
        {"id": 1, "role": "student", "content": "물이 새요", "choices": None,
         "refined_json": None, "created_at": _NOW},
        {"id": 2, "role": "assistant", "content": "정리 완료", "choices": None,
         "refined_json": refined, "created_at": _NOW},
    ]
    ss.chat_session_repo.require_owner = lambda c, sid, uid: session.copy()
    ss.conversation_repo.list_by_session = lambda c, sid: turns
    ss.chip_state.get_state = lambda sid: None
    detail = ss.get_session(11, 3)
    checks.true(detail.step == "confirm" and detail.preview.refined_title == "누수", "세션 복원 실패")
    checks.true(len(ss.get_conversation(11, 3)) == 2, "세션 원문 조회 실패")

    # 압축은 최근 8 messages를 남기고 LLM 호출 중 connection을 반납한다.
    compact_rows = [
        {"id": i, "role": "student" if i % 2 else "assistant", "content": f"메시지 {i}"}
        for i in range(1, 21)
    ]
    compact_session = {
        "id": 11, "school_id": 7, "context": None, "compacted_upto": None,
        "title": "수동 제목", "is_manual_title": True,
    }
    ss.compact_lock.acquire = lambda sid: True
    compact_releases: list[int] = []
    ss.compact_lock.release = compact_releases.append
    ss.chat_session_repo.get = lambda c, sid: compact_session.copy()
    ss.conversation_repo.list_by_session = lambda c, sid: compact_rows
    compact_input: dict = {}
    ss.llm_client.compact = lambda context, messages: (
        checks.true(tx.active == 0, "compact LLM 호출 중 DB connection 보유")
        or compact_input.update(messages=messages)
        or CompactResult("누적 요약", "모델 제목", Usage("model", 40))
    )
    updates: list[dict] = []
    ss.chat_session_repo.update_compacted = lambda c, **kwargs: updates.append(kwargs) or True
    ss.compact(11)
    checks.true(len(compact_input["messages"]) == 12, "최근 원문 보존 구간 오류")
    checks.true(updates[0]["compacted_upto"] == 12 and updates[0]["expected_prev_upto"] is None, "compact CAS 경계 오류")
    checks.true(updates[0]["title"] == "수동 제목", "수동 제목 덮어쓰기")
    checks.true(compact_releases == [11], "compact lock 해제 실패")

    # 철회는 비밀번호 확인이 UPDATE보다 먼저이며 owner 실패를 숨기지 않는다.
    order: list[str] = []
    cs.auth_service.verify_password = lambda uid, pw: order.append("password")
    cs.complaint_repo.withdraw = lambda c, cid, uid: order.append("withdraw") or True
    cs.withdraw(5, 3, "pw")
    checks.true(order == ["password", "withdraw"], "철회 확인 순서 오류")
    cs.complaint_repo.withdraw = lambda c, cid, uid: False
    checks.raises(NotOwnerError, lambda: cs.withdraw(5, 3, "pw"))

    # 일반 코멘트는 school scope를 확인하고 공백을 DB 전에 거부한다.
    row = _complaint_row()
    cs.complaint_repo.get = lambda c, cid, school: row.copy() if school == 7 else None
    added: list[tuple] = []
    # add는 새 코멘트 id(2)를 반환하고, list는 그 id를 가진 row를 돌려준다.
    # add_comment는 그 row로 CommentOut을 만든다 (api-contract #22).
    cs.comment_repo.add = lambda *args, **kwargs: added.append((args, kwargs)) or 2
    cs.comment_repo.list = lambda c, cid: [_comment_row()]
    checks.true(cs.add_comment(5, 7, 99, "  확인 중  ").id == 2, "일반 코멘트 실패")
    checks.true(added[0][0][3] == "확인 중" and added[0][1]["is_hold_reason"] is False, "일반 코멘트 저장 오류")
    before = len(tx.events)
    checks.raises(DomainError, lambda: cs.add_comment(5, 7, 99, "  "))
    checks.true(len(tx.events) == before, "빈 코멘트가 DB를 호출함")


def _external_blockers() -> list[str]:
    blockers: list[str] = []
    categories = set(get_args(Category))
    if "통신 / 인터넷" not in categories or "통신 / 네트워크" in categories:
        blockers.append("A Category taxonomy 미동기화")
    fields = getattr(SessionDetailOut, "model_fields", {})
    if "choices" not in fields:
        blockers.append("A SessionDetailOut.choices 누락")
    return blockers


def run() -> None:
    checks = Checks()
    tx = FakeTransactions()
    _check_mapping_boundary(checks)
    _check_phase1(checks, tx)
    _check_submit(checks, tx)
    _check_transitions(checks, tx)
    _check_send_message(checks, tx)
    _check_remaining_services(checks, tx)
    print(f"Service final concise checks passed: {checks.count}")
    for blocker in _external_blockers():
        print(f"KNOWN BLOCKER: {blocker}")


if __name__ == "__main__":
    run()
