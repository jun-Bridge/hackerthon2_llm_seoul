"""각 SQL의 %s 개수와 실제로 넘기는 파라미터 개수가 일치하는지 검증.

불일치하면 psycopg가 런타임에 'the query has N placeholders but M parameters
were passed'로 터진다. 문법 검사(verify_sql)나 fake-conn 단위 테스트로는 못 잡는
층위라, 여기서 execute(sql, params)의 %s 개수 == len(params) 를 기계적으로 확인한다.

실행: python tests/verify_params.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.repo import (
    school_repo,
    user_repo,
    chat_session_repo,
    conversation_repo,
    complaint_repo,
    comment_repo,
    bedrock_log_repo,
)


class CheckConn:
    """execute(sql, params)마다 %s 개수와 params 길이를 대조해 기록한다."""

    def __init__(self):
        self.calls = []  # (label, placeholders, n_params, ok)

    def execute(self, sql, params=None):
        placeholders = sql.count("%s")
        if params is None:
            n = 0
        elif isinstance(params, (tuple, list)):
            n = len(params)
        else:
            n = 1
        label = " ".join(sql.split())[:55]
        self.calls.append((label, placeholders, n, placeholders == n))
        return self

    def fetchone(self):
        return {"id": 1, "refined_json": {}, "password_hash": "x", "user_id": 1,
                "school_id": 1, "status": "미확인", "aliases": None, "n": 0}

    def fetchall(self):
        return []

    @property
    def rowcount(self):
        return 1


def exercise(conn):
    school_repo.find_by_domain(conn, "a.ac.kr")
    school_repo.list_all(conn)
    school_repo.verify_admin_code(conn, 1, "C")

    user_repo.create(conn, 1, "e@a.ac.kr", "h", "student")
    user_repo.find_by_email(conn, "e@a.ac.kr")
    user_repo.find_me(conn, 1)
    user_repo.get_password_hash(conn, 1)
    user_repo.change_password(conn, 1, "h2")
    user_repo.delete(conn, 1)

    chat_session_repo.create(conn, 1, 1)
    chat_session_repo.get_or_reuse_empty(conn, 1, 1)
    chat_session_repo.list_by_user(conn, 1)
    chat_session_repo.get(conn, 1)
    chat_session_repo.update_meta(conn, 1, title="t", category="기타")  # 두 필드
    chat_session_repo.update_meta(conn, 1, title="t")                    # 한 필드
    chat_session_repo.update_meta(conn, 1)                               # 필드 없음
    chat_session_repo.mark_submitted(conn, 1, 1)
    chat_session_repo.update_compacted(conn, 1, "c", "t", 10, None)

    conversation_repo.add_turn(conn, 1, "student", "hi", ["A"], {"category": "기타"})
    conversation_repo.add_turn(conn, 1, "student", "hi")  # choices/refined 없음
    conversation_repo.list_by_session(conn, 1)
    conversation_repo.list_by_complaint(conn, 1)
    conversation_repo.get_last_refined(conn, 1)
    conversation_repo.link_to_complaint(conn, 1, 1)

    complaint_repo.create(conn, 1, 1, "기타", "loc", "t", "b")
    complaint_repo.list(conn, 1)
    complaint_repo.list(conn, 1, "처리중")
    complaint_repo.get(conn, 1, 1)
    complaint_repo.get_stats(conn, 1)
    complaint_repo.confirm(conn, 1, 1)
    complaint_repo.accept(conn, 1, 1)
    complaint_repo.resolve(conn, 1, 1)
    complaint_repo.hold(conn, 1, 1)
    complaint_repo.reject(conn, 1, 1)
    complaint_repo.withdraw(conn, 1, 1)

    comment_repo.add(conn, 1, 1, "c", True)
    comment_repo.list(conn, 1)
    comment_repo.list_hold_reasons(conn, 1)

    bedrock_log_repo.add(conn, 1, "m", True, 100, 10, 20, None)
    bedrock_log_repo.list_recent(conn, 1, 50)


def main():
    conn = CheckConn()
    exercise(conn)
    bad = [c for c in conn.calls if not c[3]]
    for label, ph, n, ok in conn.calls:
        mark = "OK " if ok else "!! "
        print(f"[{mark}] %s={ph} params={n}  {label}")
    print(f"\n총 {len(conn.calls)}개 execute 호출.")
    if bad:
        print(f"[FAIL] {len(bad)}개에서 %s 개수 != 파라미터 개수")
        sys.exit(1)
    print("[OK] 모든 execute에서 %s 개수 == 파라미터 개수 (바인딩 정합)")


if __name__ == "__main__":
    main()
