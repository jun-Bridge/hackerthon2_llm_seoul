# Tasks — UniVoice (학교별 익명 캠퍼스 민원 서비스)

## M0: 대회 환경 검증

### TASK-001: Bedrock API 연결 테스트
**Depends on**: -
**Status**: OPEN

**Description**:
AWS Bedrock API 호출이 성공하는지, 도구 호출을 지원하는지 검증합니다.

**Acceptance Criteria**:
- [ ] `bedrock_simple_test.py`로 `global.anthropic.claude-sonnet-5` 텍스트 응답 수신 확인
- [ ] `boto3.client('bedrock-runtime')` 호출 시 리전을 지정하지 않음 (Instance Profile이 자동 처리)
- [ ] 도구 호출(tool_choice 미지정, auto) 요청 시 `tool_use` 블록 반환 확인
- [ ] 도구를 호출하지 않고 텍스트로만 답하는 경우도 확인 (되묻기 시나리오 사전 검증)

**Files to modify**:
- `bedrock_simple_test.py` (기존 파일 존재 — 로직 유지, 모델 ID만 확인)

---

### TASK-002: EC2 인스턴스 설정 및 접속
**Depends on**: -
**Status**: OPEN

**Description**:
대회 제공 EC2 인스턴스에 SSH로 접속하고 기본 환경을 설정합니다.

**Acceptance Criteria**:
- [ ] `hackathon-e1-t01-key.pem`으로 SSH 접속 성공 (이미 확보됨 — `connectionTest/`)
- [ ] Python 3.11+, git, pip 사용 가능 확인
- [ ] 보안 그룹에서 포트 8501 개방 확인 (이미 구성됨)

---

### TASK-003: 프로젝트 구조 생성 및 PostgreSQL 스키마 초기화
**Depends on**: -
**Status**: OPEN

**Description**:
웹 앱 디렉토리 구조와 PostgreSQL 스키마(학교/도메인/관리자코드/계정/민원/대화)를 생성합니다.

**Acceptance Criteria**:
- [ ] `app.py`, `lib/`, `pages/`, `data/` 생성
- [ ] `requirements.txt`: `fastapi`, `uvicorn[standard]`, `psycopg[binary,pool]`, `redis`, `boto3`, `bcrypt`
- [ ] `.gitignore`에 `data/*.db`, `*.pem` 추가
- [ ] `init_db.py` 실행 시 5개 테이블 생성: `schools`, `admin_codes`, `users`, `complaints`, `complaint_conversations`, `complaint_comments`
- [ ] `complaints.status` CHECK 제약이 `('미확인', '확인', '처리중', '해결완료', '보류', '거절', '철회')` 7종을 포함
- [ ] `complaints.confirmed_at` 컬럼 존재 (기본 NULL)

**Files to create**:
- `app.py`, `lib/__init__.py`, `lib/database_manager.py`, `lib/auth_manager.py`,
  `lib/bedrock_client.py`, `lib/complaint_service.py`,
  `pages/student_view.py`, `pages/admin_view.py`,
  `requirements.txt`, `init_db.py`

**init_db.py**:
```python
import PostgreSQL3
from pathlib import Path

def init_database():
    Path("data").mkdir(exist_ok=True)
    conn = PostgreSQL3.connect("data/app.db")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS schools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            email_domain TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admin_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            school_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            school_id INTEGER NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS complaints (
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
            confirmed_at TIMESTAMP,
            FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
            FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS complaint_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER,
            chat_session_id INTEGER,      -- 접수 전 조회는 이걸로
            role TEXT NOT NULL CHECK(role IN ('student', 'assistant')),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS complaint_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER NOT NULL,
            author_user_id INTEGER,
            content TEXT NOT NULL,
            is_hold_reason BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
            FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    """)
    conn.commit()
    conn.close()
    print("✓ 데이터베이스 초기화 완료")

if __name__ == "__main__":
    init_database()
```

---

### TASK-004: 학교/도메인/관리자코드 시드 스크립트
**Depends on**: TASK-003
**Status**: OPEN

**Description**:
데모용 학교 여러 개, 이메일 도메인, 관리자 코드를 미리 심습니다. 가입 화면에는 학교 생성 UI가 없으므로 이 스크립트가 유일한 학교 등록 경로입니다.

