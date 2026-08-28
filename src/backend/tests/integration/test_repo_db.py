"""실 PostgreSQL 연동 테스트. design.md Correctness Property를 옮긴 것.

전제: `python init_db.py` 로 스키마가 이미 만들어져 있고, seed_schools.py로
학교가 최소 1개 시드돼 있어야 한다. DB 미도달 시 conftest가 전체를 skip한다.

각 테스트는 conn 픽스처의 트랜잭션 안에서 돌고 끝나면 롤백된다 (DB를 더럽히지 않음).
"""
import pytest

from app.repo import (
    school_repo,
    user_repo,
    complaint_repo,
    chat_session_repo,
    conversation_repo,
    comment_repo,
)


def _make_school(conn, domain="test-univ.example"):
    row = conn.execute(
        "INSERT INTO schools (name, aliases, email_domain) VALUES (%s, %s, %s) RETURNING id",
        ("테스트대학교", ["테대"], domain),
    ).fetchone()
    return row["id"]


def _make_user(conn, school_id, email="s1@test-univ.example", role="student"):
    return user_repo.create(conn, school_id, email, "hash", role)


def test_school_find_and_admin_code(conn):
    sid = _make_school(conn)
    conn.execute("INSERT INTO admin_codes (school_id, code) VALUES (%s, %s)", (sid, "CODE-1"))
    found = school_repo.find_by_domain(conn, "test-univ.example")
    assert found["id"] == sid
    assert school_repo.verify_admin_code(conn, sid, "CODE-1") is True
    assert school_repo.verify_admin_code(conn, sid, "WRONG") is False


def test_user_create_and_find(conn):
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    row = user_repo.find_by_email(conn, "s1@test-univ.example")
    assert row["id"] == uid
    assert row["school_id"] == sid
    assert row["role"] == "student"


def test_state_transition_atomicity(conn):
    """불변식 #2·#8: accept는 확인에서만, resolve는 처리중에서만."""
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    cid = complaint_repo.create(conn, sid, uid, "기타", "본관", "제목", "본문")

    # 미확인 상태에서 accept 불가
    assert complaint_repo.accept(conn, cid, sid) is False
    # confirm(멱등) → 확인
    assert complaint_repo.confirm(conn, cid, sid) is True
    assert complaint_repo.confirm(conn, cid, sid) is False  # 두 번째는 0행 (멱등)
    # 확인 → 처리중
    assert complaint_repo.accept(conn, cid, sid) is True
    # 처리중에서 다시 accept 불가
    assert complaint_repo.accept(conn, cid, sid) is False
    # 처리중 → 해결완료
    assert complaint_repo.resolve(conn, cid, sid) is True


def test_school_isolation_on_get(conn):
    """불변식 #1: 다른 학교 school_id로는 조회되지 않는다."""
    sid_a = _make_school(conn, "a.example")
    sid_b = _make_school(conn, "b.example")
    ua = _make_user(conn, sid_a, "a@a.example")
    cid = complaint_repo.create(conn, sid_a, ua, "기타", "loc", "t", "b")
    assert complaint_repo.get(conn, cid, sid_a) is not None
    assert complaint_repo.get(conn, cid, sid_b) is None  # 다른 학교 → 안 보임


def test_withdraw_hides_everywhere(conn):
    """불변식 #6: 철회하면 list/get 어디에서도 안 보인다."""
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    cid = complaint_repo.create(conn, sid, uid, "기타", "loc", "t", "b")
    assert complaint_repo.withdraw(conn, cid, uid) is True
    assert complaint_repo.get(conn, cid, sid) is None
    assert all(c["id"] != cid for c in complaint_repo.list(conn, sid))


def test_conversation_refined_and_link(conn):
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    chat_id = chat_session_repo.create(conn, uid, sid)
    conversation_repo.add_turn(conn, chat_id, "student", "안녕")
    conversation_repo.add_turn(
        conn, chat_id, "assistant", "[정리 완료]",
        refined_json={"category": "기타", "location": "loc",
                      "refined_title": "t", "refined_body": "b"},
    )
    last = conversation_repo.get_last_refined(conn, chat_id)
    assert last["category"] == "기타"

    # 접수: 민원 생성 후 대화 연결
    cid = complaint_repo.create(conn, sid, uid, "기타", "loc", "t", "b")
    conversation_repo.link_to_complaint(conn, chat_id, cid)
    rows = conversation_repo.list_by_complaint(conn, cid)
    assert len(rows) == 2


def test_hold_reason_comment(conn):
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    admin = _make_user(conn, sid, "admin@test-univ.example", "admin")
    cid = complaint_repo.create(conn, sid, uid, "기타", "loc", "t", "b")
    complaint_repo.confirm(conn, cid, sid)
    assert complaint_repo.hold(conn, cid, sid) is True
    comment_repo.add(conn, cid, admin, "공사 일정 대기", is_hold_reason=True)
    comment_repo.add(conn, cid, admin, "일반 코멘트", is_hold_reason=False)
    assert len(comment_repo.list(conn, cid)) == 2
    assert len(comment_repo.list_hold_reasons(conn, cid)) == 1


def test_compacted_upto_guard(conn):
    """압축 경계: expected_prev_upto 불일치면 갱신 거부."""
    sid = _make_school(conn)
    uid = _make_user(conn, sid)
    chat_id = chat_session_repo.create(conn, uid, sid)
    # 첫 압축: 이전 upto가 NULL
    assert chat_session_repo.update_compacted(conn, chat_id, "ctx1", "t1", 10, None) is True
    # 두 번째: expected=10 이어야 성공
    assert chat_session_repo.update_compacted(conn, chat_id, "ctx2", "t2", 20, 10) is True
    # 잘못된 expected(5) → 거부
    assert chat_session_repo.update_compacted(conn, chat_id, "ctx3", "t3", 30, 5) is False
