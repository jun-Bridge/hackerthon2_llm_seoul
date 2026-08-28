"""가입·로그인·계정 관리. 판단(도메인 매칭, 역할 결정)이 여기 산다.

호출하는 쪽: app/api/routes/auth.py, app/api/routes/schools.py
호출하는 것: repo.school_repo, repo.user_repo, session.login_session
정본: docs/backend-design.md §6, requirements.md Requirement 1.

pool 사용법(B 규약): `with pool.transaction() as conn:` — pool 인자 없이 호출하면
내부에서 get_pool()을 자동으로 부른다. commit/rollback은 with 블록이 처리한다.
repo 함수는 첫 인자로 conn을 받는다. Redis(session/)는 conn을 넘기지 않는다.
"""
import bcrypt

from app.core.errors import (
    DomainError,
    EmailTakenError,
    InvalidAdminCodeError,
    InvalidCredentialsError,
    UnauthenticatedError,
    UnsupportedDomainError,
    WrongPasswordError,
)
from app.repo import pool, school_repo, user_repo
from app.schemas.auth import Me, SchoolOut
from app.session import login_session

# 계정이 없을 때도 비교를 수행해 응답 시간 차이로 존재 여부가 새지 않게 한다.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt()).decode()


# ── 비밀번호 해시 (auth_service 가 직접 담당) ─────────────────────

def _validate_password(plain: str) -> None:
    """비밀번호 규칙: 8자 이상 (api-contract 입력 검증). 위반 시 VALIDATION_FAILED(400).
    신규 비밀번호(가입·변경)에만 적용한다 — 로그인/재확인은 기존 값을 대조만 한다.
    """
    if not isinstance(plain, str) or len(plain) < 8:
        raise DomainError("비밀번호는 8자 이상이어야 합니다.")


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _domain_of(email: str) -> str:
    """이메일 '@' 뒤를 소문자·공백제거로 정규화한다."""
    return email.split("@")[-1].lower().strip()


# ── 학교 목록 ─────────────────────────────────────────────────────

def list_schools() -> list[SchoolOut]:
    """가입 드롭다운용 학교 목록. 인증 불필요."""
    with pool.transaction() as conn:
        rows = school_repo.list_all(conn)
    return [
        SchoolOut(
            name=r["name"],
            email_domain=r["email_domain"],
            aliases=r.get("aliases", []),
        )
        for r in rows
    ]


# ── 가입 ──────────────────────────────────────────────────────────

def signup(email: str, password: str, admin_code: str | None) -> tuple[int, str]:
    """가입. 역할은 코드가 정한다.

    Returns:
        (user_id, role)
    """
    email = email.lower().strip()
    _validate_password(password)  # 8자 규칙 — DB 접근 전에 거른다 (api-contract)
    domain = _domain_of(email)

    with pool.transaction() as conn:
        # 1. 도메인으로 학교 확정
        school = school_repo.find_by_domain(conn, domain)
        if school is None:
            raise UnsupportedDomainError("지원하지 않는 학교 이메일입니다.")

        # 2. 역할 결정 (코드 없으면 student, 있고 일치하면 admin, 불일치면 에러)
        role = "student"
        if admin_code and admin_code.strip():
            if not school_repo.verify_admin_code(conn, school["id"], admin_code.strip()):
                raise InvalidAdminCodeError("관리자 코드가 올바르지 않습니다.")
            role = "admin"

        # 3. 해싱 후 생성 (이메일 중복은 UNIQUE 제약 → EmailTakenError)
        password_hash = _hash_password(password)
        try:
            user_id = user_repo.create(conn, school["id"], email, password_hash, role)
        except Exception as exc:
            if _is_unique_violation(exc):
                raise EmailTakenError("이미 사용 중인 이메일입니다.") from exc
            raise

    return user_id, role


def promote_with_admin_code(user_id: int, admin_code: str) -> str:
    """이미 가입한 계정을 관리자 코드로 교직원(admin)으로 승격한다.

    역할을 정하는 근거는 가입 때와 똑같이 **코드 하나**다. 클라이언트가
    "저는 교직원입니다" 같은 값을 보내 스스로 주장할 수 없다.
    코드 대조는 그 계정의 소속 학교로 한정한다 — 다른 학교 코드로 승격되면
    학교 격리가 뚫린다.

    Returns:
        새 school_id (호출부가 세션을 다시 만들 때 쓴다)

    Raises:
        InvalidAdminCodeError: 코드가 비었거나 그 학교 코드와 일치하지 않을 때
    """
    code = (admin_code or "").strip()
    if not code:
        raise InvalidAdminCodeError("관리자 코드를 입력해 주세요.")

    with pool.transaction() as conn:
        school_id = user_repo.get_school_id(conn, user_id)
        if school_id is None:
            raise UnauthenticatedError("로그인이 필요합니다.")
        if not school_repo.verify_admin_code(conn, school_id, code):
            raise InvalidAdminCodeError("관리자 코드가 올바르지 않습니다.")
        user_repo.set_role(conn, user_id, "admin")

    return school_id


