# UniVoice — Design

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                 AWS Bedrock (Claude Sonnet 5)             │
│    도구 호출: classify_and_refine_complaint (멀티턴)      │
└───────────────────────────┬────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │  FastAPI (uvicorn)   │
                 │  워커 N개 · :8501     │
                 │  정적 프론트도 서빙   │
                 └───┬──────────────┬───┘
                     │              │
        ┌────────────▼───┐   ┌──────▼──────┐
        │  PostgreSQL    │   │    Redis    │
        │  확정된 것      │   │ 살아있는 것  │
        ├────────────────┤   ├─────────────┤
        │ schools        │   │ sess:{id}   │
        │ admin_codes    │   │ draft:{k}:  │
        │ users          │   │   owner     │
        │ complaints     │   └─────────────┘
        │ ..._conversations │
        │ ..._comments   │
        │ bedrock_logs   │
        └────────────────┘
```

**워커가 여럿이라는 것의 의미**: LLM 호출이 수 초씩 걸린다. 워커가 하나면 한 사람이 민원을
정제하는 동안 다른 사람의 게시판 조회까지 막힌다. 워커를 늘려 그 대기가 서로를 막지 않게 한다.
**대신 프로세스 메모리에 상태를 둘 수 없다** — 다음 요청이 다른 워커로 갈 수 있으므로
세션은 Redis, 확정 데이터는 PostgreSQL에 둔다.

**역할 기반 화면 분기**: 목업 HTML은 상단 스위처로 학생/관리자 뷰를 자유 전환하지만, 실제 서비스에서는 로그인 세션의 `role`이 화면을 고정한다. 관리자 계정으로 로그인하면 관리자 대시보드만 보이고, 학생 계정은 작성+게시판만 보인다.

**변환이 대화형이라는 것의 의미**: 학생 입력 한 번으로 끝나는 원샷 변환이 아니다. Bedrock이 정보 부족을 판단하면 도구 호출 대신 텍스트로 되묻는다. 이 질문-답변 왕복이 `complaint_conversations`에 전부 쌓이고, 최종적으로 충분한 정보가 모이면 최종 미리보기가 뜬다.

**처리 상태가 열람/결정/진행 세 국면으로 나뉜다는 것의 의미**: 접수된 민원은 관리자가 아직 안 본 `미확인`으로 시작한다. 상세 화면을 여는 행위 자체가 `확인`으로 전환시키고(버튼 없음), `확인` 상태에서만 수락/보류/거절 결정이 가능해진다. 수락은 즉시 끝나는 게 아니라 `처리중`을 거쳐야 `해결완료`에 도달한다. 보류는 사유 코멘트가 없으면 전환 자체가 성립하지 않는다.

---

## Data Models

### ER 관계도

```
schools (학교)
  │ 1
  ├──< admin_codes (N)              [school_id FK, CASCADE]
  ├──< users (N)                    [school_id FK, CASCADE]
  │      │ 1
  │      └──< complaints (N)        [submitted_by_user_id FK, SET NULL]
  │             (익명성 때문에 UI에는 절대 노출되지 않음 — 철회 소유권 검증 전용)
  │
  └──< complaints (N)               [school_id FK, CASCADE]
         │ 1                         (모든 조회는 이 school_id로 스코프)
         ├──< complaint_conversations (N)  [complaint_id FK, CASCADE]
         │      (접수 전에는 complaint_id NULL, draft_key로만 묶여 있음)
         └──< complaint_comments (N)       [complaint_id FK, CASCADE]
                (author_user_id도 FK, ON DELETE SET NULL)
```

| 관계 | 종류 | 삭제 전파 | 이유 |
|---|---|---|---|
| school → users | 1:N | CASCADE | 학교 삭제 시 계정 정리 (시드 데이터 관리용, 운영 UI에는 없음) |
| school → admin_codes | 1:N | CASCADE | 학교와 함께 코드도 무의미해짐 |
| school → complaints | 1:N | CASCADE | 학교 삭제 시 소속 민원도 정리 |
| user → complaints (submitted_by_user_id) | 1:N | **SET NULL** | 민원 내용·상태·이력은 학교의 공공 기록이라 작성자 탈퇴와 무관하게 보존. 게시판은 이미 익명이라 표시에 영향 없음 |
| complaint → complaint_conversations | 1:N | CASCADE | 민원이 지워지면(현재 UI엔 없음) 대화도 무의미 |
| complaint → complaint_comments | 1:N | CASCADE | 위와 동일 |
| user → complaint_comments (author_user_id) | 1:N | SET NULL | 코멘트 작성 관리자가 탈퇴해도 코멘트 텍스트는 남음 (게시판엔 "관리자"로만 표시되므로 작성자 식별이 애초에 노출되지 않음) |

### PostgreSQL Schema

```sql
CREATE TABLE schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    email_domain TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    submitted_by_user_id INTEGER,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    refined_title TEXT NOT NULL,
    refined_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '미확인'
        CHECK(status IN ('미확인', '확인', '처리중', '해결완료', '보류', '거절', '철회')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,  -- 미확인→확인 자동전환 시각. NULL이면 아직 미확인
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE complaint_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER,
    draft_key TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);

CREATE TABLE complaint_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL,
    author_user_id INTEGER,
    content TEXT NOT NULL,
    is_hold_reason BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

