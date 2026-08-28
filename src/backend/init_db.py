"""스키마 생성 스크립트.

requirements.md("PostgreSQL Schema" 절)의 7테이블 + bedrock_logs DDL을 그대로 옮긴 정본이다.
legacy(tmp/legacy/app/db/models.py)는 draft_key 방식이라 chat_sessions·admin_codes·aliases가
없다 — 참고만 하고 .kiro/specs/complaint-assistant/requirements.md 를 정본으로 따른다.

재실행 안전(idempotent): 모든 CREATE에 IF NOT EXISTS 를 붙였다. 이미 있으면 건너뛴다.

실행:
    cd src/backend
    python init_db.py

DB URL은 core/config.py의 Settings.database_url 에서 읽는다 (환경변수 DATABASE_URL 또는 .env).
"""
from app.core.config import get_settings
from app.repo.pool import close_pool, get_pool

DDL = r"""
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    aliases TEXT[],                             -- 검색용 줄임말. 예: ['조선대', '조대']
    email_domain VARCHAR(255) UNIQUE NOT NULL,  -- 학교를 정하는 유일한 근거
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_codes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    code VARCHAR(64) NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    submitted_by_user_id INTEGER,              -- 내부 추적용, UI에는 절대 노출 안 함
    category VARCHAR(32) NOT NULL,
    location VARCHAR(255) NOT NULL,
    refined_title VARCHAR(255) NOT NULL,
    refined_body TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT '미확인'
        CHECK (status IN ('미확인','확인','처리중','해결완료','보류','거절','철회')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,                   -- 관리자 최초 열람 시각. NULL이면 아직 미확인
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 대화 세션. "과거 대화" 목록의 한 줄이 이것이다.
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    school_id INTEGER NOT NULL,                -- 접수 시 조인을 없애려 복제
    title VARCHAR(255),                        -- 압축이 갱신. NULL이면 "새 대화"
    is_manual_title BOOLEAN NOT NULL DEFAULT FALSE,
    context TEXT,                              -- 세션 주제 (압축된 맥락)
    compacted_upto INTEGER,                    -- 메시지 id. 이 id 이하는 context에 녹아 있다
    category VARCHAR(32),
    complaint_id INTEGER,                      -- 접수되면 연결. 차는 순간 읽기 전용
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
    FOREIGN KEY (school_id)    REFERENCES schools(id)    ON DELETE CASCADE,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id, updated_at DESC);

-- 학생-AI 대화 왕복 기록. 접수 전(정제 중)과 접수 후 모두 여기 남는다.
CREATE TABLE IF NOT EXISTS complaint_conversations (
    id SERIAL PRIMARY KEY,
    chat_session_id INTEGER,                   -- 작성 중 조회는 이걸로
    complaint_id INTEGER,                      -- 접수되면 채워진다. 게시판·관리자 조회는 이걸로
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','assistant')),
    content TEXT NOT NULL,
    choices JSONB,                             -- 그 턴에 제시한 선택지(칩). 새로고침 복원용
    refined_json JSONB,                        -- AI 확정안 턴에만. 되묻는 턴은 NULL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (complaint_id)    REFERENCES complaints(id)    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_session   ON complaint_conversations(chat_session_id, id);
CREATE INDEX IF NOT EXISTS idx_conv_complaint ON complaint_conversations(complaint_id, id);

-- 관리자 코멘트. 보류 전환 시 1건 필수 생성, 그 외에는 언제든 추가 가능한 누적 로그.
CREATE TABLE IF NOT EXISTS complaint_comments (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL,
    author_user_id INTEGER,                    -- 게시판 표시는 "관리자"로만 뭉뚱그림
    content TEXT NOT NULL,
    is_hold_reason BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bedrock 호출 기록. 대회 심사(Requirement 5)용.
CREATE TABLE IF NOT EXISTS bedrock_logs (
    id SERIAL PRIMARY KEY,
    school_id INTEGER,
    called_at TIMESTAMPTZ DEFAULT NOW(),
    model_id VARCHAR(128) NOT NULL,
    is_complete BOOLEAN NOT NULL,              -- 도구 호출이 성사됐는지
    latency_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_bedrock_called ON bedrock_logs(called_at DESC);
"""


def init_db() -> None:
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute(DDL)
        conn.commit()


if __name__ == "__main__":
    settings = get_settings()
    # 비밀번호가 URL에 있을 수 있으므로 전체 URL은 출력하지 않는다.
    print("스키마를 생성/확인합니다 (idempotent)...")
    try:
        init_db()
        print("완료: 8개 테이블 + 인덱스가 준비되었습니다.")
    finally:
        # 인터프리터 종료 전에 풀의 백그라운드 스레드를 정리한다
        # (Python 3.14는 종료 시점 스레드 join을 엄격히 막아 경고를 낸다).
        close_pool()
