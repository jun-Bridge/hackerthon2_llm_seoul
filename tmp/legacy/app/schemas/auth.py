from pydantic import BaseModel, field_validator


# 가입 화면 드롭다운용
class SchoolOut(BaseModel):
    id: int
    name: str
    email_domain: str  # 프론트가 이메일 조립에 사용

    model_config = {"from_attributes": True}


class SignupIn(BaseModel):
    email: str
    password: str
    role: str  # student | admin
    admin_code: str | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("student", "admin"):
            raise ValueError("role 은 student 또는 admin 이어야 합니다.")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("비밀번호는 8자 이상이어야 합니다.")
        return v


class SignupOut(BaseModel):
    user_id: int


class LoginIn(BaseModel):
    email: str
    password: str


class MeOut(BaseModel):
    user_id: int
    email: str
    role: str
    school_name: str

    model_config = {"from_attributes": True}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("새 비밀번호는 8자 이상이어야 합니다.")
        return v


class DeleteAccountIn(BaseModel):
    password: str