**상태 전이 다이어그램**:
```
미확인 ──[상세 열람, 자동]──▶ 확인 ──[수락]──▶ 처리중 ──[해결 완료]──▶ 해결완료 (최종)
                                │
                                ├──[보류 + 코멘트 필수]──▶ 보류
                                │
                                └──[거절]──▶ 거절 (최종)

(모든 상태) ──[학생, 비밀번호 확인]──▶ 철회 (최종, 조회 시 항상 제외)
```
`미확인 → 확인`만 자동(열람의 부작용)이고 나머지는 전부 관리자의 명시적 버튼 클릭이다. `확인` 상태에서만 수락/보류/거절 세 버튼이 나타나며, `처리중` 이후에는 "해결 완료" 버튼 하나만 존재한다 (역방향 전환 없음 — Out of Scope).

---

## File Structure

> **대화 세션 테이블이 추가됐다.** `chat_sessions`(과거 대화 목록·세션주제·압축 경계)와
> `complaint_conversations`의 두 FK(`chat_session_id` SET NULL · `complaint_id` CASCADE) 구조는
> `requirements.md`의 스키마와 `docs/backend-design.md` §7이 정본이다.


```
hackerthon2_llm_1/
├─ app.py                        # 진입점: 인증 → role 분기
├─ bedrock_simple_test.py        # Bedrock 연결 테스트
├─ requirements.txt
├─ init_db.py                    # PostgreSQL 스키마 초기화
├─ seed_schools.py               # 학교/이메일 도메인/관리자 코드 데모 시드
├─ backup_db.py                  # DB 백업 (cron)
│
├─ lib/
│  ├─ __init__.py
│  ├─ database_manager.py        # 학교/계정/민원/대화/코멘트 CRUD
│  ├─ auth_manager.py            # 가입/로그인/역할 분기 UI
│  ├─ bedrock_client.py          # Bedrock 호출 + 도구 정의 (멀티턴)
│  └─ complaint_service.py       # 대화→정제→접수→상태전이→철회 흐름 조율
│
├─ pages/
│  ├─ student_view.py            # 대화형 작성 챗봇 + 학교 게시판 + 철회
│  └─ admin_view.py              # 통계 + 필터 테이블 + 상세(대화+코멘트) 뷰
│
├─ data/
│  ├─ app.db
│  └─ backups/
│
├─ docs/                         # 설계 문서 · 프론트·백 연결 규약
└─ .kiro/specs/complaint-assistant/
```

**기존 설계에서 제거된 것**: `document_core.py`, `tool_executor.py`(줄 단위 편집용), `proposal_manager.py`. 이 서비스는 문서를 줄 단위로 편집하지 않고, 민원 하나 = 대화 후 확정되는 레코드 하나이므로 제안/승인/diff 개념이 필요 없다.

---

## Session Container Rules (서버 세션 · 클라이언트 상태)

DB(영속)와 휘발성 상태의 경계를 구현 전에 못박는다. 로그인 세션은 HttpOnly 쿠키 + 서버 저장소라 새로고침을 견디고, 화면 상태(입력 중인 텍스트, 열어둔 모달)만 브라우저에 남아 새로고침에 사라진다. 어느 쪽에 둘지 헷갈리면 새로고침 시 데이터가 사라지거나 탭 간에 상태가 새는 사고가 난다.

### 세션에만 두는 것 (탭 닫으면 소멸, 재조회로 복구 불가)

| 키 | 내용 | 갱신 지점 |
|---|---|---|
| `logged_in`, `user_id`, `school_id`, `role` | 인증 결과 | 로그인/로그아웃 |
| `draft_key` | 접수 전 대화 임시 식별자 | 새 작성 시작, 접수 완료 후 재발급 |
| `preview_result` | AI 확정안 (미리보기) | `is_complete=True` 수신 시 |
| `selected_complaint_id` | 관리자가 연 상세 화면의 민원 ID | 목록 클릭 / 상세 닫기 |
| `hold_modal_open`, `hold_comment_draft` | 보류 코멘트 모달의 임시 입력값 | 보류 버튼 클릭 / 제출·취소 |
| `withdraw_target_id` | 철회 확인 폼이 열린 민원 ID | 철회 버튼 클릭 / 확인·취소 |

### 절대 세션에 두지 않고 매번 DB에서 다시 읽는 것

- **대화 전체** (`db.get_conversation(draft_key)` / `get_conversation_by_complaint(id)`) — 세션에는 `draft_key`/`complaint_id`만
- **민원 목록·통계·코멘트 목록** — 렌더링마다 재조회. 다른 사용자의 변경(다른 관리자가 방금 상태를 바꿈 등)을 반영하려면 캐시하면 안 됨
- **민원 상태 자체** — 어디에도 "현재 보고 있는 민원의 상태"를 복제해 들고 있지 않는다. 화면에 그릴 때마다 DB 값을 그대로 쓴다

### `미확인 → 확인` 자동전환과 세션의 관계

이 전환은 **세션이 아니라 DB 사이드 이펙트**로 구현한다. 관리자가 목록에서 민원을 클릭해 `selected_complaint_id`를 세션에 세팅하는 시점에, 같은 요청 안에서 `ComplaintService.open_detail(complaint_id, school_id)`를 호출해 DB의 `status`를 즉시 갱신한다. 세션 값(`selected_complaint_id`)은 "지금 어떤 화면을 보고 있나"만 기억하고, "그래서 상태가 바뀌었다"는 사실은 DB에만 있다 — 탭을 새로고침해도 확인 처리가 풀리지 않아야 하기 때문이다.

### draft_key 수명

