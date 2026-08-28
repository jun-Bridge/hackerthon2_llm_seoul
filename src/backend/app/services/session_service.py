"""대화 세션 조율. 이 서비스가 llm·repo·session(Redis)을 한데 엮는다.

호출하는 쪽: app/api/routes/session.py
호출하는 것: llm.client, repo.chat_session_repo, repo.conversation_repo,
             repo.bedrock_log_repo, session.turn_lock, session.compact_lock,
             session.chip_state, llm.choices.merge_choices
정본: docs/backend-design.md §7, §7-1, §7-2.
"""
from app.schemas.session import (
    RefineResultOut,
    SessionDetailOut,
    SessionSummaryOut,
    SubmitOut,
)


def create_session(user_id: int, school_id: int) -> int:
    """새 대화 세션. 빈 세션이 이미 있으면 재사용 (repo.get_or_reuse_empty)."""
    raise NotImplementedError


def list_sessions(user_id: int) -> list[SessionSummaryOut]:
    """"과거 대화" 목록. 메시지 없는 세션 제외, 최신순."""
    raise NotImplementedError


def get_session(session_id: int, user_id: int) -> SessionDetailOut:
    """세션 하나 열기. require_owner로 소유권 확인(아니면 404).
    현재 step·choices·preview를 함께 준다 (새로고침 복원용) — 정본은 DB의
    마지막 assistant 턴, Redis chip_state는 캐시.
    """
    raise NotImplementedError


def send_message(session_id: int, user_id: int, text: str) -> RefineResultOut:
    """한 턴. 이 서비스의 핵심 경로.

    흐름 (backend-design.md §7-1.3):
      0. require_owner. 접수된 세션이면 SessionClosedError. 공백/2000자 초과/직전과
         동일 발화는 모델 부르기 전에 걸러낸다 (VALIDATION_FAILED).
      1. turn_lock.acquire — 실패하면 TurnInProgressError(409)
      2. 학생 발화를 conversation_repo.add_turn으로 먼저 저장 (LLM 실패해도 남는다)
      3. 맥락 조립: chat_session.context + compacted_upto 이후 버퍼
      4. **DB 커넥션 반납** 후 llm.client.refine 호출 (수 초 붙들면 풀이 마른다)
      5. bedrock_log_repo.add (school_id는 chat_session에서)
      6-a. ask_followup이면: merge_choices → assistant 턴 저장(choices 포함)
           → chip_state.bump_if_same로 반복 판정 (2회 예시, 4회 CONVERSATION_STUCK)
      6-b. classify_and_refine이면: refined_json과 함께 assistant 턴 저장
           → chat_session_repo.update_meta로 제목·카테고리 갱신
           → is_manual_title=TRUE면 제목은 안 덮어씀
      7. turn_lock.release (finally — 실패로 끝나도)
      8. (백그라운드) 미압축 분량이 임계치 넘으면 compact()
    """
    raise NotImplementedError


def submit(session_id: int, user_id: int) -> SubmitOut:
    """정식 접수. 한 트랜잭션에 넷 (backend-design.md §7.7):

      0. require_owner. 이미 접수된 세션이면 SessionClosedError
      1. conversation_repo.get_last_refined — 없으면 DraftNotCompleteError
      2. [트랜잭션] complaint_repo.create (status='미확인', school_id·작성자는 세션 행에서)
                 → conversation_repo.link_to_complaint (그 세션 대화 전체에 complaint_id)
                 → chat_session_repo.mark_submitted (읽기 전용화)
                 → chat_session_repo.create (다음 세션 발급)
      3. 확정안을 요청 본문으로 받지 않는다 — 서버가 저장된 마지막 값을 쓴다 (위조 방지)

    Returns:
        SubmitOut(complaint_id, next_session_id)
    """
    raise NotImplementedError


def compact(session_id: int) -> None:
    """백그라운드 압축. compact_lock.acquire로 직렬화. 대상 구간을 시작 시점에 고정하고
    chat_session_repo.update_compacted의 WHERE compacted_upto=from 으로 경쟁을 막는다.
    실패해도 기존 값 유지 + 다음 턴 재시도 (턴 응답에는 영향 없음).
    """
    raise NotImplementedError
