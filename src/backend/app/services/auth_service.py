"""가입·로그인·계정 관리. 판단(도메인 매칭, 역할 결정)이 여기 산다.

호출하는 쪽: app/api/routes/auth.py, app/api/routes/schools.py
호출하는 것: repo.school_repo, repo.user_repo, session.login_session
정본: docs/backend-design.md §6, requirements.md Requirement 1.
"""
from app.schemas.auth import Me, SchoolOut


def list_schools() -> list[SchoolOut]:
    """가입 드롭다운용 학교 목록. 인증 불필요."""
    raise NotImplementedError


def signup(email: str, password: str, admin_code: str | None) -> tuple[int, str]:
    """가입. 역할은 코드가 정한다.

    흐름 (backend-design.md §6.1):
      1. email '@' 뒤 도메인 → school_repo.find_by_domain. 없으면 UnsupportedDomainError
      2. admin_code 비었으면 role='student'
         admin_code 있고 verify_admin_code 통과하면 role='admin'
         admin_code 있는데 불일치하면 InvalidAdminCodeError (조용히 student로 강등 안 함)
      3. bcrypt 해싱 (평문은 로그에도 안 남긴다)
      4. user_repo.create — 이메일 중복이면 EmailTakenError

    Returns:
        (user_id, role) — 라우터가 role로 첫 화면을 정할 수 있게.
    """
    raise NotImplementedError


def login(email: str, password: str) -> str:
    """로그인. 성공 시 로그인 세션 id(쿠키에 실을 값)를 반환한다.

    계정이 없어도 더미 해시를 한 번 대조하고 InvalidCredentialsError를 던진다 —
    응답 속도로 이메일 존재 여부가 새지 않게. "이메일 없음"과 "비밀번호 틀림"을
    구분하지 않는다 (둘 다 INVALID_CREDENTIALS).
    """
    raise NotImplementedError


def logout(login_sid: str) -> None:
    raise NotImplementedError


def get_me(user_id: int) -> Me:
    """current_user가 준 user_id로 표시용 정보 조립. school_name은 조인해서 채운다."""
    raise NotImplementedError


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    """현재 비밀번호 확인 후 변경. 불일치면 WrongPasswordError."""
    raise NotImplementedError


def delete_account(user_id: int, password: str) -> None:
    """탈퇴. 비밀번호 재확인 후 user_repo.delete.
    complaints.submitted_by_user_id는 FK SET NULL로 DB가 자동 처리 (민원은 익명으로 남음).
    """
    raise NotImplementedError


def verify_password(user_id: int, password: str) -> None:
    """철회·탈퇴 1단계용. 아무것도 바꾸지 않는다. 불일치면 WrongPasswordError.
    실패 횟수 제한을 둔다 (무제한 시도 방지).
    """
    raise NotImplementedError