- 학생이 새 민원 작성을 시작할 때만 `uuid4()`로 발급
- 같은 draft로 여러 왕복이 누적됨 (되묻기 전체가 하나의 draft)
- 접수 완료 시 해당 draft의 모든 대화 행이 `complaint_id`로 연결되고, 세션의 `draft_key`는 새 uuid로 교체 (다음 민원과 섞임 방지)
- 탭을 닫으면 미접수 draft는 유실 허용 (Out of Scope)

---

## Component Design

### 1. DatabaseManager

**책임**: 학교, 계정, 민원, 대화, 코멘트의 CRUD. 민원 관련 조회는 모두 `school_id`로 스코프된다.

```python
class DatabaseManager:
    def __init__(self, dsn: str = os.environ["DATABASE_URL"]):
        self.pool = psycopg_pool.ConnectionPool(dsn)   # 워커마다 커넥션 풀
        self.conn.execute("PRAGMA foreign_keys = ON")

    # --- 학교 / 도메인 / 관리자 코드 (시드 전용) ---
    def find_school_by_email(self, email: str) -> dict | None:
        domain = email.split('@')[-1].lower()
        cursor = self.conn.execute(
            "SELECT id, name FROM schools WHERE email_domain = ?", (domain,)
        )
        row = cursor.fetchone()
        return {"id": row[0], "name": row[1]} if row else None

    def verify_admin_code(self, school_id: int, code: str) -> bool:
        cursor = self.conn.execute(
            "SELECT 1 FROM admin_codes WHERE school_id = ? AND code = ?",
            (school_id, code)
        )
        return cursor.fetchone() is not None

    # --- 계정 ---
    def create_user(self, school_id: int, email: str, password: str, role: str) -> int:
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
        cursor = self.conn.execute(
            "INSERT INTO users (school_id, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (school_id, email, password_hash, role)
        )
        self.conn.commit()
        return cursor.lastrowid

    def authenticate_user(self, email: str, password: str) -> dict | None:
        cursor = self.conn.execute(
            "SELECT id, school_id, role, password_hash FROM users WHERE email = ?", (email,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        user_id, school_id, role, password_hash = row
        if bcrypt.checkpw(password.encode(), password_hash):
            return {"id": user_id, "school_id": school_id, "role": role}
        return None

    def verify_password(self, user_id: int, password: str) -> bool:
        cursor = self.conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return bool(row) and bcrypt.checkpw(password.encode(), row[0])

    def delete_user(self, user_id: int):
        self.conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        self.conn.commit()

    def change_password(self, user_id: int, new_password: str):
        password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt())
        self.conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        self.conn.commit()

    # --- 대화 ---
    def add_conversation_turn(self, draft_key: str, role: str, content: str, complaint_id: int | None = None):
        self.conn.execute(
            "INSERT INTO complaint_conversations (complaint_id, draft_key, role, content) VALUES (?, ?, ?, ?)",
            (complaint_id, draft_key, role, content)
        )
        self.conn.commit()

    def get_conversation(self, draft_key: str) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT role, content FROM complaint_conversations WHERE draft_key = ? ORDER BY created_at",
            (draft_key,)
        )
        return [{"role": r[0], "content": r[1]} for r in cursor.fetchall()]

    def get_conversation_by_complaint(self, complaint_id: int) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT role, content FROM complaint_conversations WHERE complaint_id = ? ORDER BY created_at",
            (complaint_id,)
        )
        return [{"role": r[0], "content": r[1]} for r in cursor.fetchall()]

    # --- 민원 생성/조회 (school_id로 항상 스코프) ---
    def create_complaint(self, school_id: int, user_id: int, draft_key: str,
                          category: str, location: str, title: str, body: str) -> int:
        """상태는 항상 '미확인'으로 시작 (DEFAULT)."""
        cursor = self.conn.execute(
            """INSERT INTO complaints
               (school_id, submitted_by_user_id, category, location, refined_title, refined_body)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (school_id, user_id, category, location, title, body)
        )
        complaint_id = cursor.lastrowid
        self.conn.execute(
            "UPDATE complaint_conversations SET complaint_id = ? WHERE draft_key = ?",
            (complaint_id, draft_key)
        )
        self.conn.commit()
        return complaint_id

    def list_complaints(self, school_id: int, status: str | None = None) -> list[dict]:
        """게시판/관리자 테이블 공용. 철회는 항상 제외."""
        query = """SELECT id, category, location, refined_title, refined_body,
                          status, created_at, confirmed_at, submitted_by_user_id
                   FROM complaints WHERE school_id = ? AND status != '철회'"""
        params = [school_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"

        cursor = self.conn.execute(query, params)
        cols = ["id", "category", "location", "refined_title", "refined_body",
                "status", "created_at", "confirmed_at", "submitted_by_user_id"]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]

    def get_complaint(self, complaint_id: int, school_id: int) -> dict | None:
        cursor = self.conn.execute(
            """SELECT id, category, location, refined_title, refined_body, status, created_at
               FROM complaints WHERE id = ? AND school_id = ?""",
            (complaint_id, school_id)
        )
        row = cursor.fetchone()
        if not row:
            return None
        cols = ["id", "category", "location", "refined_title", "refined_body", "status", "created_at"]
        return dict(zip(cols, row))

    def get_complaint_stats(self, school_id: int) -> dict:
        cursor = self.conn.execute(
            "SELECT status, COUNT(*) FROM complaints WHERE school_id = ? AND status != '철회' GROUP BY status",
            (school_id,)
        )
        counts = {row[0]: row[1] for row in cursor.fetchall()}
        return {
            "all": sum(counts.values()),
            "미확인": counts.get("미확인", 0),
            "확인": counts.get("확인", 0),
            "처리중": counts.get("처리중", 0),
            "해결완료": counts.get("해결완료", 0),
            "보류": counts.get("보류", 0),
            "거절": counts.get("거절", 0),
        }

    # --- 상태 전이 (전부 school_id를 WHERE에 포함) ---
    def confirm_complaint(self, complaint_id: int, school_id: int):
        """미확인 → 확인. 이미 확인 이후 상태면 아무것도 하지 않는다 (최초 열람만 기록)."""
        self.conn.execute(
            """UPDATE complaints SET status = '확인', confirmed_at = CURRENT_TIMESTAMP
               WHERE id = ? AND school_id = ? AND status = '미확인'""",
            (complaint_id, school_id)
        )
        self.conn.commit()

    def accept_complaint(self, complaint_id: int, school_id: int) -> bool:
        """확인 → 처리중. 확인 상태가 아니면 실패(rowcount=0)."""
        cursor = self.conn.execute(
            "UPDATE complaints SET status = '처리중' WHERE id = ? AND school_id = ? AND status = '확인'",
            (complaint_id, school_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def resolve_complaint(self, complaint_id: int, school_id: int) -> bool:
        """처리중 → 해결완료. 처리중이 아니면 실패."""
        cursor = self.conn.execute(
            "UPDATE complaints SET status = '해결완료' WHERE id = ? AND school_id = ? AND status = '처리중'",
            (complaint_id, school_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def hold_complaint(self, complaint_id: int, school_id: int, author_user_id: int, reason: str) -> bool:
        """확인 → 보류. reason은 필수(빈 문자열 금지, 호출 전 검증은 ComplaintService 책임).
        상태 전환과 사유 코멘트 생성을 하나의 트랜잭션으로 묶는다."""
        cursor = self.conn.execute(
            "UPDATE complaints SET status = '보류' WHERE id = ? AND school_id = ? AND status = '확인'",
            (complaint_id, school_id)
        )
        if cursor.rowcount == 0:
            self.conn.rollback()
            return False
        self.conn.execute(
            """INSERT INTO complaint_comments (complaint_id, author_user_id, content, is_hold_reason)
               VALUES (?, ?, ?, 1)""",
            (complaint_id, author_user_id, reason)
        )
        self.conn.commit()
        return True

    def reject_complaint(self, complaint_id: int, school_id: int) -> bool:
        """확인 → 거절. 코멘트는 선택(별도 add_comment로)."""
        cursor = self.conn.execute(
            "UPDATE complaints SET status = '거절' WHERE id = ? AND school_id = ? AND status = '확인'",
            (complaint_id, school_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def withdraw_complaint(self, complaint_id: int, user_id: int) -> bool:
        """학생 본인 확인 후 철회. 상태 무관하게 항상 허용 (Out of Scope 정책 참고)."""
        cursor = self.conn.execute(
            "UPDATE complaints SET status = '철회' WHERE id = ? AND submitted_by_user_id = ?",
            (complaint_id, user_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    # --- 코멘트 (상태와 무관하게 언제든 추가 가능) ---
    def add_comment(self, complaint_id: int, author_user_id: int, content: str):
        self.conn.execute(
            "INSERT INTO complaint_comments (complaint_id, author_user_id, content) VALUES (?, ?, ?)",
            (complaint_id, author_user_id, content)
        )
        self.conn.commit()

    def get_comments(self, complaint_id: int) -> list[dict]:
        cursor = self.conn.execute(
            """SELECT content, is_hold_reason, created_at FROM complaint_comments
               WHERE complaint_id = ? ORDER BY created_at""",
            (complaint_id,)
        )
        return [{"content": r[0], "is_hold_reason": bool(r[1]), "created_at": r[2]} for r in cursor.fetchall()]
```

