"""
SQLAlchemy ORM 모델 — API 계약서 기준 테이블 설계
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _now():
    return datetime.now(timezone.utc)


# ── schools ───────────────────────────────────────────────────────
class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email_domain: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    # 관리자 코드 — 단순하게 테이블 대신 컬럼으로 관리
    admin_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="school")
    complaints: Mapped[list["Complaint"]] = relationship(
        "Complaint", back_populates="school"
    )


# ── users ─────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # student | admin
    school_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("schools.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    school: Mapped["School"] = relationship("School", back_populates="users")
    complaints: Mapped[list["Complaint"]] = relationship(
        "Complaint", back_populates="submitted_by"
    )
    comments: Mapped[list["ComplaintComment"]] = relationship(
        "ComplaintComment", back_populates="author"
    )


# ── complaints ────────────────────────────────────────────────────
class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("schools.id"), nullable=False
    )
    # 탈퇴 시 NULL — 민원 자체는 남는다
    submitted_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # LLM 정제 결과
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    refined_title: Mapped[str] = mapped_column(String(300), nullable=False)
    refined_body: Mapped[str] = mapped_column(Text, nullable=False)
    # 상태 — 미확인 | 확인 | 처리중 | 해결완료 | 보류 | 거절 | 철회
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="미확인")
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    school: Mapped["School"] = relationship("School", back_populates="complaints")
    submitted_by: Mapped["User | None"] = relationship(
        "User", back_populates="complaints"
    )
    conversations: Mapped[list["ComplaintConversation"]] = relationship(
        "ComplaintConversation", back_populates="complaint"
    )
    comments: Mapped[list["ComplaintComment"]] = relationship(
        "ComplaintComment", back_populates="complaint", order_by="ComplaintComment.created_at"
    )


# ── complaint_conversations ───────────────────────────────────────
class ComplaintConversation(Base):
    """
    민원 작성 대화 이력.
    draft_key 로 초안 단계에서 묶이고, 접수 후 complaint_id 가 채워진다.
    """

    __tablename__ = "complaint_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    draft_key: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # 접수 전에는 NULL, submit 후 채워진다
    complaint_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("complaints.id"), nullable=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # student | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # is_complete=True 인 assistant 턴에만 저장 (접수 시 꺼내 쓴다)
    refined_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    complaint: Mapped["Complaint | None"] = relationship(
        "Complaint", back_populates="conversations"
    )


# ── complaint_comments ────────────────────────────────────────────
class ComplaintComment(Base):
    __tablename__ = "complaint_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("complaints.id"), nullable=False
    )
    author_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_hold_reason: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    complaint: Mapped["Complaint"] = relationship(
        "Complaint", back_populates="comments"
    )
    author: Mapped["User"] = relationship("User", back_populates="comments")


# ── bedrock_logs ──────────────────────────────────────────────────
class BedrockLog(Base):
    """Bedrock 호출 로그 — 심사용. 민원 내용은 저장하지 않는다."""

    __tablename__ = "bedrock_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_id: Mapped[str] = mapped_column(String(100), nullable=False)
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    called_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
