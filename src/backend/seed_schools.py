"""학교·도메인·별칭·관리자 코드 시드.

학교 몇 곳과 각 학교의 admin_codes를 넣는다. 재실행 안전(idempotent)하도록
email_domain UNIQUE 제약에 ON CONFLICT를 걸어 중복 삽입을 막는다.

실행:
    cd src/backend
    python init_db.py && python seed_schools.py

정본: docs/api-contract.md #1 listSchools (name/email_domain/aliases),
      requirements.md schools/admin_codes 스키마.
"""
import re

from app.repo.pool import get_pool

# (학교명, 이메일 도메인, 별칭 리스트, [관리자 코드, ...])
# 도메인은 각 대학 공식 사이트로 검증한 정본이다. 학교를 정하는 유일한 근거이므로
# 오타가 있으면 그 학교 학생이 가입 자체를 못 한다 — 신중히 관리한다.
SCHOOLS = [
    (
        "조선대학교",
        "chosun.ac.kr",
        ["조선대", "조대"],
        ["CHOSUN-ADMIN-2026", "CHOSUN-STAFF-01"],
    ),
    (
        "국립순천대학교",
        "sunchon.ac.kr",
        ["순천대", "순대", "국립순천대"],
        ["SUNCHON-ADMIN-2026", "SUNCHON-STAFF-01"],
    ),
    (
        "국립군산대학교",
        "kunsan.ac.kr",
        ["군산대", "국립군산대"],
        ["KUNSAN-ADMIN-2026", "KUNSAN-STAFF-01"],
    ),
    (
        "전남대학교",
        "jnu.ac.kr",
        ["전남대", "전대"],
        ["JNU-ADMIN-2026", "JNU-STAFF-01"],
    ),
    (
        "전북대학교",
        "jbnu.ac.kr",
        ["전북대", "전북"],
        ["JBNU-ADMIN-2026", "JBNU-STAFF-01"],
    ),
]


# 도메인 형식: 소문자 라벨(영숫자/하이픈)을 점으로 이은 것. 예: chosun.ac.kr
_DOMAIN_RE = re.compile(r"^(?=.{4,255}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def validate_seed(schools=SCHOOLS) -> None:
    """DB에 넣기 전에 시드 데이터의 무결성을 검사한다.

    오타난 도메인·중복 도메인·중복 학교명·빈 코드가 그대로 들어가면
    그 학교 학생이 가입을 못 하거나(도메인) 관리자 가입이 막힌다(코드).
    시드는 대회 데모의 진입점이라 여기서 강하게 막는다.

    Raises:
        ValueError: 무결성 위반 시. 어느 항목이 왜 틀렸는지 함께 알린다.
    """
    seen_domains: set[str] = set()
    seen_names: set[str] = set()
    seen_codes: set[str] = set()
    for entry in schools:
        if len(entry) != 4:
            raise ValueError(f"시드 항목 형식 오류(4-튜플이어야 함): {entry!r}")
        name, domain, aliases, codes = entry

        if not name or not name.strip():
            raise ValueError("학교명이 비어 있다")
        if name in seen_names:
            raise ValueError(f"중복 학교명: {name!r}")
        seen_names.add(name)

        if domain != domain.lower():
            raise ValueError(f"도메인은 소문자여야 한다: {domain!r}")
        if not _DOMAIN_RE.match(domain):
            raise ValueError(f"도메인 형식 오류: {domain!r} ({name})")
        if domain in seen_domains:
            raise ValueError(f"중복 도메인: {domain!r}")
        seen_domains.add(domain)

        if not isinstance(aliases, list) or any(not a.strip() for a in aliases):
            raise ValueError(f"별칭은 비어 있지 않은 문자열 리스트여야 한다: {name}")

        if not codes:
            raise ValueError(f"관리자 코드가 최소 1개 필요하다: {name}")
        for code in codes:
            if not code or not code.strip():
                raise ValueError(f"빈 관리자 코드: {name}")
            if code in seen_codes:
                raise ValueError(f"학교 간 중복 관리자 코드: {code!r}")
            seen_codes.add(code)


def seed() -> None:
    validate_seed()  # 넣기 전에 무결성부터 확인 — 틀리면 DB를 건드리지 않고 멈춘다
    pool = get_pool()
    with pool.connection() as conn:
        for name, domain, aliases, codes in SCHOOLS:
            # 학교 upsert: email_domain이 유일 근거이므로 그것으로 충돌 판정.
            row = conn.execute(
                """
                INSERT INTO schools (name, aliases, email_domain)
                VALUES (%s, %s, %s)
                ON CONFLICT (email_domain)
                DO UPDATE SET name = EXCLUDED.name, aliases = EXCLUDED.aliases
                RETURNING id
                """,
                (name, aliases, domain),
            ).fetchone()
            school_id = row["id"]

            # 관리자 코드: (school_id, code) 조합이 이미 있으면 건너뛴다.
            for code in codes:
                exists = conn.execute(
                    "SELECT 1 FROM admin_codes WHERE school_id = %s AND code = %s",
                    (school_id, code),
                ).fetchone()
                if not exists:
                    conn.execute(
                        "INSERT INTO admin_codes (school_id, code) VALUES (%s, %s)",
                        (school_id, code),
                    )
            print(f"  · {name} ({domain}) — 코드 {len(codes)}개")
        conn.commit()


if __name__ == "__main__":
    print("학교 시드를 삽입/갱신합니다 (idempotent)...")
    seed()
    print("완료.")