**왜 상태 전이 메서드를 5개로 쪼갰는가**: 이전 설계의 `update_complaint_status(id, school_id, new_status)` 하나로는 "어느 상태에서 어느 상태로만 허용되는지"를 호출부(UI)가 알아야 했다. `confirm/accept/resolve/hold/reject`로 나누면 각 메서드의 `WHERE ... AND status = '<선행상태>'` 조건이 전이 규칙 자체를 DB 레이어에 강제한다 — 예를 들어 `미확인` 상태에 `accept_complaint`를 호출해도 `WHERE status = '확인'`에 안 걸려서 `rowcount=0`으로 조용히 실패한다. UI 버튼은 애초에 `확인` 상태에서만 노출되므로 정상 흐름에서 이 실패는 발생하지 않지만, 방어적 계층으로 기능한다.

### 2. BedrockClient — 멀티턴 분류+정제 (도구 호출은 강제하지 않음)

**책임**: 맥락(요약 + 최근 대화)을 Bedrock에 넘기고, 모델이 **도구 둘 중 하나를 고르게** 한다.

| 모델이 부른 것 | 뜻 |
|---|---|
| `ask_followup(missing, question, choices[])` | **부족하다** — 되물을 질문과 선택지를 함께 준다 |
| `classify_and_refine_complaint(...)` | 충분하다 — 확정안 |

**`tool_choice: {"type": "any"}`로 둘 중 하나를 반드시 부르게 강제한다.**

> 이전 설계는 "부족하면 도구를 안 부르고 일반 텍스트로 되묻는다"였고, 강제하면 모델이
> 억지로 필드를 채운다고 봤다. **그런데 부족을 '도구의 부재'로 읽으면 되묻는 문장만 얻고
> 선택지를 만들 수 없다.** 억지 채움은 도구를 나누는 것으로 막는다 —
> 부족할 때 부를 도구가 따로 있으면 확정 도구를 억지로 부를 이유가 없다.

