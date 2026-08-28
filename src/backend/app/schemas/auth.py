"""인증 관련 요청/응답 타입. 정본: docs/api-contract.md #1~#7."""
from typing import Literal

from pydantic import BaseModel

Role = Literal["student", "admin"]


class SchoolOut(BaseModel):
    """GET /schools 응답 항목. id는 내려주지 않는다 — 가입에 school_id를 쓰지 않으므로."""

    name: str
    email_domain: str
    aliases: list[str]


class SignupIn(BaseModel):
    email: str
    password: str
    admin_code: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountIn(BaseModel):
    password: str


class AdminCodeIn(BaseModel):
    """POST /auth/admin-code — 가입 후 교직원 인증(학생 → 관리자 승격).
    역할 판정 근거는 가입 때와 같이 코드 하나뿐이다."""

    admin_code: str


class VerifyIn(BaseModel):
    """POST /auth/verify-password 요청. 되돌릴 수 없는 동작 전 본인 확인만 한다.
    아무것도 바꾸지 않는다 (api-contract #7-1)."""

    password: str


class SignupOut(BaseModel):
    """POST /auth/signup 응답 (api-contract #2). role은 프론트가 첫 화면을
    학생/관리자로 가르는 데 쓴다 — 버리지 않고 함께 내려준다."""

    user_id: int
    role: Role


class Me(BaseModel):
    """GET /auth/me 응답. school_id는 내려주지 않는다 — 프론트가 쓸 일이 없다."""

    user_id: int
    email: str
    role: Role
    school_name: str
