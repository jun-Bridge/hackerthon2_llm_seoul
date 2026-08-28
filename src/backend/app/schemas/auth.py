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


class Me(BaseModel):
    """GET /auth/me 응답. school_id는 내려주지 않는다 — 프론트가 쓸 일이 없다."""

    user_id: int
    email: str
    role: Role
    school_name: str