상세 규격은 `docs/backend-design.md` §8을 정본으로 본다.

```python
CATEGORIES = ["냉난방 / 공조", "위생 / 배관", "전기 / 설비",
              "영상 / 기자재", "공간 / 편의", "안전 / 보안", "기타"]

class BedrockClient:
    def __init__(self, model_id: str = "global.anthropic.claude-sonnet-5"):
        self.bedrock = boto3.client('bedrock-runtime')  # 리전 지정 금지
        self.model_id = model_id

    def _refine_tool_schema(self) -> dict:
        return {
            "name": "classify_and_refine_complaint",
            "description": (
                "카테고리/위치/제목/본문을 확정할 수 있을 만큼 정보가 충분할 때만 호출한다. "
                "부족하면 이 도구를 호출하지 말고 대신 일반 텍스트로 되물어라."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": CATEGORIES},
                    "location": {"type": "string", "description": "건물명/층/호실 등 구체적 위치"},
                    "refined_title": {"type": "string", "description": "정중한 공문서 제목, 30자 내외"},
                    "refined_body": {"type": "string", "description": "현상/영향/요청 3단 구조 본문"}
                },
                "required": ["category", "location", "refined_title", "refined_body"]
            }
        }

    def refine_complaint(self, conversation: list[dict]) -> dict:
        """반환: is_complete=False → missing·question·choices / True → 확정안 + session_title"""
        messages = [
            {"role": "user" if t["role"] == "student" else "assistant", "content": t["content"]}
            for t in conversation
        ]
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "tools": [self._refine_tool_schema()],
            "messages": messages
        })
        response = self.bedrock.invoke_model(modelId=self.model_id, body=body)
        response_body = json.loads(response['body'].read())

        for block in response_body.get('content', []):
            if block.get('type') == 'tool_use':
                return {"is_complete": True, **block['input']}

        text_blocks = [b['text'] for b in response_body.get('content', []) if b.get('type') == 'text']
        follow_up = text_blocks[0] if text_blocks else "추가 정보를 알려주세요."
        return {"is_complete": False, **block["input"]}   # missing·question·choices
```

### 3. ComplaintService

**책임**: 대화 왕복 → 정제 → 접수 → 상태 전이(확인 자동화, 결정 검증) → 철회 흐름 조율. UI는 이 서비스만 호출한다.

```python
class ComplaintService:
    def __init__(self, db: DatabaseManager, bedrock: BedrockClient):
        self.db = db
        self.bedrock = bedrock

    def send_message(self, draft_key: str, student_message: str) -> dict:
        self.db.add_conversation_turn(draft_key, role='student', content=student_message)
        conversation = self.db.get_conversation(draft_key)
        result = self.bedrock.refine_complaint(conversation)

        ai_message = (f"[정리 완료] {result['refined_title']}" if result.get("is_complete")
                       else result.get("question", "추가 정보를 알려주세요."))
        self.db.add_conversation_turn(draft_key, role='assistant', content=ai_message)
        return result

    def submit(self, school_id: int, user_id: int, draft_key: str, refined: dict) -> int:
        return self.db.create_complaint(
            school_id=school_id, user_id=user_id, draft_key=draft_key,
            category=refined["category"], location=refined["location"],
            title=refined["refined_title"], body=refined["refined_body"],
        )

    def open_detail(self, complaint_id: int, school_id: int):
        """관리자가 상세 화면을 열 때마다 호출. 미확인이었다면 확인으로 자동 전환.
        이미 확인 이후 상태면 confirm_complaint 내부의 WHERE status='미확인' 조건에 안 걸려 아무 일도 없다."""
        self.db.confirm_complaint(complaint_id, school_id)

    def accept(self, complaint_id: int, school_id: int) -> tuple[bool, str]:
        ok = self.db.accept_complaint(complaint_id, school_id)
        return (True, "처리중으로 전환되었습니다") if ok else (False, "확인 상태의 민원만 수락할 수 있습니다")

    def resolve(self, complaint_id: int, school_id: int) -> tuple[bool, str]:
        ok = self.db.resolve_complaint(complaint_id, school_id)
        return (True, "해결 완료로 전환되었습니다") if ok else (False, "처리중 상태의 민원만 완료 처리할 수 있습니다")

    def hold(self, complaint_id: int, school_id: int, author_user_id: int, reason: str) -> tuple[bool, str]:
        """보류는 사유 코멘트가 필수. 빈 값이면 DB 호출 자체를 하지 않는다."""
        if not reason or not reason.strip():
            return False, "보류 사유를 입력해야 합니다"
        ok = self.db.hold_complaint(complaint_id, school_id, author_user_id, reason.strip())
        return (True, "보류로 전환되었습니다") if ok else (False, "확인 상태의 민원만 보류할 수 있습니다")

    def reject(self, complaint_id: int, school_id: int) -> tuple[bool, str]:
        ok = self.db.reject_complaint(complaint_id, school_id)
        return (True, "거절로 전환되었습니다") if ok else (False, "확인 상태의 민원만 거절할 수 있습니다")

    def add_comment(self, complaint_id: int, author_user_id: int, content: str) -> tuple[bool, str]:
        """상태와 무관하게 언제든 호출 가능."""
        if not content or not content.strip():
            return False, "코멘트 내용을 입력해주세요"
        self.db.add_comment(complaint_id, author_user_id, content.strip())
        return True, "코멘트가 등록되었습니다"

    def withdraw(self, complaint_id: int, user_id: int, password: str) -> tuple[bool, str]:
        if not self.db.verify_password(user_id, password):
            return False, "비밀번호가 올바르지 않습니다"
        success = self.db.withdraw_complaint(complaint_id, user_id)
        if not success:
            return False, "본인이 접수한 민원만 철회할 수 있습니다"
        return True, "민원이 철회되었습니다"
```

