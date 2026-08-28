"""학교·도메인·별칭·관리자 코드 시드.

학교 몇 곳과 각 학교의 admin_codes를 넣는다. 재실행 안전(idempotent)하도록
email_domain UNIQUE 제약에 ON CONFLICT를 걸어 중복 삽입을 막는다.

실행:
    cd src/backend
    python init_db.py && python seed_schools.py

정본: docs/api-contract.md #1 listSchools (name/email_domain/aliases),
      requirements.md schools/admin_codes 스키마.
"""
from app.repo.pool import get_pool

# (학교명, 이메일 도메인, 별칭 리스트, [관리자 코드, ...])
SCHOOLS = [
    (
        "조선대학교",
        "chosun.ac.kr",
        ["조선대", "조대"],
        ["CHOSUN-ADMIN-2026", "CS-STAFF-01"],
    ),
    (
        "전북대학교",
        "jbnu.ac.kr",
        ["전북대", "전대"],
        ["JBNU-ADMIN-2026", "JB-STAFF-01"],
    ),
    (
        "광주과학기술원",
        "gist.ac.kr",
        ["지스트", "광기원", "GIST"],
        ["GIST-ADMIN-2026"],
    ),
]


def seed() -> None:
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
