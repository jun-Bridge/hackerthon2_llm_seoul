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


def find_me(conn, user_id: int) -> dict | None:
    """GET /auth/me · 로그인 응답용 표시 정보. schools를 조인해 학교명까지 채운다.

    find_by_email은 email 기준(로그인용)이라 user_id로 못 찾고 school_name도 없어서,
    current_user가 준 user_id로 조회하는 경로를 따로 둔다.

    Returns:
        {"user_id": int, "email": str, "role": str, "school_name": str} 또는 None.
        키 이름은 schemas.auth.Me 필드에 그대로 대응한다.
    """
    return conn.execute(
        """
        SELECT u.id AS user_id, u.email, u.role, s.name AS school_name
        FROM users u
        JOIN schools s ON s.id = u.school_id
        WHERE u.id = %s
        """,
        (user_id,),
    ).fetchone()


def get_password_hash(conn, user_id: int) -> str | None:
    """verify_password, 탈퇴/철회 비밀번호 재확인용. 존재하지 않으면 None."""
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    return row["password_hash"] if row else None


def get_school_id(conn, user_id: int) -> int | None:
    """그 계정이 어느 학교 소속인지. 관리자 코드 대조는 반드시 이 학교로 한정한다
    (다른 학교 코드로 승격되면 학교 격리가 뚫린다)."""
    row = conn.execute(
        "SELECT school_id FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    return row["school_id"] if row else None


def set_role(conn, user_id: int, role: str) -> None:
    """역할 변경. 호출 전에 서비스가 관리자 코드를 검증한다 —
    이 함수는 판단하지 않고 쓰기만 한다."""
    conn.execute(
        "UPDATE users SET role = %s WHERE id = %s",
        (role, user_id),
    )


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
