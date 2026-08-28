"""
초기 데이터 — 학교 목록과 관리자 코드
서버 최초 실행 시 DB가 비어있으면 삽입한다.
"""

from app.db.database import SessionLocal
from app.db.models import School

# 등록할 학교 목록 (학교명, 이메일 도메인, 관리자 코드)
SCHOOLS = [
    ("조선대학교", "chosun.ac.kr", "ADMIN-CHOSUN-2026"),
    ("서울대학교", "snu.ac.kr", "ADMIN-SNU-2026"),
    ("연세대학교", "yonsei.ac.kr", "ADMIN-YONSEI-2026"),
    ("고려대학교", "korea.ac.kr", "ADMIN-KOREA-2026"),
    # 개발/테스트용 도메인
    ("테스트대학교", "test.ac.kr", "ADMIN-TEST-0000"),
]


def seed_schools():
    db = SessionLocal()
    try:
        if db.query(School).count() > 0:
            return  # 이미 데이터가 있으면 건너뜀

        for name, domain, code in SCHOOLS:
            db.add(School(name=name, email_domain=domain, admin_code=code))
        db.commit()
        print(f"[seed] {len(SCHOOLS)}개 학교 데이터 삽입 완료")
    finally:
        db.close()