### 4. AuthManager

**책임**: 가입(이메일 도메인 → 학교 자동 매칭, 역할, 관리자 코드 검증), 로그인, 세션 스코프 고정.

```python
class AuthManager:
    def __init__(self, db: DatabaseManager):
        self.db = db

    def show_auth_page(self):
        tab_login, tab_signup = st.tabs(["로그인", "가입하기"])
        with tab_login:
            self._login_form()
        with tab_signup:
            self._signup_form()

    def _login_form(self):
        email = st.text_input("학교 이메일", key="login_email")
        password = st.text_input("비밀번호", type="password", key="login_password")
        if st.button("로그인", type="primary"):
            user = self.db.authenticate_user(email, password)
            if user:
                session_id = redis_session.create(
                    user_id=user["id"], school_id=user["school_id"], role=user["role"]
                )
                response.set_cookie("sid", session_id, httponly=True, samesite="lax")
                st.rerun()
            else:
                st.error("이메일 또는 비밀번호가 올바르지 않습니다")

    def _signup_form(self):
        email = st.text_input("학교 이메일 (예: student1@chosun.ac.kr)", key="signup_email")
        password = st.text_input("비밀번호 (8자 이상)", type="password", key="signup_password")
        role = st.radio("역할", ["student", "admin"], format_func=lambda r: "학생" if r == "student" else "관리자")

        admin_code = st.text_input("관리자 코드", type="password") if role == "admin" else None

        if st.button("가입하기", type="primary"):
            if len(password) < 8:
                st.error("비밀번호는 8자 이상이어야 합니다")
                return
            school = self.db.find_school_by_email(email)
            if not school:
                st.error("지원하지 않는 학교 이메일입니다. 소속 학교 이메일로 다시 시도해주세요.")
                return
            if role == "admin" and (not admin_code or not self.db.verify_admin_code(school["id"], admin_code)):
                st.error("관리자 코드가 올바르지 않습니다")
                return
            try:
                self.db.create_user(school["id"], email, password, role)
                st.success(f"{school['name']} 가입 완료! 로그인해주세요")
            except psycopg.errors.UniqueViolation:
                st.error("이미 존재하는 이메일입니다")

    def require_auth(self):
        if not request.session:      # 쿠키의 sid로 Redis 조회, 없으면
            self.show_auth_page()
            st.stop()

    def logout(self):
        for key in ['logged_in', 'user_id', 'school_id', 'role']:
            redis_session.delete(session_id)   # Redis에서 세션 삭제 + 쿠키 만료
        st.rerun()
```

**보안 노트**: 학교·이메일 도메인·관리자 코드는 가입 화면에서 생성되지 않는다. 전부 `seed_schools.py`로 배포 전에 심는다.

---

## UI Design

### app.py — 진입점 & 역할 분기

```python
# 라우터 의존성으로 인증을 강제한다
if user.role == "student":
    render_student_view()
elif user.role == "admin":
    render_admin_view()
```

### 학생 화면 (pages/student_view.py)

```
┌─────────────────────────────────────────────────────────┐
│  UniVoice · OO대학교              student@email [로그아웃] │
├───────────────────────────┬───────────────────────────────┤
│  AI 민원 변환 챗봇          │  실시간 익명 민원 처리 현황    │
│  [학생] 화장실 물 새요       │  #204 [냉난방] 처리중         │
│  [AI] 어느 건물 몇 층?      │  #203 [위생/배관] 보류         │
│  [학생] 학생회관 2층         │   💬 관리자: 부품 주문 중,    │
│  [AI] (최종안 요약)         │      1주 소요 예정             │
│  ┌ 최종안 미리보기 ┐        │  [철회]  ← 본인 글에만 표시    │
│  │ [정식 접수하기]         │  │                              │
│  └────────────────────────┘  │                              │
└───────────────────────────┴───────────────────────────────┘
```

**흐름**: 이전 버전과 동일 (draft_key 발급 → 대화 → 미리보기 → 접수 → 철회). 게시판 카드에는 이제 `db.get_comments(complaint_id)`를 함께 조회해 코멘트(특히 `is_hold_reason=True`인 보류 사유)를 표시한다.

### 관리자 화면 (pages/admin_view.py)

```
┌───────────────────────────────────────────────────────────────────┐
│  UniVoice · OO대학교                          admin@email [로그아웃] │
├───────────────────────────────────────────────────────────────────┤
│ [전체 12][미확인 3][확인 2][처리중 2][해결완료 4][보류 1][거절 0]     │
├───────────────────────────────────────────────────────────────────┤
│ [전체][미확인][확인][처리중][해결완료][보류][거절]                    │
│ ID │ 분류/위치 │ 제목 │ 접수시각 │ 상태                              │
│ #204│냉난방...│... │14:10    │미확인   ← 클릭하면 상세 열림+자동확인 │
├───────────────────────────────────────────────────────────────────┤
│ (상세 화면 — #204 클릭 후, 상태가 '확인'으로 바뀐 상태)                │
│  학생-AI 대화 전체 (시간순)                                          │
│  최종 정제 문서 (카테고리/위치/제목/본문)                             │
│  ──────────────────────────────                                    │
│  [✓ 수락]  [⏸ 보류]  [✗ 거절]     ← '확인' 상태에서만 노출           │
│  ──────────────────────────────                                    │
│  💬 코멘트 (2)                     ← 상태 무관 항상 노출             │
│    · (보류 사유) 부품 재고 확인 필요                                 │
│    · 창고에 문의함, 내일 답변 예정                                   │
│  [코멘트 입력창] [등록]                                              │
└───────────────────────────────────────────────────────────────────┘
```

