"""민원(complaints) CRUD + 상태 전이. 학교 격리를 강제하는 핵심 파일.

호출하는 쪽: app/services/complaint_service.py
정본: requirements.md 의 complaints 스키마·Status Workflow, design.md Correctness Properties.

규칙 (전부 design.md의 불변식과 대응):
- 모든 함수가 school_id를 필수 인자로 받는다 (격리 불변식 #1).
- 조회 함수는 status != '철회' 조건을 내장한다 (철회 가시성 불변식 #6).
- 상태 전이는 UPDATE ... WHERE status=<전제> 로 하고 bool을 반환한다 (전이 원자성 #2).
  SELECT 후 UPDATE 두 단계로 쪼개지 않는다 — 워커 여럿이면 둘 다 통과한다.
"""
# list() 함수가 builtin list를 가린다. 어노테이션(list[dict])이 정의 시점에
# 평가되면 그 가려진 이름을 참조해 깨지므로, 어노테이션을 문자열로 지연 평가한다.
from __future__ import annotations

# 조회 시 반환할 컬럼 목록 (목록·상세 공통).
_COLS = (
    "id, category, location, refined_title, refined_body, status, "
    "created_at, confirmed_at, submitted_by_user_id"
)


def create(
    conn,
    school_id: int,
    submitted_by_user_id: int,
    category: str,
    location: str,
    refined_title: str,
    refined_body: str,
) -> int:
    """민원을 생성한다. status는 DB DEFAULT '미확인'으로 시작.
    submit() 트랜잭션의 한 단계 — 스스로 commit하지 않는다.
    """
    row = conn.execute(
        """
        INSERT INTO complaints
            (school_id, submitted_by_user_id, category, location, refined_title, refined_body)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (school_id, submitted_by_user_id, category, location, refined_title, refined_body),
    ).fetchone()
    return row["id"]


def list(conn, school_id: int, status: str | None = None) -> list[dict]:
    """게시판/관리자 목록. 항상 school_id로 스코프, status='철회'는 제외.

    Args:
        status: 주면 그 상태만, None이면 철회 제외 전체.

    Returns:
        [{id, category, location, refined_title, refined_body, status,
          created_at, confirmed_at, submitted_by_user_id}, ...]
        submitted_by_user_id는 서비스가 is_mine 계산에만 쓰고 응답에서 지운다.
    """
    if status is not None:
        # 명시 상태가 '철회'여도 조회 자체는 허용하지 않는다 — 철회는 어느 경로로도 안 보인다.
        return conn.execute(
            f"SELECT {_COLS} FROM complaints "
            "WHERE school_id = %s AND status = %s AND status != '철회' "
            "ORDER BY created_at DESC",
            (school_id, status),
        ).fetchall()
    return conn.execute(
        f"SELECT {_COLS} FROM complaints "
        "WHERE school_id = %s AND status != '철회' "
        "ORDER BY created_at DESC",
        (school_id,),
    ).fetchall()


def get(conn, complaint_id: int, school_id: int) -> dict | None:
    """단일 민원 조회. 다른 학교 것이거나 철회된 것이면 None (→ 404)."""
    return conn.execute(
        f"SELECT {_COLS} FROM complaints "
        "WHERE id = %s AND school_id = %s AND status != '철회'",
        (complaint_id, school_id),
    ).fetchone()


def get_stats(conn, school_id: int) -> dict:
    """상태별 집계. 철회 제외.

    Returns:
        {"미확인": n, "확인": n, "처리중": n, "해결완료": n, "보류": n, "거절": n}
        (전체 합계는 서비스가 sum으로 계산). 0건인 상태도 0으로 채운다.
    """
    rows = conn.execute(
        "SELECT status, COUNT(*) AS n FROM complaints "
        "WHERE school_id = %s AND status != '철회' "
        "GROUP BY status",
        (school_id,),
    ).fetchall()
    stats = {"미확인": 0, "확인": 0, "처리중": 0, "해결완료": 0, "보류": 0, "거절": 0}
    for r in rows:
        stats[r["status"]] = r["n"]
    return stats


# --- 상태 전이 (전부 UPDATE ... WHERE status=<전제> 형태, bool 반환) ---


def confirm(conn, complaint_id: int, school_id: int) -> bool:
    """미확인 → 확인 (+ confirmed_at). WHERE status='미확인'.
    이미 확인 이후 상태면 0행이 바뀌고 False를 반환하지만, 이것은 오류가 아니다 —
    호출부(open_detail)는 반환값을 무시한다 (멱등, 불변식 #7).
    """
    result = conn.execute(
        "UPDATE complaints SET status = '확인', confirmed_at = NOW() "
        "WHERE id = %s AND school_id = %s AND status = '미확인'",
        (complaint_id, school_id),
    )
    return result.rowcount > 0


def accept(conn, complaint_id: int, school_id: int) -> bool:
    """확인 → 처리중. WHERE status='확인'. 조건 불일치면 False (→ InvalidTransition)."""
    result = conn.execute(
        "UPDATE complaints SET status = '처리중' "
        "WHERE id = %s AND school_id = %s AND status = '확인'",
        (complaint_id, school_id),
    )
    return result.rowcount > 0


def resolve(conn, complaint_id: int, school_id: int) -> bool:
    """처리중 → 해결완료. WHERE status='처리중'. 확인에서 바로 못 온다 (불변식 #8)."""
    result = conn.execute(
        "UPDATE complaints SET status = '해결완료' "
        "WHERE id = %s AND school_id = %s AND status = '처리중'",
        (complaint_id, school_id),
    )
    return result.rowcount > 0


def hold(conn, complaint_id: int, school_id: int) -> bool:
    """확인 → 보류. WHERE status='확인'.
    주의: 코멘트 삽입은 이 함수가 하지 않는다. complaint_service.hold()가
    이 함수와 comment_repo.add()를 하나의 transaction()으로 묶는다 (불변식 #3).
    """
    result = conn.execute(
        "UPDATE complaints SET status = '보류' "
        "WHERE id = %s AND school_id = %s AND status = '확인'",
        (complaint_id, school_id),
    )
    return result.rowcount > 0


def reject(conn, complaint_id: int, school_id: int) -> bool:
    """확인 → 거절. WHERE status='확인'."""
    result = conn.execute(
        "UPDATE complaints SET status = '거절' "
        "WHERE id = %s AND school_id = %s AND status = '확인'",
        (complaint_id, school_id),
    )
    return result.rowcount > 0


def withdraw(conn, complaint_id: int, user_id: int) -> bool:
    """어느 상태든 → 철회. WHERE submitted_by_user_id=user_id (소유권을 WHERE로 강제).
    school_id가 아니라 user_id로 스코프하는 유일한 전이 — 학생 본인만 철회하므로.
    이미 철회된 것은 다시 철회하지 않는다 (status != '철회').
    """
    result = conn.execute(
        "UPDATE complaints SET status = '철회' "
        "WHERE id = %s AND submitted_by_user_id = %s AND status != '철회'",
        (complaint_id, user_id),
    )
    return result.rowcount > 0
