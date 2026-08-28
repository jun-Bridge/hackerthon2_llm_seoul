from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import (
    extract_university,
    hash_password,
    verify_password,
    create_access_token,
)
from app.db.database import get_db
from app.db.models import School, User
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    MeOut,
    SchoolOut,
    SignupIn,
    SignupOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _error(code: str, message: str, status_code: int = 400):
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )


# ── 1. 학교 목록 조회 (가입 화면 드롭다운용) ────────────────────────
@router.get("/schools", response_model=list[SchoolOut])
def list_schools(db: Session = Depends(get_db)):
    """
    가입 시 학교 드롭다운에 표시할 목록을 반환한다.
    인증 불필요 — 가입 전에 호출한다.
    """
    schools = db.query(School).order_by(School.name).all()
    return [
        SchoolOut(
            id=s.id,
            name=s.name,
            email_domain=s.email_domain,
        )
        for s in schools
    ]


# ── 2. 회원가입 ───────────────────────────────────────────────────
@router.post("/signup", response_model=SignupOut, status_code=201)
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)):
    domain = extract_university(body.email)
    school = db.query(School).filter(School.email_domain == domain).first()
    if not school:
        _error("UNSUPPORTED_DOMAIN", "지원하지 않는 학교 이메일입니다.")

    # 관리자 코드 검증
    if body.role == "admin":
        if not body.admin_code or body.admin_code != school.admin_code:
            _error("INVALID_ADMIN_CODE", "관리자 코드가 올바르지 않습니다.")

    # 이메일 중복 확인
    if db.query(User).filter(User.email == body.email).first():
        _error("EMAIL_TAKEN", "이미 사용 중인 이메일입니다.")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        school_id=school.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 가입 즉시 로그인
    token = create_access_token({"sub": str(user.id)})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=3600,
    )
    return SignupOut(user_id=user.id)


# ── 3. 로그인 ─────────────────────────────────────────────────────
@router.post("/login", response_model=MeOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        _error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)

    token = create_access_token({"sub": str(user.id)})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=3600,
    )
    return MeOut(
        user_id=user.id,
        email=user.email,
        role=user.role,
        school_name=user.school.name,
    )


# ── 4. 로그아웃 ───────────────────────────────────────────────────
@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie("access_token")


# ── 5. 내 정보 ────────────────────────────────────────────────────
@router.get("/me", response_model=MeOut)
def get_me(current_user: User = Depends(get_current_user)):
    return MeOut(
        user_id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        school_name=current_user.school.name,
    )


# ── 6. 비밀번호 변경 ──────────────────────────────────────────────
@router.patch("/password", status_code=204)
def change_password(
    body: ChangePasswordIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        _error("WRONG_PASSWORD", "현재 비밀번호가 올바르지 않습니다.", 401)

    current_user.password_hash = hash_password(body.new_password)
    db.commit()


# ── 7. 회원 탈퇴 ──────────────────────────────────────────────────
@router.delete("/me", status_code=204)
def delete_account(
    body: DeleteAccountIn,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.password, current_user.password_hash):
        _error("WRONG_PASSWORD", "비밀번호가 올바르지 않습니다.", 401)

    # complaints.submitted_by_user_id 는 SET NULL (모델에 ondelete='SET NULL' 설정됨)
    db.delete(current_user)
    db.commit()
    response.delete_cookie("access_token")
