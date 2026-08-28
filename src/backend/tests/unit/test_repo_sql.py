"""repo/ SQL 로직 단위 테스트 — 실 DB 없이 SQL 문자열/파라미터/rowcount 매핑을 검증한다.

실제 DB 연동(스키마 정합, 동시성 직렬화)은 integration 테스트가 맡고,
여기서는 B가 책임지는 불변식이 SQL에 실제로 박혀 있는지를 확인한다:
- 상태 전이가 UPDATE ... WHERE status=<전제> 형태인가 (design.md #2)
- 조회에 status != '철회'가 내장돼 있는가 (#6)
- transition 함수가 rowcount로 bool을 만드는가
- JSONB 값이 Jsonb로 감싸지는가
"""
from psycopg.types.json import Jsonb

from app.repo import complaint_repo, conversation_repo, chat_session_repo


class FakeResult:
    def __init__(self, rowcount=0, rows=None):
        self.rowcount = rowcount
        self._rows = rows or []

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class FakeConn:
    """execute를 기록하고, 미리 지정한 결과를 순서대로 돌려주는 가짜 커넥션."""

    def __init__(self, results=None):
        self.calls = []  # [(sql, params), ...]
        self._results = list(results or [])

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if self._results:
            return self._results.pop(0)
        return FakeResult()

    @property
    def last_sql(self):
        return self.calls[-1][0]

    @property
    def last_params(self):
        return self.calls[-1][1]


# ---- 상태 전이: 전제 상태가 WHERE에 박혀 있고 rowcount로 bool ----

def test_accept_precondition_and_bool():
    conn = FakeConn([FakeResult(rowcount=1)])
    ok = complaint_repo.accept(conn, complaint_id=5, school_id=3)
    assert ok is True
    assert "status = '확인'" in conn.last_sql   # 전제 상태
    assert "'처리중'" in conn.last_sql            # 결과 상태
    assert "school_id = %s" in conn.last_sql     # 학교 격리
    assert conn.last_params == (5, 3)


def test_accept_no_row_returns_false():
    conn = FakeConn([FakeResult(rowcount=0)])
    assert complaint_repo.accept(conn, 5, 3) is False


def test_resolve_requires_처리중():
    conn = FakeConn([FakeResult(rowcount=1)])
    complaint_repo.resolve(conn, 1, 1)
    assert "status = '처리중'" in conn.last_sql
    assert "'해결완료'" in conn.last_sql


def test_confirm_is_idempotent_precondition():
    conn = FakeConn([FakeResult(rowcount=0)])
    # 이미 확인 이후라 0행 → False지만 예외는 아니다
    assert complaint_repo.confirm(conn, 1, 1) is False
    assert "status = '미확인'" in conn.last_sql
    assert "confirmed_at = NOW()" in conn.last_sql


def test_withdraw_scopes_by_user_not_school():
    conn = FakeConn([FakeResult(rowcount=1)])
    complaint_repo.withdraw(conn, complaint_id=8, user_id=42)
    assert "submitted_by_user_id = %s" in conn.last_sql
    assert "status != '철회'" in conn.last_sql
    assert conn.last_params == (8, 42)


# ---- 조회: 철회 제외 내장 ----

def test_list_excludes_withdrawn():
    conn = FakeConn([FakeResult(rows=[])])
    complaint_repo.list(conn, school_id=2)
    assert "status != '철회'" in conn.last_sql
    assert conn.last_params == (2,)


def test_list_with_status_filter():
    conn = FakeConn([FakeResult(rows=[])])
    complaint_repo.list(conn, school_id=2, status="처리중")
    assert "status = %s" in conn.last_sql
    assert "status != '철회'" in conn.last_sql
    assert conn.last_params == (2, "처리중")


def test_get_scopes_by_school_and_excludes_withdrawn():
    conn = FakeConn([FakeResult(rows=[{"id": 1}])])
    complaint_repo.get(conn, complaint_id=1, school_id=9)
    assert "school_id = %s" in conn.last_sql
    assert "status != '철회'" in conn.last_sql
    assert conn.last_params == (1, 9)


def test_get_stats_fills_zero_for_missing_status():
    conn = FakeConn([FakeResult(rows=[{"status": "미확인", "n": 3}])])
    stats = complaint_repo.get_stats(conn, school_id=1)
    assert stats["미확인"] == 3
    assert stats["해결완료"] == 0
    assert set(stats) == {"미확인", "확인", "처리중", "해결완료", "보류", "거절"}


# ---- JSONB 래핑 ----

def test_add_turn_wraps_jsonb():
    conn = FakeConn([FakeResult(rows=[{"id": 11}])])
    conversation_repo.add_turn(
        conn, chat_session_id=1, role="assistant", content="q",
        choices=["A", "B"], refined_json={"category": "기타"},
    )
    _, params = conn.calls[-1]
    # choices, refined_json 위치의 값이 Jsonb로 감싸졌는지
    jsonb_args = [p for p in params if isinstance(p, Jsonb)]
    assert len(jsonb_args) == 2


def test_add_turn_none_stays_none():
    conn = FakeConn([FakeResult(rows=[{"id": 12}])])
    conversation_repo.add_turn(conn, 1, "student", "hi")
    _, params = conn.calls[-1]
    assert params[3] is None  # choices
    assert params[4] is None  # refined_json


def test_get_last_refined_orders_desc_and_filters_notnull():
    conn = FakeConn([FakeResult(rows=[{"refined_json": {"category": "위생 / 배관"}}])])
    result = conversation_repo.get_last_refined(conn, chat_session_id=1)
    assert result == {"category": "위생 / 배관"}
    assert "refined_json IS NOT NULL" in conn.last_sql
    assert "ORDER BY id DESC" in conn.last_sql


# ---- 압축 경계: expected_prev_upto 조건 ----

def test_update_compacted_uses_expected_guard():
    conn = FakeConn([FakeResult(rowcount=1)])
    ok = chat_session_repo.update_compacted(
        conn, session_id=1, context="ctx", title="t",
        compacted_upto=50, expected_prev_upto=20,
    )
    assert ok is True
    assert "compacted_upto IS NOT DISTINCT FROM %s" in conn.last_sql


def test_update_compacted_rejected_when_guard_mismatch():
    conn = FakeConn([FakeResult(rowcount=0)])
    ok = chat_session_repo.update_compacted(conn, 1, "c", "t", 50, 20)
    assert ok is False


def test_list_by_user_withdrawn_is_boolean_not_null():
    # 초안 세션(complaint 없음)도 withdrawn이 NULL이 아니라 FALSE여야 한다 (계약: boolean).
    conn = FakeConn([FakeResult(rows=[])])
    chat_session_repo.list_by_user(conn, 1)
    assert "COALESCE(cp.status = '철회', FALSE)" in conn.last_sql
    # 메시지 없는 세션 제외(EXISTS)와 최신순 정렬도 SQL에 있어야 한다.
    assert "EXISTS" in conn.last_sql
    assert "ORDER BY s.updated_at DESC" in conn.last_sql