**보류 클릭 시 뜨는 모달**:
```
┌─ 보류 처리 ──────────────────┐
│ 이 민원을 보류하는 이유를    │
│ 반드시 입력해주세요.         │
│ ┌───────────────────────┐   │
│ │ (코멘트 입력, 필수)     │   │
│ └───────────────────────┘   │
│        [취소]  [보류 확정]   │
└──────────────────────────────┘
```
"보류 확정" 버튼은 입력창이 비어 있으면 비활성화(`disabled=len(text.strip())==0`)하거나, 클릭 시 `ComplaintService.hold()`가 빈 값을 거부하고 에러를 띄운다 (두 방어선 모두 적용).

**흐름**:
1. `db.get_complaint_stats(school_id)` → 7개 통계 카드
2. 필터 탭 → `db.list_complaints(school_id, status=selected)`
3. 행 클릭 → `POST /admin/complaints/{id}/open` 호출. 상세를 받아오면서 미확인이면 확인으로 전환된다.
   응답으로 모달을 채운다 (조회처럼 보이지만 부작용이 있어 `GET`이 아니라 `POST`다 — 프리페치로 열지도 않은 민원이 확인 처리되는 것을 막는다)
4. 상세 화면에서 현재 상태를 다시 읽어 `확인`이면 수락/보류/거절 버튼, `처리중`이면 "해결 완료" 버튼만 노출
5. 보류 버튼 → 사유 입력 모달 → 제출 시 `POST /admin/complaints/{id}/hold` (body에 `reason`) → 성공 시 모달 닫고 목록·상세 갱신. 사유가 비면 전송하지 않는다
6. 수락/해결완료/거절 버튼 → 각각 `accept()`/`resolve()`/`reject()` 호출 → `st.rerun()`
7. 코멘트 입력창은 상태와 무관하게 항상 표시 → 제출 시 `ComplaintService.add_comment()` 호출
8. 목록/상세 어디에도 "철회" 버튼은 없음 (학생 전용)

---

## Data Flow

### 민원 대화 → 접수 (변경 없음)
```
학생 메시지 → send_message() → 대화 기록 → refine_complaint()
  → is_complete=False → 되묻기 반복
  → is_complete=True  → 미리보기 → "정식 접수" → submit() → create_complaint()
       (상태는 항상 '미확인'으로 시작)
```

### 관리자 열람 → 자동 확인
```
목록에서 민원 클릭
  → selected_complaint_id 세션에 저장
  → ComplaintService.open_detail(id, school_id) 호출 (같은 요청 내에서)
       → db.confirm_complaint(): status='미확인' 조건이 맞으면 '확인'+confirmed_at 기록
       → 이미 확인 이후 상태면 조건 불일치로 아무 변화 없음 (안전하게 재호출 가능)
  → st.rerun() → 상세 화면과 목록 통계 모두 최신 상태 반영
```

### 결정 버튼 (확인 상태에서만 노출)
```
[수락] → accept() → db.accept_complaint(): '확인'→'처리중'
[보류] → 모달에서 reason 입력 → hold(reason) → 빈 값이면 서비스 레이어에서 거부
                                → db.hold_complaint(): '확인'→'보류' + 코멘트 INSERT (단일 트랜잭션)
[거절] → reject() → db.reject_complaint(): '확인'→'거절'
```

### 처리중 이후
```
[해결 완료] → resolve() → db.resolve_complaint(): '처리중'→'해결완료'
```

### 코멘트 (상태 무관, 언제든)
```
코멘트 입력 → add_comment() → db.add_comment() INSERT (is_hold_reason=0)
```

### 철회 (변경 없음)
```
학생 "철회" → 비밀번호 확인 → withdraw() → status='철회' → 모든 목록에서 제외
```

---

## Error Handling

### Bedrock 호출 오류
```python
try:
    result = complaint_service.send_message(draft_key, text)
except BedrockRefineError:
    st.error("AI 응답 처리에 실패했습니다. 다시 시도해주세요.")
except botocore.exceptions.ClientError as e:
    code = e.response['Error']['Code']
    st.error("요청이 많습니다. 잠시 후 다시 시도하세요." if code == 'ThrottlingException' else f"Bedrock 오류: {e}")
```

### 가입/로그인 오류
- 이메일 중복 → "이미 존재하는 이메일입니다"
- 도메인 미등록 → "지원하지 않는 학교 이메일입니다"
- 관리자 코드 불일치 → 가입 차단

### 상태 전이 오류
- `accept/resolve/hold/reject`가 각각 선행 상태 조건에 안 맞으면 `rowcount=0` → 서비스 레이어가 `(False, "<상태>만 ~할 수 있습니다")` 반환. UI가 정상적으로 버튼을 상태별로만 노출하면 이 경로는 사실상 발생하지 않지만, 여러 탭에서 동시에 같은 민원을 조작하는 경쟁 상황(예: 관리자 두 명이 같은 민원을 동시에 처리)의 방어선이다.
- 보류 코멘트 빈 값 → "보류 사유를 입력해야 합니다", DB 호출 자체가 일어나지 않음

