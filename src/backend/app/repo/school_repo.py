"""학교/도메인/관리자코드 조회. 시드 스크립트가 데이터를 채우고, 이 파일은 조회만 한다.

호출하는 쪽: app/services/auth_service.py
정본: requirements.md 의 schools/admin_codes 스키마, requirements.md Requirement 1.
"""


def normalize_domain(email_or_domain: str) -> str:
    """이메일 또는 도메인 문자열을 조회용 도메인으로 정규화한다.

    학교를 정하는 근거는 도메인 하나뿐이라, 대소문자·공백 차이로 조회가 조용히
    어긋나지 않게 여기서 한 번에 통일한다. '@'가 있으면 뒤쪽만 취한다.

    예: '  Student1@Chosun.AC.KR ' → 'chosun.ac.kr'
        'JBNU.ac.kr'              → 'jbnu.ac.kr'
    """
    s = (email_or_domain or "").strip().lower()
    if "@" in s:
        s = s.rsplit("@", 1)[-1]
    return s


def find_by_domain(conn, domain: str) -> dict | None:
    """이메일 '@' 뒤 도메인으로 학교를 조회한다.

    Args:
        domain: 도메인 또는 전체 이메일. 내부에서 normalize_domain으로 정규화하므로
                호출부가 대소문자·공백을 신경 쓰지 않아도 된다.

    Returns:
        {"id": int, "name": str} 또는 없으면 None.
        None이면 호출부(auth_service.signup)가 UnsupportedDomainError를 던진다.
    """
    return conn.execute(
        "SELECT id, name FROM schools WHERE email_domain = %s",
        (normalize_domain(domain),),
    ).fetchone()


def list_all(conn) -> list[dict]:
    """가입 화면 학교 드롭다운용 전체 목록. 인증 불필요 (공개 정보).

    Returns:
        [{"name": str, "email_domain": str, "aliases": list[str]}, ...]
        id는 반환하지 않는다 — 가입 요청에 school_id를 쓰지 않으므로.
    """
    rows = conn.execute(
        "SELECT name, email_domain, aliases FROM schools ORDER BY name"
    ).fetchall()
    # aliases 컬럼이 NULL이면 빈 리스트로 정규화 (프론트가 항상 배열을 기대).
    for r in rows:
        if r.get("aliases") is None:
            r["aliases"] = []
    return rows


def verify_admin_code(conn, school_id: int, code: str) -> bool:
    """그 학교의 admin_codes에 code가 존재하는지 확인.

    Args:
        school_id: find_by_domain으로 이미 확정된 학교 id
        code: 공백 제거된 코드 문자열. 빈 문자열이면 호출 전에 auth_service가
              걸러내므로(코드 없음=student) 여기까지 오지 않는다.

    Returns:
        일치하는 코드가 있으면 True.
    """
    row = conn.execute(
        "SELECT 1 FROM admin_codes WHERE school_id = %s AND code = %s LIMIT 1",
        (school_id, code),
    ).fetchone()
    return row is not None
