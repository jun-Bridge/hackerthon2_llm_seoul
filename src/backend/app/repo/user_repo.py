"""계정 CRUD. 비밀번호 해시 생성/검증은 이 파일이 아니라 auth_service가 한다
(이 파일은 저장된 해시를 그대로 다룰 뿐, bcrypt 호출은 하지 않는다).

호출하는 쪽: app/services/auth_service.py
정본: requirements.md 의 users 스키마.
"""


def create(conn, school_id: int, email: str, password_hash: str, role: str) -> int:
    """계정을 생성한다. email은 소문자로 정규화된 값을 받는다 (호출부 책임).

    Returns:
        새로 생성된 user_id.

    Raises:
        이메일 UNIQUE 제약 위반 시 DB 예외를 그대로 던진다 —
        auth_service가 이를 잡아 EmailTakenError로 변환한다.
    """
    row = conn.execute(
        """
        INSERT INTO users (school_id, email, password_hash, role)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (school_id, email, password_hash, role),
    ).fetchone()
    return row["id"]


def find_by_email(conn, email: str) -> dict | None:
    """로그인용 조회.

    Returns:
        {"id": int, "school_id": int, "role": str, "password_hash": str} 또는 None.
    """
    return conn.execute(
        "SELECT id, school_id, role, password_hash FROM users WHERE email = %s",
        (email,),
    ).fetchone()


def get_password_hash(conn, user_id: int) -> str | None:
    """verify_password, 탈퇴/철회 비밀번호 재확인용. 존재하지 않으면 None."""
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    return row["password_hash"] if row else None


def change_password(conn, user_id: int, new_password_hash: str) -> None:
    conn.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (new_password_hash, user_id),
    )


def delete(conn, user_id: int) -> None:
    """계정 삭제. complaints.submitted_by_user_id는 FK ON DELETE SET NULL로
    DB가 자동 처리하므로 여기서 별도로 UPDATE하지 않는다.
    """
    conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