**Acceptance Criteria**:
- [ ] `seed_schools.py` 실행 시 최소 2개 학교가 들어간다 (교차 격리 데모용)
- [ ] 각 학교에 이메일 도메인 1개, 관리자 코드 1~2개가 배정된다
- [ ] 재실행해도 중복 삽입되지 않는다 (`INSERT OR IGNORE` 또는 존재 체크)

**Files to create**:
- `seed_schools.py`

**Implementation**:
```python
# seed_schools.py
import PostgreSQL3

SCHOOLS = [
    {"name": "조선대학교", "domain": "chosun.ac.kr", "codes": ["CSU-ADM-01", "CSU-ADM-02"]},
    {"name": "서울대학교", "domain": "snu.ac.kr", "codes": ["SNU-ADM-01"]},
]

def seed():
    conn = PostgreSQL3.connect("data/app.db")
    for school in SCHOOLS:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO schools (name, email_domain) VALUES (?, ?)",
            (school["name"], school["domain"])
        )
        school_id = cursor.lastrowid or conn.execute(
            "SELECT id FROM schools WHERE email_domain = ?", (school["domain"],)
        ).fetchone()[0]

        for code in school["codes"]:
            exists = conn.execute(
                "SELECT 1 FROM admin_codes WHERE school_id = ? AND code = ?",
                (school_id, code)
            ).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO admin_codes (school_id, code) VALUES (?, ?)",
                    (school_id, code)
                )
    conn.commit()
    conn.close()
    print(f"✓ {len(SCHOOLS)}개 학교 시드 완료")

if __name__ == "__main__":
    seed()
```

---

## M1: 계정 & 학교 시스템

### TASK-101: DatabaseManager 계정/학교 기능 구현
**Depends on**: TASK-004
**Status**: OPEN

**Description**:
이메일 도메인 매칭, 관리자 코드 검증, 계정 CRUD를 구현합니다.

**Acceptance Criteria**:
- [ ] `find_school_by_email(email)`: `@` 뒤 도메인으로 학교 조회, 없으면 `None`
- [ ] `verify_admin_code(school_id, code)`: 해당 학교 코드 목록에 있는지 확인
- [ ] `create_user(school_id, email, password, role)`: bcrypt 해싱 후 저장
- [ ] `authenticate_user(email, password)`: 성공 시 `{id, school_id, role}` 반환
- [ ] `verify_password(user_id, password)`: 철회 시 재사용할 별도 메서드
- [ ] `change_password`, `delete_user` 구현

**Files to modify**:
- `lib/database_manager.py`

---

### TASK-102: 가입/로그인 UI 구현 (도메인 자동 매칭)
**Depends on**: TASK-101
**Status**: OPEN

**Description**:
학교 선택 UI 없이 이메일만으로 가입되는 폼을 만듭니다.

**Acceptance Criteria**:
- [ ] 가입 폼: 이메일, 비밀번호(8자+), 역할(학생/관리자) 라디오
- [ ] 역할이 관리자면 코드 입력 필드가 나타남
- [ ] 이메일 도메인이 시드된 학교와 매칭 안 되면 "지원하지 않는 학교 이메일입니다" 에러
- [ ] 관리자 코드가 불일치하면 가입 차단
- [ ] 로그인 성공 시 Redis에 세션을 만들고(`user_id`·`school_id`·`role`) HttpOnly 쿠키로 세션 id를 내려준다
- [ ] 로그아웃 버튼으로 세션 초기화

**Files to modify**:
- `lib/auth_manager.py`, `app.py`

---

### TASK-103: 역할 기반 화면 분기
**Depends on**: TASK-102
**Status**: OPEN

**Description**:
로그인한 `role`에 따라 학생 화면 또는 관리자 화면만 보이게 고정합니다. (목업의 뷰 스위처는 만들지 않음)

**Acceptance Criteria**:
- [ ] `role == 'student'`이면 `pages/student_view.py`만 렌더링
- [ ] `role == 'admin'`이면 `pages/admin_view.py`만 렌더링
- [ ] URL 조작이나 새로고침으로도 다른 role 화면에 접근 불가

**Files to modify**:
- `app.py`

---

## M2: AI 민원 변환 (대화형)

### TASK-201: BedrockClient — 되묻기/확정 분기 구현
**Depends on**: TASK-001
**Status**: OPEN

**Description**:
`tool_choice`를 강제하지 않고, 모델이 정보 부족 시 텍스트로 되묻거나 충분하면 도구를 호출하도록 구현합니다.