### 철회 오류
- 비밀번호 불일치 → "비밀번호가 올바르지 않습니다"
- 소유권 불일치 → "본인이 접수한 민원만 철회할 수 있습니다" (UI에서 버튼 자체를 안 보여주므로 방어적 계층)

### 권한 경계
- 모든 민원 조회/전이 쿼리는 `school_id`를 WHERE에 포함 (DB 레이어 필수 계약)
- 철회는 `submitted_by_user_id`를 WHERE에 포함
- 상태 전이 5종 메서드는 선행 상태를 WHERE에 포함 (전이 규칙을 DB 레이어에서 강제)

---

## Testing Strategy

### M2 검증 (대화형 정제) — 변경 없음
```python
def test_refine_asks_when_incomplete():
    result = bedrock_client.refine_complaint([{"role": "student", "content": "에어컨이 이상해요"}])
    assert result["is_complete"] is False

def test_refine_completes_after_followup():
    conversation = [
        {"role": "student", "content": "에어컨이 이상해요"},
        {"role": "assistant", "content": "어느 건물 몇 층인가요?"},
        {"role": "student", "content": "공학관 3층 실습실이요, 소리가 심해요"}
    ]
    result = bedrock_client.refine_complaint(conversation)
    assert result["is_complete"] is True
    assert result["category"] in CATEGORIES
```

### M3 검증 (학교 격리 / 철회) — 변경 없음, 생략

### M4 검증 (상태 전이 규칙)
```python
def test_new_complaint_starts_unconfirmed():
    school_id = seed학교("A대학교", "a.ac.kr")
    user_a = db.create_user(school_id, "a@a.ac.kr", "password1", "student")
    complaint_id = db.create_complaint(school_id, user_a, "draft-1", "기타", "위치", "제목", "본문")
    complaint = db.get_complaint(complaint_id, school_id)
    assert complaint["status"] == "미확인"

def test_opening_detail_auto_confirms():
    complaint_id = ...  # 미확인 상태로 생성
    complaint_service.open_detail(complaint_id, school_id)
    assert db.get_complaint(complaint_id, school_id)["status"] == "확인"

def test_accept_requires_confirmed_status():
    complaint_id = ...  # 아직 미확인
    ok, msg = complaint_service.accept(complaint_id, school_id)
    assert ok is False  # 미확인 상태에서는 수락 불가

def test_accept_then_resolve_sequence():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)      # 미확인 → 확인
    complaint_service.accept(complaint_id, school_id)           # 확인 → 처리중
    ok, _ = complaint_service.resolve(complaint_id, school_id)  # 처리중 → 해결완료
    assert ok is True
    assert db.get_complaint(complaint_id, school_id)["status"] == "해결완료"

def test_cannot_resolve_without_accept():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)  # 확인 상태까지만
    ok, msg = complaint_service.resolve(complaint_id, school_id)  # 처리중을 건너뜀
    assert ok is False

def test_hold_requires_reason():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)
    ok, msg = complaint_service.hold(complaint_id, school_id, admin_user_id, reason="")
    assert ok is False
    assert db.get_complaint(complaint_id, school_id)["status"] == "확인"  # 전환 안 됨

def test_hold_with_reason_creates_comment():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)
    complaint_service.hold(complaint_id, school_id, admin_user_id, reason="부품 재고 확인 필요")
    comments = db.get_comments(complaint_id)
    assert any(c["is_hold_reason"] for c in comments)

def test_comment_allowed_regardless_of_status():
    complaint_id = ...  # 미확인 상태
    ok, _ = complaint_service.add_comment(complaint_id, admin_user_id, "확인 예정입니다")
    assert ok is True  # 미확인 상태에서도 코멘트는 가능
```

### M4 검증 (school_id 경계) — 기존과 동일하게 유지, 전이 메서드에도 적용
```python
def test_accept_fails_across_schools():
    school_a_id = seed학교("A대학교", "a.ac.kr")
    school_b_id = seed학교("B대학교", "b.ac.kr")
    user_a = db.create_user(school_a_id, "a@a.ac.kr", "password1", "student")
    complaint_id = db.create_complaint(school_a_id, user_a, "draft-1", "기타", "위치", "제목", "본문")
    db.confirm_complaint(complaint_id, school_a_id)

    ok = db.accept_complaint(complaint_id, school_b_id)  # 다른 학교로 시도
    assert ok is False
    assert db.get_complaint(complaint_id, school_a_id)["status"] == "확인"  # 안 바뀜
```

---

## Performance Considerations

- Bedrock 응답 시간: 왕복당 2~4초
- 대화 왕복 수: 보통 1~3회
- 게시판/통계/코멘트 조회: < 50ms (PostgreSQL, 학교당 민원 수 적음)

---

## Security

- 비밀번호: bcrypt 해싱, 평문 저장 금지
- 관리자 코드: 시드 스크립트로만 생성
- 학교 스코프: 모든 민원 쿼리에서 `school_id` 필수
- 상태 전이: 각 메서드가 선행 상태를 WHERE에 포함해 순서를 우회한 전이를 DB 레벨에서 차단
- 철회 소유권: `submitted_by_user_id` 필수
- 익명성: `submitted_by_user_id`, 코멘트 `author_user_id`는 화면에 절대 표시하지 않음 (내부 로직 전용)
- EC2: Instance Profile로 Bedrock 인증, Access Key 없음

---

## Next Steps (Post-Competition)

1. 관리자 알림 (신규 민원 발생 시)
2. 학생에게 상태 변경 알림
3. 카테고리별/기간별 통계 대시보드
4. 이미지 첨부
5. 실시간 반영 고도화 (SSE — 현재 구조에서 바로 가능)
