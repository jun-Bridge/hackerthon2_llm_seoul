from datetime import datetime

from pydantic import BaseModel


class DraftOut(BaseModel):
    draft_key: str


class SendMessageIn(BaseModel):
    message: str


class RefinePreview(BaseModel):
    category: str
    location: str
    refined_title: str
    refined_body: str


class RefineResultOut(BaseModel):
    is_complete: bool
    follow_up_question: str | None = None
    preview: RefinePreview | None = None


class SubmitOut(BaseModel):
    complaint_id: int
    next_draft_key: str


class ConversationTurnOut(BaseModel):
    role: str   # student | assistant
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