**Acceptance Criteria**:
- [ ] `CATEGORIES` 상수 (고정 7개 목록)
- [ ] `_refine_tool_schema()`: category(enum)/location/refined_title/refined_body, 설명에 "충분할 때만 호출" 명시
- [ ] `refine_complaint(conversation)`: `tool_use` 블록이 있으면 `{is_complete: True, ...}`, 없으면 텍스트를 `{is_complete: False, follow_up_question}`으로 반환
- [ ] Bedrock 호출 실패 시 `BedrockRefineError` 발생

**Files to modify**:
- `lib/bedrock_client.py`

---

### TASK-202: ComplaintService — 대화 왕복 조율
**Depends on**: TASK-201, TASK-101
**Status**: OPEN

**Description**:
학생 메시지마다 대화를 기록하고 Bedrock을 호출해 다음 턴을 조율합니다.

**Acceptance Criteria**:
- [ ] `send_message(session_id, student_message)`: 학생 발화 기록 → 맥락(요약+버퍼) 로드 → `refine` 호출 → AI 응답·선택지 기록 → 결과 반환
- [ ] `conversation_repo.add`, `conversation_repo.list` 구현 (chat_session_id 기준)
- [ ] `is_complete=False`이면 `follow_up_question`을 AI 메시지로 기록
- [ ] `is_complete=True`이면 요약 메시지("[정리 완료] {제목}")를 AI 메시지로 기록

**Files to modify**:
- `lib/complaint_service.py`, `lib/database_manager.py`

---

### TASK-203: 학생 채팅 UI (대화형 정제)
**Depends on**: TASK-202, TASK-103
**Status**: OPEN

**Description**:
학생이 자연어로 입력하고, 부족하면 AI가 되묻고, 충분하면 미리보기가 뜨는 채팅 UI를 구현합니다.

**Acceptance Criteria**:
- [ ] 새 작성 시작 시 `POST /chat-sessions`로 세션 행을 만든다 (소유자는 그 행에 남는다)
- [ ] `st.chat_input()`으로 입력 → `ComplaintService.send_message()` 호출
- [ ] 대화 이력을 `st.chat_message()`로 시간순 표시
- [ ] `is_complete=False`: 다음 입력을 계속 받음 (잠금 없음)
- [ ] `is_complete=True`: 미리보기 카드(카테고리/위치/제목/본문) + "정식 접수하기" 버튼 표시

**Files to modify**:
- `pages/student_view.py`

---

### TASK-204: 정식 접수 처리
**Depends on**: TASK-203
**Status**: OPEN

**Description**:
"정식 접수하기" 클릭 시에만 `complaints` 테이블에 저장하고, 대화 기록에 `complaint_id`를 연결합니다.

**Acceptance Criteria**:
- [ ] `ComplaintService.submit()` → `db.create_complaint()` 호출
- [ ] 접수 성공 시 그 세션의 모든 대화 행에 `complaint_id`가 채워진다 (두 FK가 모두 채워진 상태)
- [ ] 접수 후 새 세션을 발급해 다음 민원 작성이 이전 대화와 섞이지 않음. 접수된 세션은 읽기 전용
- [ ] 접수 직후 게시판이 재조회되어 새 항목이 보임

**Files to modify**:
- `pages/student_view.py`, `lib/complaint_service.py`

---

## M3: 학교별 게시판 & 철회

### TASK-301: 학생 게시판 (school_id 스코프)
**Depends on**: TASK-204
**Status**: OPEN

**Description**:
소속 학교 민원만 익명으로 나열합니다. 다른 학교 데이터는 조회 자체가 불가능해야 합니다.

**Acceptance Criteria**:
- [ ] `db.list_complaints(school_id)`가 항상 `school_id` WHERE 조건을 포함 (DB 레이어 필수 계약)
- [ ] `status != '철회'`인 항목만 반환
- [ ] 카테고리/위치/제목/본문/접수시각/상태 배지 표시 (미확인/확인/처리중/해결완료/보류/거절 6종 구분)
- [ ] "대화 원문 보기" 토글로 `complaint_conversations` 전체를 시간순 표시
- [ ] `db.get_comments(complaint_id)`로 관리자 코멘트를 함께 표시 (`is_hold_reason=True`인 코멘트는 "보류 사유"로 강조)
- [ ] `submitted_by_user_id`는 화면에 절대 출력하지 않음 (내 글 판별용으로만 클라이언트에서 비교)

**Files to modify**:
- `pages/student_view.py`, `lib/database_manager.py`

---