def _is_unique_violation(exc: Exception) -> bool:
    """DB 종류에 상관없이 UNIQUE 제약 위반을 감지한다."""
    text = str(exc).lower()
    return "unique" in text or "duplicate" in text


# ── 로그인 ────────────────────────────────────────────────────────

def login(email: str, password: str) -> str:
    """로그인. 성공 시 로그인 세션 id(쿠키에 실을 값)를 반환한다.
    이메일 없음/비밀번호 틀림을 구분하지 않는다 (둘 다 INVALID_CREDENTIALS).
    """
    email = email.lower().strip()

    with pool.transaction() as conn:
        user = user_repo.find_by_email(conn, email)

    if user is None:
        # 타이밍 공격 방지: 더미 해시로 한 번 대조 후 실패
        _verify_password(password, _DUMMY_HASH)
        raise InvalidCredentialsError("이메일 또는 비밀번호가 올바르지 않습니다.")

    if not _verify_password(password, user["password_hash"]):
        raise InvalidCredentialsError("이메일 또는 비밀번호가 올바르지 않습니다.")

    # Redis 세션 생성 (conn 안 넘김)
    return login_session.create(user["id"], user["school_id"], user["role"])


# ── 로그아웃 ──────────────────────────────────────────────────────

def logout(login_sid: str) -> None:
    login_session.delete(login_sid)


# ── 내 정보 ───────────────────────────────────────────────────────

def get_me(user_id: int) -> Me:
    """current_user가 준 user_id로 표시용 정보 조립. school_name은 조인해서 채운다.

    user_repo.find_me 는 schools 를 조인해 {user_id, email, role, school_name} 을 준다.
    세션은 유효한데 계정이 사라진 경우(예: 탈퇴 직후 남은 세션) None 이 오므로,
    표시할 계정이 없다 → UnauthenticatedError(401) 로 돌린다 (판단은 서비스 책임).
    """
    with pool.transaction() as conn:
        info = user_repo.find_me(conn, user_id)
    if info is None:
        raise UnauthenticatedError("로그인이 필요합니다.")
    return Me(
        user_id=info["user_id"],
        email=info["email"],
        role=info["role"],
        school_name=info["school_name"],
    )


# ── 비밀번호 변경 ─────────────────────────────────────────────────

def change_password(user_id: int, current_password: str, new_password: str) -> None:
    """현재 비밀번호 확인 후 변경. 불일치면 WrongPasswordError."""
    _validate_password(new_password)  # 새 비밀번호도 8자 규칙 (api-contract)
    with pool.transaction() as conn:
        current_hash = user_repo.get_password_hash(conn, user_id)
        if current_hash is None or not _verify_password(current_password, current_hash):
            raise WrongPasswordError("현재 비밀번호가 올바르지 않습니다.")
        user_repo.change_password(conn, user_id, _hash_password(new_password))


# ── 탈퇴 ──────────────────────────────────────────────────────────

def delete_account(user_id: int, password: str) -> None:
    """탈퇴. 비밀번호 재확인 후 user_repo.delete.
    complaints.submitted_by_user_id 는 FK SET NULL 로 DB가 자동 처리.
    """
    with pool.transaction() as conn:
        current_hash = user_repo.get_password_hash(conn, user_id)
        if current_hash is None or not _verify_password(password, current_hash):
            raise WrongPasswordError("비밀번호가 올바르지 않습니다.")
        user_repo.delete(conn, user_id)


# ── 비밀번호 재확인 (철회·탈퇴 1단계) ────────────────────────────

def verify_password(user_id: int, password: str) -> None:
    """아무것도 바꾸지 않는다. 불일치면 WrongPasswordError."""
    with pool.transaction() as conn:
        current_hash = user_repo.get_password_hash(conn, user_id)
    if current_hash is None or not _verify_password(password, current_hash):
        raise WrongPasswordError("비밀번호가 올바르지 않습니다.")
