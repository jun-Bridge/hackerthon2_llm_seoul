"""B가 만드는 모든 SQL이 실제 PostgreSQL 문법으로 파싱되는지 정적 검증.

실 DB 서버 없이 libpg_query(pglast)로 파스한다 — 서버가 파스 단계에서 거부할
문법 오류·오타·예약어 문제를 잡는다. (rowcount 의미·동시성은 integration이 담당.)

실행: python tests/verify_sql.py
"""
import os
import sys

# 백엔드 루트(src/backend)를 경로에 넣어 init_db·app.* 를 임포트할 수 있게 한다.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pglast

import init_db
from app.repo import (
    school_repo,
    user_repo,
    chat_session_repo,
    conversation_repo,
    complaint_repo,
    comment_repo,
    bedrock_log_repo,
)


class CaptureConn:
    """execute로 들어온 SQL을 전부 모으고, fetchone/fetchall엔 더미를 준다."""

    def __init__(self):
        self.sqls = []

    def execute(self, sql, params=None):
        self.sqls.append(sql)
        return self

    def fetchone(self):
        return {"id": 1, "refined_json": {}, "password_hash": "x", "user_id": 1,
                "school_id": 1, "status": "미확인", "aliases": None, "n": 0}

    def fetchall(self):
        return []

    @property
    def rowcount(self):
        return 1


def exercise_all(conn):
    """모든 repo 함수를 한 번씩 불러 SQL을 뽑아낸다."""
    # school
    school_repo.find_by_domain(conn, "a.ac.kr")
    school_repo.list_all(conn)
    school_repo.verify_admin_code(conn, 1, "C")
    # user
    user_repo.create(conn, 1, "e@a.ac.kr", "h", "student")
    user_repo.find_by_email(conn, "e@a.ac.kr")
    user_repo.get_password_hash(conn, 1)
    user_repo.change_password(conn, 1, "h2")
    user_repo.delete(conn, 1)
    # chat_session
    chat_session_repo.create(conn, 1, 1)
    chat_session_repo.get_or_reuse_empty(conn, 1, 1)
    chat_session_repo.list_by_user(conn, 1)
    chat_session_repo.get(conn, 1)
    chat_session_repo.update_meta(conn, 1, title="t", category="기타")
    chat_session_repo.update_meta(conn, 1)  # 아무 필드도 안 준 경우 (updated_at만)
    chat_session_repo.mark_submitted(conn, 1, 1)
    chat_session_repo.update_compacted(conn, 1, "c", "t", 10, None)
    # conversation
    conversation_repo.add_turn(conn, 1, "student", "hi", ["A"], {"category": "기타"})
    conversation_repo.list_by_session(conn, 1)
    conversation_repo.list_by_complaint(conn, 1)
    conversation_repo.get_last_refined(conn, 1)
    conversation_repo.link_to_complaint(conn, 1, 1)
    # complaint
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
    # comment
    comment_repo.add(conn, 1, 1, "c", True)
    comment_repo.list(conn, 1)
    comment_repo.list_hold_reasons(conn, 1)
    # bedrock_log
    bedrock_log_repo.add(conn, 1, "m", True, 100, 10, 20, None)
    bedrock_log_repo.list_recent(conn, 1, 50)


def main():
    failures = []

    # 1) DDL 전체 파싱
    try:
        pglast.parse_sql(init_db.DDL)
        print("[OK] init_db.DDL 파싱 성공 (8테이블 + 인덱스)")
    except Exception as e:
        failures.append(("init_db.DDL", str(e)))

    # 2) 모든 repo SQL 파싱
    conn = CaptureConn()
    exercise_all(conn)
    print(f"[..] repo SQL {len(conn.sqls)}개 수집, 파싱 검증 중")
    for sql in conn.sqls:
        # psycopg의 %s 플레이스홀더는 클라이언트가 바인딩하는 것이라 서버 문법이 아니다.
        # 파서에는 유효 리터럴(NULL)로 바꿔 넣어 나머지 구조를 검증한다.
        probe = sql.replace("%s", "NULL")
        try:
            pglast.parse_sql(probe)
        except Exception as e:
            failures.append((sql.strip().split(chr(10))[0][:60], str(e)))

    if failures:
        print(f"\n[FAIL] {len(failures)}개 SQL이 파싱에 실패했다:")
        for label, err in failures:
            print(f"  - {label!r}: {err}")
        sys.exit(1)

    print(f"[OK] repo SQL {len(conn.sqls)}개 전부 유효한 PostgreSQL 문법")
    print("\n검증 통과: B가 내보내는 모든 SQL이 서버 파스 단계를 통과한다.")


if __name__ == "__main__":
    main()