### TASK-302: 민원 철회 (비밀번호 재확인)
**Depends on**: TASK-301
**Status**: OPEN

**Description**:
본인이 접수한 민원에 한해 철회 버튼을 보여주고, 비밀번호 확인 후 상태를 `철회`로 전환합니다.

**Acceptance Criteria**:
- [ ] `complaint["submitted_by_user_id"] == 세션 상태(user_id)`인 항목에만 철회 버튼 표시
- [ ] 클릭 시 비밀번호 입력 폼 (`st.form`)이 뜬다
- [ ] `ComplaintService.withdraw(complaint_id, user_id, password)`:
  - 비밀번호 불일치 → "비밀번호가 올바르지 않습니다", 상태 불변
  - 일치 → `db.withdraw_complaint()` 호출, `status='철회'`
- [ ] `db.withdraw_complaint()`는 `submitted_by_user_id` 일치 조건을 WHERE에 포함 (타인 글 철회 방어)
- [ ] 철회 성공 시 게시판에서 즉시 사라짐 (`st.rerun()`)

**Files to modify**:
- `lib/complaint_service.py`, `lib/database_manager.py`, `pages/student_view.py`

---

## M4: 관리자 대시보드 (열람 자동확인 · 3단 결정 · 코멘트)

### TASK-401: DatabaseManager 상태 전이 메서드 구현
**Depends on**: TASK-301
**Status**: OPEN

**Description**:
상태 전이를 5개 메서드로 분리 구현합니다. 각 메서드는 선행 상태를 WHERE에 포함해 순서를 강제합니다.

**Acceptance Criteria**:
- [ ] `confirm_complaint(id, school_id)`: `WHERE status='미확인'` 조건으로 `확인`+`confirmed_at` 갱신. 이미 확인 이후 상태면 아무 것도 하지 않음 (재호출 안전)
- [ ] `accept_complaint(id, school_id) -> bool`: `WHERE status='확인'` 조건으로 `처리중` 전환, 실패 시 `False`
- [ ] `resolve_complaint(id, school_id) -> bool`: `WHERE status='처리중'` 조건으로 `해결완료` 전환
- [ ] `hold_complaint(id, school_id, author_user_id, reason) -> bool`: `WHERE status='확인'` 조건으로 `보류` 전환 **+ 같은 트랜잭션에서 `complaint_comments`에 `is_hold_reason=1` 코멘트 삽입**. 상태 전환이 실패하면 코멘트도 삽입되지 않음 (rollback)
- [ ] `reject_complaint(id, school_id) -> bool`: `WHERE status='확인'` 조건으로 `거절` 전환
- [ ] `add_comment(complaint_id, author_user_id, content)`: 상태 무관, 항상 `complaint_comments`에 INSERT
- [ ] `get_comments(complaint_id) -> list[dict]`: 시간순 반환, `is_hold_reason` 포함
- [ ] `get_complaint(id, school_id) -> dict | None`: 단일 민원 조회 (school_id 스코프)

**Files to modify**:
- `lib/database_manager.py`

---

### TASK-402: ComplaintService 상태 전이 래핑
**Depends on**: TASK-401
**Status**: OPEN

**Description**:
DB 메서드를 감싸 사용자용 성공/실패 메시지를 반환하고, 보류는 빈 사유를 서비스 레이어에서 먼저 거부합니다.

**Acceptance Criteria**:
- [ ] `open_detail(complaint_id, school_id)`: `db.confirm_complaint()` 호출 (반환값 없음, 사이드이펙트만)
- [ ] `accept/resolve/reject(complaint_id, school_id) -> (bool, str)`: 성공/실패 메시지 반환
- [ ] `hold(complaint_id, school_id, author_user_id, reason) -> (bool, str)`: `reason.strip()`이 빈 문자열이면 DB 호출 없이 `(False, "보류 사유를 입력해야 합니다")` 반환
- [ ] `add_comment(complaint_id, author_user_id, content) -> (bool, str)`: 빈 값 검증

**Files to modify**:
- `lib/complaint_service.py`

---

### TASK-403: 통계 카드 & 필터 탭
**Depends on**: TASK-103, TASK-301
**Status**: OPEN

**Description**:
소속 학교 민원의 전체/상태별 건수를 보여주고, 탭으로 목록을 좁힙니다.

**Acceptance Criteria**:
- [ ] `db.get_complaint_stats(school_id)`: 전체 + 6상태(미확인/확인/처리중/해결완료/보류/거절), 철회 제외
- [ ] 통계 카드 7개 렌더링
- [ ] 필터 탭 클릭 시 `db.list_complaints(school_id, status=선택값)`로 목록 갱신

**Files to modify**:
- `pages/admin_view.py`

---

### TASK-404: 관리자 목록 테이블 & 상세 화면 (열람 시 자동 확인)
**Depends on**: TASK-402, TASK-403
**Status**: OPEN

**Description**:
표에서 민원을 클릭하면 상세 화면이 열리면서 그 즉시 `미확인 → 확인`으로 자동 전환됩니다.

**Acceptance Criteria**:
- [ ] `st.columns()`로 ID/분류·위치/제목/접수시각/상태 렌더링 (조치 버튼은 상세 화면에만 — 목록에는 없음)
- [ ] 행 클릭 시 `세션 상태(selected_complaint_id)` 설정과 **같은 처리 흐름에서** `ComplaintService.open_detail(id, school_id)` 호출
- [ ] 상세 화면에 학생-AI 대화 전체(`get_conversation_by_complaint`)와 최종 카테고리/위치/제목/본문 표시
- [ ] 상세 화면을 다시 열어도(이미 확인 이후 상태) 에러 없이 정상 표시됨 (재호출 안전성 검증)
- [ ] 목록·상세 어디에도 철회 버튼은 없음 (관리자는 철회 불가)

**Files to modify**:
- `pages/admin_view.py`

---

### TASK-405: 결정 버튼 — 수락/보류/거절 (확인 상태에서만 노출)
**Depends on**: TASK-404
**Status**: OPEN

**Description**:
`확인` 상태의 민원 상세 화면에서만 수락/보류/거절 버튼을 노출합니다. 보류는 코멘트 입력 모달을 필수로 거칩니다.

**Acceptance Criteria**:
- [ ] 현재 상태가 `확인`일 때만 [수락][보류][거절] 세 버튼이 보임 (`미확인`·`처리중`·`해결완료`·`보류`·`거절` 상태에서는 안 보임)
- [ ] "수락" 클릭 → `ComplaintService.accept()` → 성공 시 `처리중`으로 전환, `st.rerun()`
- [ ] "보류" 클릭 → `세션 상태(hold_modal_open) = True`로 모달 오픈 (버튼 클릭 즉시 전환되지 않음)
- [ ] 모달 내 코멘트 입력창이 비어 있으면 "보류 확정" 버튼이 비활성화되거나, 제출 시 `ComplaintService.hold()`가 거부하고 에러 메시지 표시
- [ ] 모달에서 사유를 입력하고 확정하면 `보류` 전환 + 코멘트 등록이 동시에 반영, 모달 닫힘
- [ ] "거절" 클릭 → `ComplaintService.reject()` → 성공 시 즉시 `거절`로 전환 (코멘트 입력 없이 즉시)

**Files to modify**:
- `pages/admin_view.py`

---

### TASK-406: 처리중 → 해결완료 전환
**Depends on**: TASK-405
**Status**: OPEN

**Description**:
`처리중` 상태의 민원 상세 화면에는 "해결 완료" 버튼만 노출됩니다.

**Acceptance Criteria**:
- [ ] 현재 상태가 `처리중`일 때만 [해결 완료] 버튼이 보임
- [ ] 클릭 → `ComplaintService.resolve()` → 성공 시 `해결완료`로 전환, `st.rerun()`
- [ ] `해결완료`는 최종 상태 — 이후 버튼이 아무것도 안 보임 (코멘트 입력창은 계속 보임)

**Files to modify**:
- `pages/admin_view.py`

---

### TASK-407: 코멘트 상시 입력 (상태 무관)
**Depends on**: TASK-402, TASK-404
**Status**: OPEN

**Description**:
민원 상태와 무관하게 언제든 코멘트를 추가할 수 있는 입력창을 상세 화면에 배치합니다.

**Acceptance Criteria**:
- [ ] 상세 화면 하단에 코멘트 목록(`get_comments`, 시간순)과 입력창이 항상 존재
- [ ] `is_hold_reason=True`인 코멘트는 "보류 사유"로 시각적으로 구분 표시
- [ ] 입력창에 텍스트를 넣고 "등록" 클릭 → `ComplaintService.add_comment()` 호출 → `st.rerun()`
- [ ] `미확인`·`해결완료`·`거절` 등 어떤 상태에서도 코멘트 입력이 막히지 않음

**Files to modify**:
- `pages/admin_view.py`

---

## M5: 대회 제출

### TASK-501: TEAM_GUIDE.html 최신화
**Depends on**: -
**Status**: OPEN

**Description**:
기존 `connectionTest/TEAM_GUIDE.html`은 인프라 구축 가이드로 그대로 유효합니다. UniVoice 데모 시나리오만 추가합니다.

**Acceptance Criteria**:
- [ ] 데모 절차: 학생 가입(도메인 이메일) → 민원 대화 작성 → 접수 → 관리자 가입(코드 입력) → 상태 변경 → 학생 게시판 확인 → 철회 시연
- [ ] 시드된 데모 학교/도메인/관리자 코드 값 명시

**Files to modify**:
- `connectionTest/TEAM_GUIDE.html`

---

### TASK-502: README.md 업데이트
**Depends on**: -
**Status**: OPEN

**Description**:
프로젝트 루트 README를 UniVoice 기준으로 업데이트합니다.

**Acceptance Criteria**:
- [ ] 서비스 개요 (학교별 익명 민원 + AI 대화형 정제)
- [ ] 기술 스택 (Bedrock, FastAPI, PostgreSQL, Redis)
- [ ] 실행 방법: PostgreSQL·Redis 기동 → `init_db.py` → `seed_schools.py` → `uvicorn app.main:app --port 8501 --workers 4`
- [ ] 데모 계정/도메인/코드 안내
- [ ] 팀 정보

**Files to modify**:
- `README.md`

---

### TASK-503: DB 백업 스크립트
**Depends on**: TASK-003
**Status**: OPEN

**Description**:
PostgreSQL 데이터베이스를 주기적으로 백업합니다. (기존 설계 그대로 유지)

**Acceptance Criteria**:
- [ ] `backup_db.py`: 타임스탬프 파일명으로 `data/backups/`에 복사
- [ ] cron으로 매일 실행, 7일 이상 된 백업 자동 삭제

**Files to create**:
- `backup_db.py`

---

### TASK-504: EC2 배포 스크립트
**Depends on**: TASK-102
**Status**: OPEN

**Description**:
EC2에서 한 번에 배포하는 스크립트를 작성합니다.

**Acceptance Criteria**:
- [ ] `deploy.sh`: PostgreSQL·Redis 기동 확인 → pip install → `init_db.py` → `seed_schools.py` → nohup uvicorn 실행
- [ ] Instance Profile 인증이므로 AWS 자격증명 설정 단계 없음
- [ ] 접속 주소와 로그 확인 명령 출력

**Files to create**:
- `deploy.sh`

**Implementation**:
```bash
#!/bin/bash
set -e
echo "=== UniVoice 배포 스크립트 ==="
pip3 install -r requirements.txt
python3 init_db.py
python3 seed_schools.py
mkdir -p data
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4 \
  > server.log 2>&1 < /dev/null &
echo "배포 완료! 접속 주소: http://$(curl -s ifconfig.me):8501"
echo "로그 확인: tail -f server.log"
```

---

### TASK-505: Bedrock 사용량 모니터링
**Depends on**: TASK-201
**Status**: OPEN

**Description**:
Bedrock 호출 횟수를 로깅합니다.

**Acceptance Criteria**:
- [ ] `refine_complaint()` 호출마다 호출 시각/모델 ID를 `data/bedrock_usage.log`에 기록
- [ ] `is_complete` 여부(되묻기 vs 확정)도 함께 기록해 대화 왕복 빈도를 파악할 수 있게 함

**Files to modify**:
- `lib/bedrock_client.py`

---

## 완료 기준

- [ ] M0~M4 전체 완료
- [ ] EC2 공개 IP로 외부 접속 가능
- [ ] 데모: 학생 도메인 이메일 가입 → 대화형 작성(되묻기 최소 1회 포함) → 접수(미확인) → 관리자 코드로 가입 →
      목록에서 클릭(자동 확인) → 수락(처리중) → 해결 완료 / 또는 보류(코멘트 필수) → 학생 게시판 반영 확인 → 철회 시연
- [ ] 다른 학교 계정으로는 위 데이터가 전혀 보이지 않음을 확인
- [ ] `TEAM_GUIDE.html`, README 최신화

## 우선순위

**P0 (필수)**: M0, M1, M2, M3, M4
**P1 (중요)**: M5 (TASK-501, 502)
**P2 (선택)**: M5 (TASK-503, 504, 505)
